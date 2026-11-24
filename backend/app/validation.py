import re

from app.errors import ApiError

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_URL_LENGTH = 2048


def clean_https_url(value, label):
    """Normaliza uma URL opcional; so' aceita https para nao carregar conteudo
    inseguro nem esquemas como javascript: ou data:."""
    value = (value or "").strip()
    if not value:
        return None
    if len(value) > MAX_URL_LENGTH or not value.lower().startswith("https://"):
        raise ApiError(f"{label} deve ser um link https válido", 400)
    return value


def clean_hex_color(value, label="Cor"):
    value = (value or "").strip()
    if not _HEX_COLOR.match(value):
        raise ApiError(f"{label} inválida", 400)
    return value


def like_pattern(term):
    """Escapa % e _ para que a busca trate o texto digitado como literal."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
