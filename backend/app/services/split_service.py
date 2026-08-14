from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from app.extensions import db
from app.models import Category, ExpenseParticipant, Group, GroupMember, SharedExpense, Settlement

CENT = Decimal("0.01")

SHARED_EXPENSE_CATEGORY_NAME = "Despesas compartilhadas"
SETTLEMENT_INCOME_CATEGORY_NAME = "Recebimento de amigos"


def _to_cents(value: Decimal) -> int:
    return int((value * 100).to_integral_value(rounding=ROUND_HALF_UP))


def split_equal(total: Decimal, participant_ids: list) -> dict:
    """Divide total em partes exatas em centavos, distribuindo o resto de forma
    determinística (ordenada por id) para que a soma sempre bata com o total."""
    n = len(participant_ids)
    if n == 0:
        raise ValueError("Selecione ao menos um participante")

    total_cents = _to_cents(total)
    base_cents, remainder = divmod(total_cents, n)
    ordered = sorted(participant_ids, key=str)
    return {uid: Decimal(base_cents + (1 if i < remainder else 0)) / 100 for i, uid in enumerate(ordered)}


def validate_value_split(total: Decimal, shares: dict) -> None:
    """Modo 'por valores': soma dos valores informados precisa bater exatamente com o total."""
    total_cents = _to_cents(total)
    sum_cents = sum(_to_cents(v) for v in shares.values())
    if sum_cents != total_cents:
        raise ValueError(
            f"A soma dos valores (R$ {sum_cents / 100:.2f}) nao bate com o total (R$ {total_cents / 100:.2f})"
        )


def split_by_percentage(total: Decimal, percentages: dict) -> dict:
    """Modo 'por percentual': percentuais devem somar exatamente 100%. Usa o metodo do
    maior resto para distribuir os centavos de arredondamento de forma justa."""
    pct_sum = sum(percentages.values())
    if pct_sum != Decimal("100"):
        raise ValueError(f"As porcentagens somam {pct_sum}%, mas devem somar exatamente 100%")

    total_cents = _to_cents(total)
    ordered = sorted(percentages.items(), key=lambda kv: (-kv[1], str(kv[0])))

    raw = [(uid, total_cents * pct / Decimal("100")) for uid, pct in ordered]
    floors = [(uid, int(r), r - int(r)) for uid, r in raw]
    assigned = sum(f for _, f, _ in floors)
    remainder = total_cents - assigned

    floors.sort(key=lambda x: (-x[2], str(x[0])))
    shares = {}
    for i, (uid, base, _frac) in enumerate(floors):
        shares[uid] = Decimal(base + (1 if i < remainder else 0)) / 100
    return shares


def compute_group_net_balances(group_id) -> dict:
    """Positivo = a receber. Negativo = deve. Soma sempre exatamente 0."""
    net = defaultdict(lambda: Decimal("0"))
    expenses = SharedExpense.query.filter_by(group_id=group_id).all()
    for exp in expenses:
        net[exp.paid_by_id] += exp.total_amount
        for p in exp.participants:
            net[p.user_id] -= p.share_amount

    settlements = Settlement.query.filter_by(group_id=group_id).all()
    for s in settlements:
        net[s.payer_id] += s.amount
        net[s.receiver_id] -= s.amount

    return dict(net)


def compute_group_original_debts(group_id) -> list:
    """Dividas originais (nao simplificadas): para cada despesa, cada participante
    que nao pagou deve sua fatia diretamente para quem pagou aquela despesa
    especifica. Valores do mesmo par (devedor, credor) somam entre despesas
    diferentes, mas nunca cancelam contra o saldo de outro par -- ao contrario do
    saldo liquido, aqui alguem pode dever de um lado e ter a receber de outro ao
    mesmo tempo (ex: deve pro Junior E tem a receber da Maria, os dois aparecem).
    Acertos (settlements) abatem diretamente o par (payer, receiver) que pagaram."""
    pair_amounts = defaultdict(lambda: Decimal("0"))

    expenses = SharedExpense.query.filter_by(group_id=group_id).all()
    for exp in expenses:
        for p in exp.participants:
            if p.user_id == exp.paid_by_id:
                continue
            pair_amounts[(p.user_id, exp.paid_by_id)] += p.share_amount

    settlements = Settlement.query.filter_by(group_id=group_id).all()
    for s in settlements:
        pair_amounts[(s.payer_id, s.receiver_id)] -= s.amount

    debts = []
    for (debtor_id, creditor_id), amount in pair_amounts.items():
        if amount >= CENT:
            debts.append({"from_user_id": str(debtor_id), "to_user_id": str(creditor_id), "amount": float(amount)})
        elif amount <= -CENT:
            # Acerto pagou mais do que a divida original desse par -- credito
            # sobra pro lado inverso (raro, mas mantem o extrato coerente).
            debts.append({"from_user_id": str(creditor_id), "to_user_id": str(debtor_id), "amount": float(-amount)})

    return debts


