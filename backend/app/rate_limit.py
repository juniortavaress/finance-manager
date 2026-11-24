import time
from collections import defaultdict, deque

from app.errors import ApiError

_attempts = defaultdict(deque)
_MAX_TRACKED_KEYS = 5000


def _prune(now):
    if len(_attempts) < _MAX_TRACKED_KEYS:
        return
    for key in [k for k, hits in _attempts.items() if not hits or hits[-1] < now - 3600]:
        del _attempts[key]


def hit(key, limit, window_seconds):
    """Registra uma tentativa e levanta 429 quando passa de `limit` dentro da janela."""
    now = time.monotonic()
    _prune(now)
    hits = _attempts[key]
    while hits and hits[0] <= now - window_seconds:
        hits.popleft()
    if len(hits) >= limit:
        raise ApiError("Muitas tentativas. Aguarde alguns minutos e tente novamente.", 429)
    hits.append(now)


def reset(key):
    _attempts.pop(key, None)
