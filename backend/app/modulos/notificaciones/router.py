from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_usuario_actual
from app.core.tipos import FechaUTC
from app.modulos.notificaciones.model import Notificacion
from app.modulos.usuarios.model import Usuario

router = APIRouter(prefix="/notificaciones", tags=["notificaciones"])


class NotificacionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pedido_id: int | None
    tipo: str
    titulo: str
    cuerpo: str | None
    leida_en: FechaUTC | None
    creado_en: FechaUTC


class BandejaOut(BaseModel):
    sin_leer: int
    items: list[NotificacionOut]


class LeerIn(BaseModel):
    ids: list[int] | None = None  # None = marcar todas
    pedido_id: int | None = None  # o todas las de un pedido (al abrirlo)


@router.get("", response_model=BandejaOut)
def bandeja(
    limite: int = Query(default=40, ge=1, le=200),
    usuario: Usuario = Depends(get_usuario_actual),
    db: Session = Depends(get_db),
):
    sin_leer = db.scalar(
        select(func.count()).select_from(Notificacion)
        .where(Notificacion.usuario_id == usuario.id, Notificacion.leida_en.is_(None))
    )
    items = db.scalars(
        select(Notificacion).where(Notificacion.usuario_id == usuario.id)
        .order_by(Notificacion.id.desc()).limit(limite)
    ).all()
    return BandejaOut(sin_leer=sin_leer or 0, items=items)


@router.post("/leer")
def marcar_leidas(datos: LeerIn, usuario: Usuario = Depends(get_usuario_actual), db: Session = Depends(get_db)):
    consulta = update(Notificacion).where(Notificacion.usuario_id == usuario.id, Notificacion.leida_en.is_(None))
    if datos.ids:
        consulta = consulta.where(Notificacion.id.in_(datos.ids))
    if datos.pedido_id:
        consulta = consulta.where(Notificacion.pedido_id == datos.pedido_id)
    resultado = db.execute(consulta.values(leida_en=datetime.now(UTC).replace(tzinfo=None)))
    db.commit()
    return {"marcadas": resultado.rowcount}
