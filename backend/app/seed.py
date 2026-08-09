import datetime as dt
from decimal import Decimal

from app.extensions import db
from app.models import (
    Account,
    Bank,
    Category,
    CreditCard,
    Investment,
    InvestmentAccount,
    InvestmentSnapshot,
    Transaction,
    User,
)
from app.services.auth_service import hash_password
from app.services.finance_service import (
    get_or_create_invoice,
    invoice_month_for_date,
    recalc_account_balance,
    recalc_credit_card_used_amount,
    recalc_invoice_total,
)

DEFAULT_EXPENSE_CATEGORIES = [
    ("Alimentacao", "\U0001F6D2", "#C0912F"),
    ("Moradia", "\U0001F3E0", "#0F5C5C"),
    ("Transporte", "\U0001F697", "#A6432C"),
    ("Estudos/Trabalho", "\U0001F4BB", "#3D7A8C"),
    ("Restaurantes", "\U0001F37D️", "#7A4FE0"),
    ("Saude", "➕", "#8B9A97"),
    ("Lazer", "\U0001F3AC", "#D97757"),
]

DEFAULT_INCOME_CATEGORIES = [
    ("Salario", "\U0001F4B0", "#0F5C5C"),
    ("Freelance", "\U0001F4BC", "#C0912F"),
    ("Outras receitas", "✨", "#8B9A97"),
]


def seed_default_categories_for_user(user_id):
    """Cria as categorias padrao (template) ja atribuidas a um usuario especifico."""
    for name, icon, color in DEFAULT_EXPENSE_CATEGORIES:
        db.session.add(Category(user_id=user_id, name=name, icon=icon, color_hex=color, kind="expense"))
    for name, icon, color in DEFAULT_INCOME_CATEGORIES:
        db.session.add(Category(user_id=user_id, name=name, icon=icon, color_hex=color, kind="income"))
    db.session.flush()


