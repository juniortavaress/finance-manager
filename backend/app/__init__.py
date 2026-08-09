import os

from flask import Flask
from flask_cors import CORS

from app.extensions import db, migrate
from app.errors import register_error_handlers


def create_app():
    app = Flask(__name__)

    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ["DATABASE_URL"]
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}
    app.config["JWT_SECRET"] = os.environ.get("JWT_SECRET", "dev-secret")
    app.config["JWT_EXPIRES_MINUTES"] = int(os.environ.get("JWT_EXPIRES_MINUTES", "10080"))

    db.init_app(app)
    migrate.init_app(app, db)

    origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
    CORS(app, origins=origins or "*", supports_credentials=True)

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
    from app.routes.dashboard import dashboard_bp
    from app.routes.reports import reports_bp
    from app.routes.bill_reminders import reminders_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(banks_bp, url_prefix="/api/banks")
    app.register_blueprint(accounts_bp, url_prefix="/api/accounts")
    app.register_blueprint(categories_bp, url_prefix="/api/categories")
    app.register_blueprint(transactions_bp, url_prefix="/api/transactions")
    app.register_blueprint(recurring_bp, url_prefix="/api/recurring")
    app.register_blueprint(installments_bp, url_prefix="/api/installments")
    app.register_blueprint(credit_cards_bp, url_prefix="/api/credit-cards")
    app.register_blueprint(investments_bp, url_prefix="/api/investments")
    app.register_blueprint(dashboard_bp, url_prefix="/api/dashboard")
    app.register_blueprint(reports_bp, url_prefix="/api/reports")
    app.register_blueprint(reminders_bp, url_prefix="/api/reminders")

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    from app.cli import register_cli

    register_cli(app)

    return app
