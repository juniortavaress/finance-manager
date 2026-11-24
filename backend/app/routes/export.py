import datetime as dt

from flask import Blueprint, Response, g

from app.auth_decorator import login_required
from app.rate_limit import hit
from app.services.export_service import build_user_export

export_bp = Blueprint("export", __name__)

XLSX_MIMETYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@export_bp.get("/")
@login_required
def export_data():
    # Gerar a planilha e' pesado: limita a poucas exportacoes por hora.
    hit(f"export:{g.current_user.id}", 6, 3600)
    content = build_user_export(g.current_user)
    filename = f"meus-dados-financeiros-{dt.date.today().isoformat()}.xlsx"
    return Response(
        content,
        mimetype=XLSX_MIMETYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
