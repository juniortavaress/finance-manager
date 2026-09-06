import datetime as dt
from decimal import Decimal

from flask import Blueprint, g, request

from app.auth_decorator import admin_required
from app.errors import ApiError
from app.extensions import db
from app.models import MarketCorporateEvent
from app.models.market_corporate_event import MARKET_CORPORATE_EVENT_TYPES

market_data_bp = Blueprint("market_data", __name__)


def _normalize_code(code):
    return (code or "").strip().upper() or None


@market_data_bp.get("/market-corporate-events")
@admin_required
def list_market_corporate_events():
    events = MarketCorporateEvent.query.order_by(MarketCorporateEvent.date.desc()).all()
    return {"market_corporate_events": [e.to_dict() for e in events]}


@market_data_bp.post("/market-corporate-events")
@admin_required
def create_market_corporate_event():
    data = request.get_json(silent=True) or {}

    event_type = data.get("type")
    if event_type not in MARKET_CORPORATE_EVENT_TYPES:
        raise ApiError("Tipo de evento inválido", 400)

    target_code = _normalize_code(data.get("target_code"))
    if not target_code:
        raise ApiError("Informe o código do ativo", 400)

    date_raw = data.get("date")
    if not date_raw:
        raise ApiError("Data é obrigatória", 400)
    event_date = dt.date.fromisoformat(date_raw)

    ratio_raw = data.get("ratio")
    if ratio_raw in (None, ""):
        raise ApiError("Informe a proporção", 400)
    ratio = Decimal(str(ratio_raw))
    if ratio <= 0:
        raise ApiError("A proporção deve ser maior que zero", 400)

    source_code = _normalize_code(data.get("source_code"))
    if event_type == "split":
        if source_code:
            raise ApiError("Desdobramento/grupamento não usa código de origem", 400)
    else:
        if not source_code:
            raise ApiError("Informe o código de origem da incorporação", 400)
        if source_code == target_code:
            raise ApiError("Código de origem e de destino não podem ser iguais", 400)
        if MarketCorporateEvent.query.filter_by(type="merger", source_code=source_code).first():
            raise ApiError("Este código já é origem de outra incorporação registrada", 400)
        if source_code in _merger_targets_reachable_from(target_code):
            raise ApiError("Essa incorporação criaria um ciclo entre os códigos", 400)

    event = MarketCorporateEvent(
        type=event_type,
        target_code=target_code,
        source_code=source_code,
        date=event_date,
        ratio=ratio,
        note=(data.get("note") or "").strip() or None,
        created_by_user_id=g.current_user.id,
    )
    db.session.add(event)
    db.session.commit()
    return {"market_corporate_event": event.to_dict()}, 201


def _merger_targets_reachable_from(code):
    """Codigos alcancaveis como target_code partindo de `code` como source,
    seguindo a cadeia de mergers existentes - usado para bloquear ciclos."""
    reachable = set()
    frontier = [code]
    mergers = MarketCorporateEvent.query.filter_by(type="merger").all()
    while frontier:
        current = frontier.pop()
        for e in mergers:
            if e.source_code == current and e.target_code not in reachable:
                reachable.add(e.target_code)
                frontier.append(e.target_code)
    return reachable


@market_data_bp.delete("/market-corporate-events/<uuid:event_id>")
@admin_required
def delete_market_corporate_event(event_id):
    event = MarketCorporateEvent.query.get(event_id)
    if event is None:
        raise ApiError("Evento não encontrado", 404)
    db.session.delete(event)
    db.session.commit()
    return {"ok": True}
