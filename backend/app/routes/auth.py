from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import User
from app.services.auth_service import hash_password, issue_token, verify_password

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name:
        raise ApiError("Informe seu nome", 400)
    if not email or "@" not in email:
        raise ApiError("Informe um email valido", 400)
    if len(password) < 6:
        raise ApiError("A senha deve ter pelo menos 6 caracteres", 400)

    if User.query.filter_by(email=email).first() is not None:
        raise ApiError("Ja existe uma conta com este email", 409)

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

    user = User.query.filter_by(email=email).first()
    if user is None or user.deleted_at is not None or not verify_password(password, user.password_hash):
        raise ApiError("Email ou senha invalidos", 401)

    token = issue_token(user)
    return {"token": token, "user": user.to_dict()}


@auth_bp.get("/me")
@login_required
def me():
    return {"user": g.current_user.to_dict()}
