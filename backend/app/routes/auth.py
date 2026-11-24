from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import User
from app.rate_limit import hit, reset
from app.services.auth_service import hash_password, issue_token, verify_password

auth_bp = Blueprint("auth", __name__)

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_BYTES = 72
LOGIN_MAX_ATTEMPTS = 8
REGISTER_MAX_ATTEMPTS = 10
RATE_WINDOW_SECONDS = 900


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    hit(f"register:{request.remote_addr}", REGISTER_MAX_ATTEMPTS, RATE_WINDOW_SECONDS)

    if not name:
        raise ApiError("Informe seu nome", 400)
    if not email or "@" not in email:
        raise ApiError("Informe um email válido", 400)
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ApiError(f"A senha deve ter pelo menos {MIN_PASSWORD_LENGTH} caracteres", 400)
    if len(password.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ApiError("A senha é muito longa", 400)

    if User.query.filter_by(email=email).first() is not None:
        raise ApiError("Já existe uma conta com este email", 409)

    user = User(name=name, email=email, password_hash=hash_password(password))
    db.session.add(user)
    db.session.commit()

    token = issue_token(user)
    return {"token": token, "user": user.to_dict()}, 201


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        raise ApiError("Informe email e senha", 400)

    rate_key = f"login:{email}"
    hit(rate_key, LOGIN_MAX_ATTEMPTS, RATE_WINDOW_SECONDS)

    user = User.query.filter_by(email=email).first()
    if user is None or user.deleted_at is not None or not verify_password(password, user.password_hash):
        raise ApiError("Email ou senha inválidos", 401)

    reset(rate_key)
    token = issue_token(user)
    return {"token": token, "user": user.to_dict()}


@auth_bp.get("/me")
@login_required
def me():
    return {"user": g.current_user.to_dict()}


@auth_bp.patch("/me")
@login_required
def update_me():
    data = request.get_json(silent=True) or {}
    user = g.current_user

    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise ApiError("Informe seu nome", 400)
        user.name = name
    if "avatar_url" in data:
        user.avatar_url = (data["avatar_url"] or "").strip() or None
    if "currency_default" in data:
        currency = (data["currency_default"] or "").strip() or "BRL"
        user.currency_default = currency

    db.session.commit()
    return {"user": user.to_dict()}
