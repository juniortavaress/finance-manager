"""Exportacao completa dos dados de um usuario em uma planilha Excel.

As abas e colunas usam nomes de negocio (o que a pessoa ve no app); nada aqui
expoe ids, nomes de tabela ou a organizacao interna do banco.
"""

import datetime as dt
import io
from decimal import Decimal

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy import or_
from sqlalchemy.orm import selectinload

from app.models import (
    Account,
    Asset,
    AssetTransaction,
    Bank,
    Category,
    CreditCard,
    CreditCardInvoice,
    Dividend,
    ExpenseParticipant,
    Friendship,
    Group,
    GroupMember,
    InstallmentPlan,
    InvestmentAccount,
    RecurringTransaction,
    SharedExpense,
    Settlement,
    Transaction,
    User,
)

TEAL = "0F5C5C"
HEADER_FILL = PatternFill("solid", fgColor=TEAL)
HEADER_FONT = Font(bold=True, color="FFFFFF")
ZEBRA_FILL = PatternFill("solid", fgColor="F3F6F4")
BORDER = Border(bottom=Side(style="thin", color="DDE3DC"))
MUTED = Font(italic=True, color="8B9A97")
MAX_COLUMN_WIDTH = 46
MONEY_FORMAT = "#,##0.00;[Red]-#,##0.00"
QUANTITY_FORMAT = "#,##0.########"
DATE_FORMAT = "DD/MM/YYYY"

ACCOUNT_TYPES = {"checking": "Conta corrente", "credit_card": "Cartão de crédito", "investment": "Investimentos"}
TX_TYPES = {"income": "Receita", "expense": "Despesa"}
PAYMENT_METHODS = {"debit": "Débito", "credit": "Crédito", "pix": "Pix", "other": "Outro"}
TX_STATUSES = {"confirmed": "Confirmada", "scheduled": "Agendada"}
FREQUENCIES = {"monthly": "Mensal", "weekly": "Semanal", "yearly": "Anual"}
CATEGORY_KINDS = {"expense": "Despesa", "income": "Receita", "both": "Receita e despesa"}
INVOICE_STATUSES = {"open": "Aberta", "closed": "Fechada", "paid": "Paga"}
PLAN_STATUSES = {"active": "Em andamento", "completed": "Concluída"}
ASSET_TYPES = {
    "renda_fixa": "Renda fixa",
    "acoes": "Ações",
    "fii": "Fundos imobiliários",
    "fundos": "Fundos",
    "etf": "ETF",
    "cripto": "Criptomoedas",
    "outro": "Outro",
}
OPERATIONS = {"buy": "Compra", "sell": "Venda"}
DIVIDEND_KINDS = {
    "dividendo": "Dividendo",
    "rendimento": "Rendimento",
    "jcp": "Juros sobre capital próprio",
    "cupom": "Cupom",
    "bonificacao": "Bonificação",
    "outro": "Outro",
}
SPLIT_MODES = {"equal": "Igual", "value": "Por valor", "percentage": "Por porcentagem"}
FRIENDSHIP_STATUSES = {"pending": "Pendente", "accepted": "Aceito", "rejected": "Recusado"}
FIXED_INCOME_TYPES = {"pos_fixado": "Pós-fixado", "pre_fixado": "Pré-fixado", "ipca": "IPCA+"}


SHEET_NOTES = {
    "Lançamentos": "Todas as receitas, despesas e transferências",
    "Contas": "Contas dos seus bancos com saldo atual e inicial",
    "Cartões": "Limite, uso e datas de fechamento e vencimento",
    "Faturas": "Faturas dos cartões, abertas, fechadas e pagas",
    "Categorias": "Suas categorias e o orçamento mensal de cada uma",
    "Contas fixas": "Lançamentos recorrentes, como aluguel e assinaturas",
    "Compras parceladas": "Compras no cartão divididas em parcelas",
    "Investimentos": "Posição atual de cada ativo da sua carteira",
    "Compras e vendas": "Histórico de operações nos investimentos",
    "Proventos": "Dividendos, rendimentos e outros proventos recebidos",
    "Amigos": "Pessoas com quem você divide despesas",
    "Grupos": "Grupos de despesas compartilhadas e seus participantes",
    "Despesas divididas": "Despesas compartilhadas com amigos e grupos",
    "Acertos": "Pagamentos feitos para quitar o que foi dividido",
}


def _yes_no(value):
    return "Sim" if value else "Não"


def _num(value):
    return float(value) if isinstance(value, Decimal) else value


