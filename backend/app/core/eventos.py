"""
Eventos en vivo que esperan al commit.

Si un endpoint avisara por WebSocket ANTES de guardar, y despues el commit
fallara, todos verian una tarjeta movida que en realidad nunca se movio.
Por eso los endpoints solo "anotan" el evento en la sesion, y este listener
los manda cuando la base confirma el commit. Si hay rollback, se botan.
"""
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.db import SesionLocal
from app.modulos.tiempo_real.hub import hub

_CLAVE = "eventos_pendientes"


def anotar_evento(db: Session, tipo: str, **datos) -> None:
    db.info.setdefault(_CLAVE, []).append((tipo, datos))


@event.listens_for(SesionLocal, "after_commit")
def _publicar(sesion: Session) -> None:
    for tipo, datos in sesion.info.pop(_CLAVE, []):
        hub.publicar(tipo, datos)


@event.listens_for(SesionLocal, "after_rollback")
def _descartar(sesion: Session) -> None:
    sesion.info.pop(_CLAVE, None)
