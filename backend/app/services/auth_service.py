import datetime as dt

import bcrypt
import jwt
from flask import current_app

from app.extensions import db
from app.models import AuthSession, User


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def issue_token(user: User, session_id=None) -> str:
    expires_minutes = current_app.config["JWT_EXPIRES_MINUTES"]
    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "iat": now,
        "exp": now + dt.timedelta(minutes=expires_minutes),
    }
    if session_id is not None:
        payload["sid"] = str(session_id)
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])


def _client_ip(request):
    forwarded = request.headers.get("X-Forwarded-For", "")
    return (forwarded.split(",")[0].strip() or request.remote_addr or "")[:64]


def describe_device(user_agent: str) -> str:
    """Resume o User-Agent em algo legivel, como "Chrome no Windows"."""
    ua = user_agent or ""
    if "Edg/" in ua or "EdgA/" in ua:
        browser = "Edge"
    elif "OPR/" in ua or "Opera" in ua:
        browser = "Opera"
    elif "Firefox/" in ua or "FxiOS/" in ua:
        browser = "Firefox"
    elif "Chrome/" in ua or "CriOS/" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = "Navegador"

    if "iPhone" in ua or "iPad" in ua:
        system = "iOS"
    elif "Android" in ua:
        system = "Android"
    elif "Windows" in ua:
        system = "Windows"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        system = "macOS"
    elif "CrOS" in ua:
        system = "ChromeOS"
    elif "Linux" in ua:
        system = "Linux"
    else:
        system = ""
    return f"{browser} no {system}" if system else browser


def start_session(user: User, request) -> str:
    """Registra um novo dispositivo logado e devolve o token ligado a ele."""
    now = dt.datetime.now(dt.timezone.utc)
    expires = now + dt.timedelta(minutes=current_app.config["JWT_EXPIRES_MINUTES"])
    # Limpa sessoes ja vencidas deste usuario para a lista nao crescer sem fim.
    AuthSession.query.filter(AuthSession.user_id == user.id, AuthSession.expires_at < now).delete()
    session = AuthSession(
        user_id=user.id,
        user_agent=(request.headers.get("User-Agent") or "")[:400],
        ip_address=_client_ip(request),
        expires_at=expires,
        last_used_at=now,
    )
    db.session.add(session)
    db.session.commit()
    return issue_token(user, session.id)

