import datetime as dt
import uuid

from flask import Blueprint, g, request

from app.auth_decorator import login_required
from app.errors import ApiError
from app.extensions import db
from app.models import AuthSession, User
from app.rate_limit import hit, reset
from app.validation import clean_https_url
from app.services.auth_service import describe_device, hash_password, issue_token, start_session, verify_password

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

    token = start_session(user, request)
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
    token = start_session(user, request)
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
        user.avatar_url = clean_https_url(data["avatar_url"], "Foto")
    if "currency_default" in data:
        currency = (data["currency_default"] or "").strip() or "BRL"
        user.currency_default = currency

    db.session.commit()
    return {"user": user.to_dict()}


@auth_bp.patch("/password")
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    user = g.current_user
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""

    hit(f"password:{user.id}", LOGIN_MAX_ATTEMPTS, RATE_WINDOW_SECONDS)

    if not verify_password(current, user.password_hash):
        raise ApiError("Senha atual incorreta", 400)
    if len(new) < MIN_PASSWORD_LENGTH:
        raise ApiError(f"A nova senha deve ter pelo menos {MIN_PASSWORD_LENGTH} caracteres", 400)
    if len(new.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ApiError("A nova senha é muito longa", 400)
    if new == current:
        raise ApiError("A nova senha deve ser diferente da atual", 400)

    user.password_hash = hash_password(new)
    # Trocar a senha derruba as outras sessoes; a atual segue com um token novo.
    token = _revoke_other_sessions(user)
    reset(f"password:{user.id}")
    return {"ok": True, "token": token}


def _revoke_other_sessions(user):
    """Encerra todos os outros dispositivos e devolve um token novo para o atual."""
    # tokens_valid_after cobre tokens antigos, emitidos antes de existir a lista de sessoes.
    user.tokens_valid_after = dt.datetime.now(dt.timezone.utc)
    current_id = g.current_session_id
    others = AuthSession.query.filter(AuthSession.user_id == user.id)
    if current_id:
        others = others.filter(AuthSession.id != current_id)
    others.delete(synchronize_session=False)
    db.session.commit()
    if current_id:
        return issue_token(user, current_id)
    return start_session(user, request)


@auth_bp.post("/logout-all")
@login_required
def logout_all():
    return {"ok": True, "token": _revoke_other_sessions(g.current_user)}


@auth_bp.post("/logout")
@login_required
def logout():
    if g.current_session_id:
        AuthSession.query.filter_by(id=g.current_session_id, user_id=g.current_user.id).delete()
        db.session.commit()
    return {"ok": True}


@auth_bp.get("/sessions")
@login_required
def list_sessions():
    now = dt.datetime.now(dt.timezone.utc)
    sessions = (
        AuthSession.query.filter(AuthSession.user_id == g.current_user.id, AuthSession.expires_at >= now)
        .order_by(AuthSession.last_used_at.desc().nullslast(), AuthSession.created_at.desc())
        .all()
    )
    return {
        "sessions": [
            {
                "id": str(s.id),
                "device": describe_device(s.user_agent),
                "ip_address": s.ip_address,
                "created_at": s.created_at.isoformat(),
                "last_used_at": (s.last_used_at or s.created_at).isoformat(),
                "current": s.id == g.current_session_id,
            }
            for s in sessions
        ]
    }


@auth_bp.delete("/sessions/<session_id>")
@login_required
def revoke_session(session_id):
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise ApiError("Sessão não encontrada", 404)
    if sid == g.current_session_id:
        raise ApiError("Para sair deste dispositivo, use o botão Sair do menu", 400)
    deleted = AuthSession.query.filter_by(id=sid, user_id=g.current_user.id).delete()
    db.session.commit()
    if not deleted:
        raise ApiError("Sessão não encontrada", 404)
    return {"ok": True}


@auth_bp.delete("/me")
@login_required
def delete_me():
    """Encerra a conta (exclusao logica). O email e' liberado para um novo cadastro."""
    data = request.get_json(silent=True) or {}
    user = g.current_user

    hit(f"delete-account:{user.id}", LOGIN_MAX_ATTEMPTS, RATE_WINDOW_SECONDS)
    if not verify_password(data.get("password") or "", user.password_hash):
        raise ApiError("Senha incorreta", 400)

    user.deleted_at = dt.datetime.now(dt.timezone.utc)
    AuthSession.query.filter_by(user_id=user.id).delete()
    user.email = f"excluido-{user.id}@atmos.invalid"
    db.session.commit()
    return {"ok": True}

