import gzip
import os

from flask import Flask, request
from flask_cors import CORS

from app.extensions import db, migrate
from app.errors import register_error_handlers


def _is_debug():
    return os.environ.get("FLASK_DEBUG") == "1"


def _jwt_secret():
    secret = os.environ.get("JWT_SECRET")
    if secret:
        return secret
    if _is_debug():
        return "dev-secret"
    raise RuntimeError("JWT_SECRET não definido")


def _cors_origins():
    origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
    if origins or not _is_debug():
        return origins
    return ["http://localhost:5173"]


def create_app():
    app = Flask(__name__)

    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ["DATABASE_URL"]
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_size": 8,
        "max_overflow": 8,
        "connect_args": {"prepare_threshold": None},
    }
    app.config["JWT_SECRET"] = _jwt_secret()
    app.config["JWT_EXPIRES_MINUTES"] = int(os.environ.get("JWT_EXPIRES_MINUTES", "10080"))

    db.init_app(app)
    migrate.init_app(app, db)

    # max_age: o navegador guarda o preflight (OPTIONS) por 2h em vez de fazer
    # uma ida extra ao servidor antes de CADA chamada da API.
    CORS(app, origins=_cors_origins(), max_age=7200)

    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Cache-Control", "no-store")
        if not _is_debug():
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.after_request
    def compress_json(response):
        # gzip nas respostas JSON (o /investments/summary passa de 50 KB):
        # 5-8x menos bytes, o que pesa no celular/rede movel.
        if (
            response.status_code < 200
            or response.status_code >= 300
            or response.direct_passthrough
            or "Content-Encoding" in response.headers
            or response.mimetype != "application/json"
            or "gzip" not in request.headers.get("Accept-Encoding", "")
        ):
            return response
        data = response.get_data()
        if len(data) < 1024:
            return response
        response.set_data(gzip.compress(data, compresslevel=5))
        response.headers["Content-Encoding"] = "gzip"
        response.headers["Content-Length"] = str(len(response.get_data()))
        response.headers.add("Vary", "Accept-Encoding")
        return response

    register_error_handlers(app)

    from app.routes.auth import auth_bp
    from app.routes.banks import banks_bp
    from app.routes.accounts import accounts_bp
    from app.routes.categories import categories_bp
    from app.routes.transactions import transactions_bp
    from app.routes.recurring import recurring_bp
    from app.routes.installments import installments_bp
    from app.routes.credit_cards import credit_cards_bp
    from app.routes.investments import investments_bp
    from app.routes.dividends import dividends_bp
    from app.routes.market_data import market_data_bp
    from app.routes.dashboard import dashboard_bp
    from app.routes.reports import reports_bp
    from app.routes.quotes import quotes_bp
    from app.routes.friends import friends_bp
    from app.routes.groups import groups_bp
    from app.routes.shared_expenses import shared_expenses_bp
    from app.routes.settlements import settlements_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(banks_bp, url_prefix="/api/banks")
    app.register_blueprint(accounts_bp, url_prefix="/api/accounts")
    app.register_blueprint(categories_bp, url_prefix="/api/categories")
    app.register_blueprint(transactions_bp, url_prefix="/api/transactions")
    app.register_blueprint(recurring_bp, url_prefix="/api/recurring")
    app.register_blueprint(installments_bp, url_prefix="/api/installments")
    app.register_blueprint(credit_cards_bp, url_prefix="/api/credit-cards")
    app.register_blueprint(investments_bp, url_prefix="/api/investments")
    app.register_blueprint(dividends_bp, url_prefix="/api/dividends")
    app.register_blueprint(market_data_bp, url_prefix="/api")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(reports_bp, url_prefix="/api/reports")
    app.register_blueprint(quotes_bp, url_prefix="/api/quotes")
    app.register_blueprint(friends_bp, url_prefix="/api/friends")
    app.register_blueprint(groups_bp, url_prefix="/api/groups")
    app.register_blueprint(shared_expenses_bp, url_prefix="/api/shared-expenses")
    app.register_blueprint(settlements_bp, url_prefix="/api/settlements")

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    from app.cli import register_cli

    register_cli(app)

    from app.services.fixed_income_service import warm_up_holidays_cache

    warm_up_holidays_cache()

    return app
