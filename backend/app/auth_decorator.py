from functools import wraps

import jwt
from flask import g, request

from app.errors import ApiError
from app.models import User
from app.services.auth_service import decode_token


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise ApiError("Token de autenticacao ausente", 401)

        token = auth_header.split(" ", 1)[1].strip()
        try:
            payload = decode_token(token)
        except jwt.ExpiredSignatureError:
            raise ApiError("Sessao expirada, faca login novamente", 401)
        except jwt.InvalidTokenError:
            raise ApiError("Token invalido", 401)

        user = User.query.get(payload["sub"])
        if user is None or user.deleted_at is not None:
            raise ApiError("Usuario nao encontrado", 401)

        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper
