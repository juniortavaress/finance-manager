import datetime as dt
import time
import uuid
from functools import wraps

import jwt
from flask import g, request

from app.errors import ApiError
from app.extensions import commit_if_dirty
from app.models import AuthSession, User
from app.services.auth_service import decode_token
from app.services.finance_service import sync_due_installments


# A confirmacao de parcelas vencidas so' muda quando o dia vira - nao precisa
# de uma query extra em TODA requisicao. No maximo uma checagem por usuario
# por minuto (por processo).
_SYNC_INTERVAL_SECONDS = 60
_last_sync_by_user = {}

# O ultimo acesso de cada dispositivo so e atualizado a cada alguns minutos.
_LAST_USED_INTERVAL = dt.timedelta(minutes=5)


def _sync_installments_throttled(user_id):
    now = time.monotonic()
    last = _last_sync_by_user.get(user_id)
    if last is not None and now - last < _SYNC_INTERVAL_SECONDS:
        return
    _last_sync_by_user[user_id] = now
    sync_due_installments(user_id)


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

        if user.tokens_valid_after is not None and payload.get("iat", 0) < int(user.tokens_valid_after.timestamp()):
            raise ApiError("Sessão encerrada, faça login novamente", 401)

        g.current_session_id = None
        sid = payload.get("sid")
        if sid:
            try:
                session = AuthSession.query.filter_by(id=uuid.UUID(sid), user_id=user.id).first()
            except ValueError:
                session = None
            now = dt.datetime.now(dt.timezone.utc)
            if session is None or session.expires_at < now:
                raise ApiError("Sessão encerrada, faça login novamente", 401)
            if session.last_used_at is None or now - session.last_used_at > _LAST_USED_INTERVAL:
                session.last_used_at = now
            g.current_session_id = session.id

        g.current_user = user
        _sync_installments_throttled(user.id)
        commit_if_dirty()
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
