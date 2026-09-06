from functools import wraps

import jwt
from flask import g, request

from app.errors import ApiError
from app.extensions import db
from app.models import User
from app.services.auth_service import decode_token
from app.services.finance_service import sync_due_installments


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise ApiError("Token de autenticação ausente", 401)

        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            raise ApiError("Sessão expirada, faça login novamente", 401)
        except jwt.InvalidTokenError:
            raise ApiError("Token inválido", 401)

        user = User.query.get(payload["sub"])
        if user is None or user.deleted_at is not None:
            raise ApiError("Usuário não encontrado", 401)

        g.current_user = user
        sync_due_installments(user.id)
        db.session.commit()
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        if not g.current_user.is_admin:
            raise ApiError("Acesso restrito a administradores", 403)
        return fn(*args, **kwargs)

    return wrapper
