import datetime as dt
import hashlib
import json

from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.extensions import db
from app.models import ComputedCache
from app.models.base import utcnow


def fingerprint_of(*parts) -> str:
    """Hash estavel de valores simples (datas, numeros, strings, None)."""
    raw = json.dumps(parts, default=str, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_or_compute(user_id, key, fingerprint, compute):
    """Devolve o resultado guardado em computed_cache se a impressao digital
    dos dados de entrada nao mudou; senao chama `compute()` (que devolve um
    dict JSON-serializavel), guarda e devolve. Falha de leitura/escrita do
    cache nunca quebra a rota - cai no calculo normal."""
    try:
        row = db.session.get(ComputedCache, (user_id, key))
        if row is not None and row.fingerprint == fingerprint:
            return row.payload
    except Exception:
        db.session.rollback()

    payload = compute()

    try:
        stmt = pg_insert(ComputedCache).values(
            user_id=user_id, key=key, fingerprint=fingerprint, payload=payload, computed_at=utcnow()
        )
        db.session.execute(
            stmt.on_conflict_do_update(
                index_elements=["user_id", "key"],
                set_={"fingerprint": stmt.excluded.fingerprint, "payload": stmt.excluded.payload, "computed_at": stmt.excluded.computed_at},
            )
        )
        db.session.commit()
    except Exception:
        db.session.rollback()
    return payload