def _display_length(value, fmt):
    if value is None:
        return 0
    if hasattr(value, "strftime"):
        return 10
    if isinstance(value, (int, float)) and fmt in (MONEY_FORMAT, QUANTITY_FORMAT):
        return len(f"{value:,.2f}") + 1
    return len(str(value))


def _write_sheet(wb, title, headers, rows, formats=None):
    """`formats` mapeia o indice da coluna (0-based) para um number_format.
    Devolve a quantidade de linhas escritas."""
    formats = formats or {}
    ws = wb.create_sheet(title)
    ws.sheet_properties.tabColor = TEAL
    ws.append(headers)
    ws.row_dimensions[1].height = 26
    for cell in ws[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(vertical="center", horizontal="center", wrap_text=True)

    widths = [len(str(h)) + 4 for h in headers]
    centered = set()
    for col in range(len(headers)):
        values = [r[col] for r in rows if r[col] not in (None, "")]
        if col in formats and hasattr(values[0] if values else None, "strftime"):
            centered.add(col)
        elif values and all(v in ("Sim", "Não") for v in values):
            centered.add(col)
        elif values and all(isinstance(v, int) and not isinstance(v, bool) for v in values):
            centered.add(col)

    for n, row in enumerate(rows):
        ws.append([_num(v) for v in row])
        excel_row = ws.max_row
        for col, cell in enumerate(ws[excel_row]):
            # Texto nunca vira formula (ex.: descricao comecando com "=").
            if isinstance(cell.value, str):
                cell.data_type = "s"
            if col in formats:
                cell.number_format = formats[col]
            cell.border = BORDER
            if n % 2 == 1:
                cell.fill = ZEBRA_FILL
            horizontal = "center" if col in centered else None
            cell.alignment = Alignment(vertical="top", horizontal=horizontal, wrap_text=isinstance(cell.value, str))
            if n < 500:
                widths[col] = max(widths[col], _display_length(row[col], formats.get(col)) + 3)

    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = min(max(width, 11), MAX_COLUMN_WIDTH)

    if rows:
        ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{ws.max_row}"
    else:
        ws.append(["Nenhum registro."])
        ws["A2"].font = MUTED
    ws.freeze_panes = "A2"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = "1:1"
    return len(rows)


def _fill_summary(ws, user, written):
    ws.sheet_properties.tabColor = "C0912F"
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 26
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["C"].width = 58

    ws["A1"] = "Meus dados financeiros"
    ws["A1"].font = Font(bold=True, size=18, color=TEAL)
    ws.row_dimensions[1].height = 30
    ws["A2"] = f"Gerado em {dt.datetime.now().strftime('%d/%m/%Y às %H:%M')}"
    ws["A2"].font = MUTED

    def section(row, label):
        for col in "ABC":
            ws[f"{col}{row}"].fill = HEADER_FILL
        ws[f"A{row}"] = label
        ws[f"A{row}"].font = HEADER_FONT
        ws.row_dimensions[row].height = 22

    section(4, "Titular")
    for offset, (label, value) in enumerate(
        [("Nome", user.name), ("E-mail", user.email), ("Moeda padrão", user.currency_default)], start=5
    ):
        ws[f"A{offset}"] = label
        ws[f"A{offset}"].font = Font(bold=True)
        ws[f"B{offset}"] = value
        ws[f"B{offset}"].data_type = "s"
        ws[f"B{offset}"].alignment = Alignment(horizontal="left")

    section(9, "Conteúdo desta planilha")
    ws["B9"] = "Registros"
    ws["B9"].font = HEADER_FONT
    ws["B9"].alignment = Alignment(horizontal="center")
    ws["C9"] = "O que tem na aba"
    ws["C9"].font = HEADER_FONT
    for n, (title, count) in enumerate(written):
        row = 10 + n
        ws[f"A{row}"] = title
        ws[f"A{row}"].hyperlink = f"#'{title}'!A1"
        ws[f"A{row}"].font = Font(color=TEAL, underline="single")
        ws[f"B{row}"] = count
        ws[f"B{row}"].alignment = Alignment(horizontal="center")
        ws[f"C{row}"] = SHEET_NOTES.get(title, "")
        ws[f"C{row}"].font = Font(color="5C6D6A")
        for col in "ABC":
            ws[f"{col}{row}"].border = BORDER
            if n % 2 == 1:
                ws[f"{col}{row}"].fill = ZEBRA_FILL


def build_user_export(user):
    uid = user.id
    wb = Workbook()
    wb.remove(wb.active)

    banks = Bank.query.filter_by(user_id=uid).order_by(Bank.name).all()
    bank_name = {b.id: b.name for b in banks}
    accounts = Account.query.filter_by(user_id=uid).options(selectinload(Account.credit_card)).all()
    account_by_id = {a.id: a for a in accounts}
    categories = Category.query.filter_by(user_id=uid).order_by(Category.name).all()
    category_name = {c.id: c.name for c in categories}

    def acct_label(account_id):
        acct = account_by_id.get(account_id)
        return acct.name if acct else ""

    def acct_bank(account_id):
        acct = account_by_id.get(account_id)
        return bank_name.get(acct.bank_id, "") if acct else ""

    def acct_currency(account_id):
        acct = account_by_id.get(account_id)
        return acct.currency if acct else ""

    transactions = (
        Transaction.query.filter_by(user_id=uid).order_by(Transaction.date.desc(), Transaction.created_at.desc()).all()
    )
    card_account = {a.credit_card.id: a for a in accounts if a.credit_card}

    summary = wb.create_sheet("Resumo")
    written = []

    def sheet(title, headers, rows, formats=None):
        written.append((title, _write_sheet(wb, title, headers, rows, formats)))

    # ---- Lancamentos --------------------------------------------------
    sheet(
        "Lançamentos",
        ["Data", "Descrição", "Tipo", "Valor", "Moeda", "Categoria", "Conta", "Banco", "Forma de pagamento", "Situação", "Transferência", "Parcela", "Observações"],
        [
            [
                t.date,
                t.description,
                TX_TYPES.get(t.type, t.type),
                t.amount,
                acct_currency(t.account_id),
                category_name.get(t.category_id, ""),
                acct_label(t.account_id),
                acct_bank(t.account_id),
                PAYMENT_METHODS.get(t.payment_method, t.payment_method),
                TX_STATUSES.get(t.status, t.status),
                _yes_no(t.is_transfer),
                t.installment_number,
                t.notes or "",
            ]
            for t in transactions
        ],
        {0: DATE_FORMAT, 3: MONEY_FORMAT},
    )

    # ---- Contas -------------------------------------------------------
    sheet(
        "Contas",
        ["Banco", "Conta", "Tipo", "Moeda", "Saldo atual", "Saldo inicial", "Data do saldo inicial", "Encerrada"],
        [
            [
                bank_name.get(a.bank_id, ""),
                a.name,
                ACCOUNT_TYPES.get(a.type, a.type),
                a.currency,
                a.balance,
                a.opening_balance,
                a.opening_balance_date,
                _yes_no(a.archived),
            ]
            for a in sorted(accounts, key=lambda x: (bank_name.get(x.bank_id, ""), x.name))
        ],
        {4: MONEY_FORMAT, 5: MONEY_FORMAT, 6: DATE_FORMAT},
    )

    # ---- Cartoes e faturas -------------------------------------------
    cards = [a for a in accounts if a.credit_card]
    sheet(
        "Cartões",
        ["Banco", "Cartão", "Moeda", "Limite", "Utilizado", "Dia de fechamento", "Dia de vencimento"],
        [
            [bank_name.get(a.bank_id, ""), a.name, a.currency, a.credit_card.credit_limit, a.credit_card.used_amount, a.credit_card.closing_day, a.credit_card.due_day]
            for a in cards
        ],
        {3: MONEY_FORMAT, 4: MONEY_FORMAT},
    )

    card_ids = [a.credit_card.id for a in cards]
    invoices = (
        CreditCardInvoice.query.filter(CreditCardInvoice.credit_card_id.in_(card_ids))
        .order_by(CreditCardInvoice.reference_month.desc())
        .all()
        if card_ids
        else []
    )
    sheet(
        "Faturas",
        ["Banco", "Cartão", "Mês de referência", "Fechamento", "Vencimento", "Total", "Pago", "Situação"],
        [
            [
                bank_name.get(card_account[i.credit_card_id].bank_id, ""),
                card_account[i.credit_card_id].name,
                i.reference_month.strftime("%m/%Y"),
                i.closing_date,
                i.due_date,
                i.total_amount,
                i.paid_amount,
                INVOICE_STATUSES.get(i.status, i.status),
            ]
            for i in invoices
        ],
        {3: DATE_FORMAT, 4: DATE_FORMAT, 5: MONEY_FORMAT, 6: MONEY_FORMAT},
    )

    # ---- Categorias ---------------------------------------------------
    sheet(
        "Categorias",
        ["Categoria", "Tipo", "Orçamento mensal", "Arquivada"],
        [[c.name, CATEGORY_KINDS.get(c.kind, c.kind), c.budget_amount, _yes_no(c.archived)] for c in categories],
        {2: MONEY_FORMAT},
    )

    # ---- Contas fixas e parcelamentos --------------------------------
    recurring = RecurringTransaction.query.filter_by(user_id=uid).order_by(RecurringTransaction.description).all()
    sheet(
        "Contas fixas",
        ["Descrição", "Tipo", "Valor", "Frequência", "Dia do mês", "Início", "Fim", "Conta", "Banco", "Categoria", "Forma de pagamento", "Ativa"],
        [
            [
                r.description,
                TX_TYPES.get(r.type, r.type),
                r.amount,
                FREQUENCIES.get(r.frequency, r.frequency),
                r.day_of_month,
                r.start_date,
                r.end_date,
                acct_label(r.account_id),
                acct_bank(r.account_id),
                category_name.get(r.category_id, ""),
                PAYMENT_METHODS.get(r.payment_method, r.payment_method),
                _yes_no(r.active),
            ]
            for r in recurring
        ],
        {2: MONEY_FORMAT, 5: DATE_FORMAT, 6: DATE_FORMAT},
    )

    plans = InstallmentPlan.query.filter_by(user_id=uid).order_by(InstallmentPlan.first_installment_date.desc()).all()
    sheet(
        "Compras parceladas",
        ["Descrição", "Cartão", "Banco", "Categoria", "Valor total", "Parcelas", "Valor da parcela", "Primeira parcela", "Situação"],
        [
            [
                p.description,
                card_account[p.credit_card_id].name if p.credit_card_id in card_account else "",
                bank_name.get(card_account[p.credit_card_id].bank_id, "") if p.credit_card_id in card_account else "",
                category_name.get(p.category_id, ""),
                p.total_amount,
                p.installments_count,
                p.installment_amount,
                p.first_installment_date,
                PLAN_STATUSES.get(p.status, p.status),
            ]
            for p in plans
        ],
        {4: MONEY_FORMAT, 6: MONEY_FORMAT, 7: DATE_FORMAT},
    )

    # ---- Investimentos ------------------------------------------------
    inv_accounts = InvestmentAccount.query.filter(
        InvestmentAccount.account_id.in_([a.id for a in accounts])
    ).all() if accounts else []
    inv_account_owner = {ia.id: account_by_id[ia.account_id] for ia in inv_accounts if ia.account_id in account_by_id}
    assets = (
        Asset.query.filter(Asset.investment_account_id.in_(list(inv_account_owner)))
        .options(selectinload(Asset.asset_transactions), selectinload(Asset.dividends))
        .order_by(Asset.name)
        .all()
        if inv_account_owner
        else []
    )
    asset_label = {a.id: (f"{a.code} · {a.name}" if a.code else a.name) for a in assets}
    asset_owner = {a.id: inv_account_owner[a.investment_account_id] for a in assets}

    def position(asset):
        qty = Decimal(0)
        for tx in asset.asset_transactions:
            qty += tx.quantity if tx.type == "buy" else -tx.quantity
        return qty

    sheet(
        "Investimentos",
        ["Banco ou corretora", "Tipo", "Código", "Nome", "Quantidade", "Preço atual", "Tipo de rentabilidade", "Indexador", "Taxa (%)", "Vencimento"],
        [
            [
                bank_name.get(asset_owner[a.id].bank_id, ""),
                ASSET_TYPES.get(a.type, a.type),
                a.code or "",
                a.name,
                position(a),
                a.current_unit_price,
                FIXED_INCOME_TYPES.get(a.fixed_income_type, "") if a.fixed_income_type else "",
                a.fixed_income_indexer or "",
                a.fixed_income_rate_pct,
                a.maturity_date,
            ]
            for a in assets
        ],
        {4: QUANTITY_FORMAT, 5: MONEY_FORMAT, 9: DATE_FORMAT},
    )

    operations = sorted(
        (tx for a in assets for tx in a.asset_transactions), key=lambda t: t.date, reverse=True
    )
    sheet(
        "Compras e vendas",
        ["Data", "Investimento", "Operação", "Quantidade", "Preço unitário", "Valor total", "Taxas"],
        [
            [t.date, asset_label[t.asset_id], OPERATIONS.get(t.type, t.type), t.quantity, t.unit_price, t.total_amount, t.fee_amount]
            for t in operations
        ],
        {0: DATE_FORMAT, 3: QUANTITY_FORMAT, 4: MONEY_FORMAT, 5: MONEY_FORMAT, 6: MONEY_FORMAT},
    )

    dividends = sorted((d for a in assets for d in a.dividends), key=lambda d: d.date, reverse=True)
    sheet(
        "Proventos",
        ["Data", "Investimento", "Tipo", "Quantidade na data", "Valor recebido"],
        [[d.date, asset_label[d.asset_id], DIVIDEND_KINDS.get(d.kind, d.kind), d.quantity_snapshot, d.amount] for d in dividends],
        {0: DATE_FORMAT, 3: QUANTITY_FORMAT, 4: MONEY_FORMAT},
    )

    # ---- Amigos, grupos e divisoes -----------------------------------
    friendships = Friendship.query.filter(or_(Friendship.requester_id == uid, Friendship.addressee_id == uid)).all()
    other_ids = {f.addressee_id if f.requester_id == uid else f.requester_id for f in friendships}
    member_rows = (
        GroupMember.query.filter_by(user_id=uid).all()
    )
    group_ids = {m.group_id for m in member_rows}
    groups = Group.query.filter(Group.id.in_(group_ids)).order_by(Group.name).all() if group_ids else []
    all_members = GroupMember.query.filter(GroupMember.group_id.in_(group_ids)).all() if group_ids else []
    other_ids |= {m.user_id for m in all_members}

    participant_expense_ids = [
        row[0] for row in ExpenseParticipant.query.filter_by(user_id=uid).with_entities(ExpenseParticipant.shared_expense_id)
    ]
    expenses = (
        SharedExpense.query.options(selectinload(SharedExpense.participants))
        .filter(
            or_(
                SharedExpense.paid_by_id == uid,
                SharedExpense.created_by == uid,
                SharedExpense.id.in_(participant_expense_ids),
            )
        )
        .order_by(SharedExpense.date.desc())
        .all()
    )
    settlements = (
        Settlement.query.filter(or_(Settlement.payer_id == uid, Settlement.receiver_id == uid))
        .order_by(Settlement.date.desc())
        .all()
    )
    for e in expenses:
        other_ids |= {e.paid_by_id, e.friend_user_low_id, e.friend_user_high_id}
    for s in settlements:
        other_ids |= {s.payer_id, s.receiver_id, s.friend_user_low_id, s.friend_user_high_id}
    other_ids.discard(None)
    users = {u.id: u for u in User.query.filter(User.id.in_(other_ids)).all()} if other_ids else {}

    def person(user_id):
        if user_id == uid:
            return "Você"
        u = users.get(user_id)
        return u.name if u else ""

    group_name = {g.id: g.name for g in groups}

    sheet(
        "Amigos",
        ["Nome", "Situação"],
        sorted(
            [
                [person(f.addressee_id if f.requester_id == uid else f.requester_id), FRIENDSHIP_STATUSES.get(f.status, f.status)]
                for f in friendships
            ]
        ),
    )

    members_by_group = {}
    for m in all_members:
        members_by_group.setdefault(m.group_id, []).append(person(m.user_id))
    sheet(
        "Grupos",
        ["Grupo", "Participantes", "Arquivado"],
        [[g.name, ", ".join(sorted(members_by_group.get(g.id, []))), _yes_no(g.archived)] for g in groups],
    )

    def scope(entity):
        if entity.group_id:
            return f"Grupo: {group_name.get(entity.group_id, entity.group.name if entity.group else '')}"
        other = entity.friend_user_high_id if entity.friend_user_low_id == uid else entity.friend_user_low_id
        return f"Amigo: {person(other)}"

    sheet(
        "Despesas divididas",
        ["Data", "Descrição", "Com quem", "Quem pagou", "Valor total", "Divisão", "Sua parte", "Observações"],
        [
            [
                e.date,
                e.description,
                scope(e),
                person(e.paid_by_id),
                e.total_amount,
                SPLIT_MODES.get(e.split_mode, e.split_mode),
                next((p.share_amount for p in e.participants if p.user_id == uid), None),
                e.notes or "",
            ]
            for e in expenses
        ],
        {0: DATE_FORMAT, 4: MONEY_FORMAT, 6: MONEY_FORMAT},
    )

    sheet(
        "Acertos",
        ["Data", "Com quem", "Quem pagou", "Quem recebeu", "Valor"],
        [[s.date, scope(s), person(s.payer_id), person(s.receiver_id), s.amount] for s in settlements],
        {0: DATE_FORMAT, 4: MONEY_FORMAT},
    )

    _fill_summary(summary, user, written)

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
