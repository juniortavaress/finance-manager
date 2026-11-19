from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()


def has_pending_changes():
    """True se a sessao tem algo a gravar (novo, alterado de verdade ou
    removido). session.dirty inclui objetos so' "tocados", entao confere
    is_modified para nao contar leitura como escrita."""
    session = db.session
    return bool(session.new or session.deleted or any(session.is_modified(obj) for obj in session.dirty))


def commit_if_dirty():
    """Commit so' quando ha o que gravar. Um commit sem mudancas custa uma
    ida ao banco e, com expire_on_commit, expira todos os objetos carregados
    (cada atributo acessado depois vira uma query nova)."""
    if has_pending_changes():
        db.session.commit()