def compute_friend_pair_balance(user_a_id, user_b_id) -> Decimal:
    """Retorna quanto user_a tem a receber de user_b (negativo = user_a deve)."""
    low, high = sorted([user_a_id, user_b_id], key=str)
    net = defaultdict(lambda: Decimal("0"))

    expenses = SharedExpense.query.filter_by(
        group_id=None, friend_user_low_id=low, friend_user_high_id=high
    ).all()
    for exp in expenses:
        net[exp.paid_by_id] += exp.total_amount
        for p in exp.participants:
            net[p.user_id] -= p.share_amount

    settlements = Settlement.query.filter_by(
        group_id=None, friend_user_low_id=low, friend_user_high_id=high
    ).all()
    for s in settlements:
        net[s.payer_id] += s.amount
        net[s.receiver_id] -= s.amount

    return net.get(user_a_id, Decimal("0"))


def compute_group_debt_pairs(group_id) -> list:
    """Lista de pares (quem deve pra quem) do grupo, respeitando a preferencia
    salva no proprio grupo: dividas originais por padrao, ou simplificadas se
    `Group.simplify_debts` estiver ativado -- ponto unico usado tanto pela tela
    do grupo quanto pelo calculo de saldo por amigo, para os dois nunca divergirem."""
    group = Group.query.get(group_id)
    if group is not None and group.simplify_debts:
        return simplify_group_debts(group_id)
    return compute_group_original_debts(group_id)


def compute_group_pair_balance(group_id, user_a_id, user_b_id) -> Decimal:
    """Quanto user_a tem a receber de user_b dentro de um grupo especifico (negativo
    = user_a deve), a partir dos pares de divida do grupo (originais ou simplificados,
    conforme a preferencia do grupo) -- nunca do saldo liquido do grupo inteiro, que e
    o mesmo numero pra qualquer amigo em comum e nao reflete o par."""
    debts = compute_group_debt_pairs(group_id)
    total = Decimal("0")
    for d in debts:
        if d["from_user_id"] == str(user_b_id) and d["to_user_id"] == str(user_a_id):
            total += Decimal(str(d["amount"]))
        elif d["from_user_id"] == str(user_a_id) and d["to_user_id"] == str(user_b_id):
            total -= Decimal(str(d["amount"]))
    return total


def compute_friend_total_balance(user_a_id, user_b_id) -> dict:
    """Saldo total entre dois amigos: soma das despesas avulsas + o saldo par-a-par
    (dividas originais, nao o saldo liquido do grupo inteiro) de cada grupo em comum.
    Retorna o total e o detalhamento por origem, para a UI poder mostrar 'R$50 no
    total, sendo R$30 avulso e R$20 no grupo Viagem'."""
    breakdown = []

    standalone = compute_friend_pair_balance(user_a_id, user_b_id)
    if standalone != 0:
        breakdown.append({"group_id": None, "group_name": None, "amount": float(standalone)})

    shared_group_ids = (
        db.session.query(GroupMember.group_id)
        .filter(GroupMember.user_id == user_a_id)
        .intersect(db.session.query(GroupMember.group_id).filter(GroupMember.user_id == user_b_id))
        .all()
    )
    shared_group_ids = [row[0] for row in shared_group_ids]

    total = standalone
    if shared_group_ids:
        groups = Group.query.filter(Group.id.in_(shared_group_ids)).all()
        for group in groups:
            amount = compute_group_pair_balance(group.id, user_a_id, user_b_id)
            if amount != 0:
                breakdown.append({"group_id": str(group.id), "group_name": group.name, "amount": float(amount)})
            total += amount

    return {"total": float(total), "breakdown": breakdown}


def simplify_group_debts(group_id) -> list:
    """Guloso: casa repetidamente o maior credor com o maior devedor. Heuristica padrao
    (mesma usada pelo Splitwise real); minimizar o numero exato de transacoes e
    NP-dificil em geral, nao vale a complexidade aqui."""
    net = compute_group_net_balances(group_id)

    creditors = sorted([(u, a) for u, a in net.items() if a >= CENT], key=lambda x: -x[1])
    debtors = sorted([(u, -a) for u, a in net.items() if a <= -CENT], key=lambda x: -x[1])

    transfers = []
    ci = di = 0
    while ci < len(creditors) and di < len(debtors):
        cred_id, cred_amt = creditors[ci]
        debt_id, debt_amt = debtors[di]
        amount = min(cred_amt, debt_amt)
        transfers.append({"from_user_id": str(debt_id), "to_user_id": str(cred_id), "amount": float(amount)})

        cred_amt -= amount
        debt_amt -= amount
        creditors[ci] = (cred_id, cred_amt)
        debtors[di] = (debt_id, debt_amt)

        if cred_amt < CENT:
            ci += 1
        if debt_amt < CENT:
            di += 1

    return transfers


def get_or_create_shared_expense_category(user_id):
    category = Category.query.filter_by(user_id=user_id, name=SHARED_EXPENSE_CATEGORY_NAME, archived=True).first()
    if category is None:
        category = Category(
            user_id=user_id,
            name=SHARED_EXPENSE_CATEGORY_NAME,
            icon="\U0001F465",
            color_hex="#8B9A97",
            kind="expense",
            archived=True,
        )
        db.session.add(category)
        db.session.flush()
    return category


def get_or_create_settlement_income_category(user_id):
    category = Category.query.filter_by(
        user_id=user_id, name=SETTLEMENT_INCOME_CATEGORY_NAME, archived=True
    ).first()
    if category is None:
        category = Category(
            user_id=user_id,
            name=SETTLEMENT_INCOME_CATEGORY_NAME,
            icon="\U0001F465",
            color_hex="#8B9A97",
            kind="income",
            archived=True,
        )
        db.session.add(category)
        db.session.flush()
    return category
