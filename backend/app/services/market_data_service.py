import datetime as dt
import logging
import threading

from flask import current_app

from app.extensions import db
from app.models import Account, Asset, InvestmentAccount
from app.services.crypto_service import COINGECKO_VS_CURRENCIES, refresh_current_prices, resolve_symbol
from app.services.economic_index_service import INDEXER_SGS_CODES, refresh_daily_rates
from app.services.quotes_service import refresh_brl_rates

logger = logging.getLogger(__name__)

# Evita disparar duas rotinas de warm-up em paralelo (ex: usuario abre o app
# em duas abas) - a segunda chamada enquanto uma ja esta em andamento e' um
# no-op, o cache que a primeira ja estiver escrevendo serve as duas.
_refresh_lock = threading.Lock()
_refresh_in_progress = False


def _refresh_market_data_for_user(user_id):
    """Atualiza em `crypto_prices`, `economic_index_rates` e `fx_rates` (via
    upsert) tudo que os ativos de renda variavel/fixa do usuario usam, alem
    das cotacoes de cambio. Bate nas APIs externas (CoinGecko, Banco
    Central) - roda em background (ver refresh_market_data_async), nunca no
    caminho sincrono de uma requisicao que o usuario esta esperando (essa e'
    a causa raiz da lentidao de GET /assets e GET /summary antes desta
    rotina existir: eles bloqueavam esperando essas mesmas chamadas)."""
    inv_account_ids = [
        ia.id
        for ia in InvestmentAccount.query.join(Account, Account.id == InvestmentAccount.account_id)
        .filter(Account.user_id == user_id)
        .all()
    ]
    if not inv_account_ids:
        return

    assets = Asset.query.filter(Asset.investment_account_id.in_(inv_account_ids)).all()
    accounts_by_ia_id = {
        a.id: a.account for a in InvestmentAccount.query.filter(InvestmentAccount.id.in_(inv_account_ids)).all()
    }

    crypto_pairs = set()
    indexers = set()
    for asset in assets:
        currency = accounts_by_ia_id[asset.investment_account_id].currency
        if asset.type == "cripto":
            symbol = resolve_symbol(asset.code)
            if symbol and currency in COINGECKO_VS_CURRENCIES:
                crypto_pairs.add((symbol, currency))
        elif asset.type == "renda_fixa" and asset.fixed_income_type == "pos_fixado" and asset.fixed_income_indexer:
            indexer = asset.fixed_income_indexer.strip().upper()
            if indexer in INDEXER_SGS_CODES:
                indexers.add(indexer)

    if crypto_pairs:
        refresh_current_prices(crypto_pairs)

    if indexers:
        today = dt.date.today()
        earliest_by_indexer = {}
        for asset in assets:
            if asset.type != "renda_fixa" or asset.fixed_income_type != "pos_fixado":
                continue
            indexer = (asset.fixed_income_indexer or "").strip().upper()
            if indexer not in indexers or not asset.asset_transactions:
                continue
            earliest = min(tx.date for tx in asset.asset_transactions)
            if indexer not in earliest_by_indexer or earliest < earliest_by_indexer[indexer]:
                earliest_by_indexer[indexer] = earliest
        for indexer, earliest in earliest_by_indexer.items():
            refresh_daily_rates(indexer, earliest, today)

    refresh_brl_rates()


def refresh_market_data_async(app, user_id):
    """Dispara _refresh_market_data_for_user em background (thread separada,
    com seu proprio contexto de app e sessao de banco) e retorna
    imediatamente - a rota que chama isso nao espera as APIs externas.
    So' deixa uma atualizacao em andamento por vez no processo inteiro (ver
    _refresh_lock); chamadas concorrentes viram no-op."""
    global _refresh_in_progress

    with _refresh_lock:
        if _refresh_in_progress:
            return False
        _refresh_in_progress = True

    def _run():
        global _refresh_in_progress
        try:
            with app.app_context():
                try:
                    _refresh_market_data_for_user(user_id)
                except Exception:
                    logger.exception("Falha na atualizacao de dados de mercado em background")
                    db.session.rollback()
        finally:
            with _refresh_lock:
                _refresh_in_progress = False

    threading.Thread(target=_run, daemon=True).start()
    return True


def trigger_refresh_for_current_user():
    """Atalho para chamar a partir de uma rota autenticada: dispara o
    warm-up para g.current_user usando o app real (nao um proxy) para a
    thread poder abrir seu proprio contexto."""
    from flask import g

    app = current_app._get_current_object()
    return refresh_market_data_async(app, g.current_user.id)