def seed_demo_user():
    """Cria o usuario junior@gmail.com com dados de exemplo, se ainda nao existir."""
    user = User.query.filter_by(email="junior@gmail.com").first()
    if user:
        return user

    user = User(name="Junior", email="junior@gmail.com", password_hash=hash_password("123456"), currency_default="BRL")
    db.session.add(user)
    db.session.flush()

    seed_default_categories_for_user(user.id)
    cat_by_name = {c.name: c for c in Category.query.filter_by(user_id=user.id).all()}

    today = dt.date.today()
    account_open_date = today.replace(day=1) - dt.timedelta(days=150)

    banks_data = [
        {"name": "Itau", "color": "#0F5C5C", "checking": Decimal("6320.10"), "limit": Decimal("8000"),
         "closing_day": 22, "due_day": 5, "invest": Decimal("12500")},
        {"name": "Nubank", "color": "#7A4FE0", "checking": Decimal("4108.80"), "limit": Decimal("5000"),
         "closing_day": 28, "due_day": 8, "invest": Decimal("9800")},
        {"name": "Banco do Brasil", "color": "#C0912F", "checking": Decimal("3900.00"), "limit": Decimal("4000"),
         "closing_day": 15, "due_day": 22, "invest": Decimal("10112.50")},
    ]

    banks = {}
    checking_accounts = {}
    credit_cards = {}
    invest_accounts = {}

    for bd in banks_data:
        bank = Bank(user_id=user.id, name=bd["name"], color_hex=bd["color"])
        db.session.add(bank)
        db.session.flush()
        banks[bd["name"]] = bank

        checking = Account(
            user_id=user.id,
            bank_id=bank.id,
            type="checking",
            name=f"Conta corrente {bd['name']}",
            balance=bd["checking"],
            opening_balance=bd["checking"],
            opening_balance_date=account_open_date,
        )
        db.session.add(checking)
        db.session.flush()
        checking_accounts[bd["name"]] = checking

        card_account = Account(
            user_id=user.id,
            bank_id=bank.id,
            type="credit_card",
            name=f"Cartao {bd['name']}",
            balance=0,
            opening_balance=0,
            opening_balance_date=account_open_date,
        )
        db.session.add(card_account)
        db.session.flush()

        credit_card = CreditCard(
            account_id=card_account.id,
            credit_limit=bd["limit"],
            used_amount=0,
            closing_day=bd["closing_day"],
            due_day=bd["due_day"],
        )
        db.session.add(credit_card)
        db.session.flush()
        credit_cards[bd["name"]] = credit_card

        invest_account_wrapper = Account(
            user_id=user.id,
            bank_id=bank.id,
            type="investment",
            name=f"Investimentos {bd['name']}",
            balance=bd["invest"],
            opening_balance=bd["invest"],
            opening_balance_date=account_open_date,
        )
        db.session.add(invest_account_wrapper)
        db.session.flush()
        investment_account = InvestmentAccount(account_id=invest_account_wrapper.id)
        db.session.add(investment_account)
        db.session.flush()
        invest_accounts[bd["name"]] = investment_account

    db.session.flush()

    def add_debit_tx(bank_name, desc, cat_name, amount, tx_type, days_ago):
        account = checking_accounts[bank_name]
        tx = Transaction(
            user_id=user.id,
            account_id=account.id,
            category_id=cat_by_name[cat_name].id,
            description=desc,
            amount=Decimal(str(amount)),
            type=tx_type,
            date=today - dt.timedelta(days=days_ago),
            payment_method="debit",
            status="confirmed",
        )
        db.session.add(tx)
        return tx

    def add_credit_tx(bank_name, desc, cat_name, amount, days_ago):
        account = None
        for acc in Account.query.filter_by(user_id=user.id, bank_id=banks[bank_name].id, type="credit_card"):
            account = acc
        credit_card = credit_cards[bank_name]
        purchase_date = today - dt.timedelta(days=days_ago)
        ref_month = invoice_month_for_date(credit_card, purchase_date)
        invoice = get_or_create_invoice(credit_card, ref_month)
        tx = Transaction(
            user_id=user.id,
            account_id=account.id,
            category_id=cat_by_name[cat_name].id,
            description=desc,
            amount=Decimal(str(amount)),
            type="expense",
            date=purchase_date,
            payment_method="credit",
            status="confirmed",
            credit_card_invoice_id=invoice.id,
        )
        db.session.add(tx)
        return tx, invoice

    add_debit_tx("Nubank", "Salario", "Salario", 8900.00, "income", 3)
    add_debit_tx("Itau", "Aluguel", "Moradia", 1650.00, "expense", 3)
    add_debit_tx("Nubank", "Uber", "Transporte", 32.90, "expense", 4)
    add_debit_tx("Banco do Brasil", "Restaurante Sushi", "Restaurantes", 118.00, "expense", 5)
    add_debit_tx("Itau", "Supermercado Pao de Acucar", "Alimentacao", 284.50, "expense", 1)
    add_debit_tx("Nubank", "Farmacia", "Saude", 89.90, "expense", 6)
    add_debit_tx("Itau", "Curso online", "Estudos/Trabalho", 120.00, "expense", 10)

    for bank_name, desc, cat, amount, days_ago in [
        ("Itau", "Posto de gasolina", "Transporte", 180.00, 8),
        ("Nubank", "Cinema", "Lazer", 64.00, 12),
        ("Banco do Brasil", "Livraria", "Estudos/Trabalho", 95.00, 14),
    ]:
        add_credit_tx(bank_name, desc, cat, amount, days_ago)

    for account in checking_accounts.values():
        recalc_account_balance(account)
    for bank_name, credit_card in credit_cards.items():
        for invoice in credit_card.invoices:
            recalc_invoice_total(invoice)
        recalc_credit_card_used_amount(credit_card)

    invest_tiles = [
        ("Itau", "renda_fixa", "Tesouro Selic 2029", 8000, 8412.50),
        ("Itau", "acoes", "ITSA4", 4500, 4700.00),
        ("Nubank", "fundos", "Fundo Multimercado XP", 5000, 5012.50),
        ("Nubank", "cripto", "Bitcoin", 4800, 4787.50),
        ("Banco do Brasil", "renda_fixa", "CDB BB 110% CDI", 10112.50, 10112.50),
    ]
    for bank_name, inv_type, name, invested, current in invest_tiles:
        investment = Investment(
            investment_account_id=invest_accounts[bank_name].id,
            type=inv_type,
            name=name,
            invested_amount=Decimal(str(invested)),
            current_amount=Decimal(str(current)),
        )
        db.session.add(investment)
        db.session.flush()
        db.session.add(InvestmentSnapshot(investment_id=investment.id, date=today, value=investment.current_amount))

    db.session.commit()
    return user
