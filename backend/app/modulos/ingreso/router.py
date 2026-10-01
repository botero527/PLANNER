from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import requiere
from app.modulos.ingreso import service
from app.modulos.pedidos import service as pedidos
from app.modulos.pedidos.schemas import PedidoDetalle
from app.modulos.usuarios.model import Usuario

router = APIRouter(prefix="/pedidos/{pedido_id}/ingreso", tags=["ingreso"])


class NumeroIn(BaseModel):
    numero: str = Field(min_length=1, max_length=60)


@router.post("/codigo-vehiculo", response_model=PedidoDetalle)
def marcar_codigo(
    pedido_id: int,
    evidencia: list[UploadFile] = File(...),
    codigo: str | None = Form(default=None, max_length=80),
    usuario: Usuario = Depends(requiere("ingreso.gestionar")),
    db: Session = Depends(get_db),
):
    pedido = service.marcar_codigo(db, pedidos.obtener(db, pedido_id), codigo, evidencia, usuario)
    return pedidos.a_detalle(db, pedido, usuario)


@router.delete("/codigo-vehiculo", response_model=PedidoDetalle)
def deshacer_codigo(pedido_id: int, usuario: Usuario = Depends(requiere("ingreso.gestionar")), db: Session = Depends(get_db)):
    pedido = service.deshacer_codigo(db, pedidos.obtener(db, pedido_id), usuario)
    return pedidos.a_detalle(db, pedido, usuario)


@router.put("/numero-pedido", response_model=PedidoDetalle)
def poner_numero(
    pedido_id: int, datos: NumeroIn,
    usuario: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db),
):
    # quien puede (el comercial dueño o admin) lo decide el service
    pedido = service.poner_numero(db, pedidos.obtener(db, pedido_id), datos.numero, usuario)
    return pedidos.a_detalle(db, pedido, usuario)


@router.post("/aprobar", response_model=PedidoDetalle)
def aprobar(pedido_id: int, usuario: Usuario = Depends(requiere("ingreso.gestionar")), db: Session = Depends(get_db)):
    pedido = service.aprobar(db, pedidos.obtener(db, pedido_id), usuario)
    return pedidos.a_detalle(db, pedido, usuario)
