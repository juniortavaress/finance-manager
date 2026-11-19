from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.extensions import db
from app.models.base import utcnow


class ComputedCache(db.Model):
    """Resultado pre-calculado de uma consulta pesada de um usuario (ex: serie
    mensal de lucro dos investimentos). `fingerprint` resume TODOS os dados de
    entrada do calculo; quando qualquer um muda (operacao passada editada,
    cotacao nova, dia virou...) a impressao digital muda e o resultado e'
    recalculado - nao depende de invalidacao manual em cada escrita."""

    __tablename__ = "computed_cache"

    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    key = db.Column(db.Text, primary_key=True)
    fingerprint = db.Column(db.Text, nullable=False)
    payload = db.Column(JSONB, nullable=False)
    computed_at = db.Column(db.DateTime(timezone=True), default=utcnow, nullable=False)
