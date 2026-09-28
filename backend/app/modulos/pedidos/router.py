import json

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import requiere
from app.modulos.pedidos import service
from app.modulos.pedidos.model import ChecklistItem, Historial
from app.modulos.pedidos.schemas import (
    ChecklistEditar, ChecklistIn, HistorialOut, MiembrosIn, MoverIn, PedidoCrear,
    PedidoDetalle, PedidoEditar,
)
from app.modulos.usuarios.model import Usuario

router = APIRouter(prefix="/pedidos", tags=["pedidos"])


@router.post("", response_model=PedidoDetalle, status_code=status.HTTP_201_CREATED)
def crear(datos: PedidoCrear, usuario: Usuario = Depends(requiere("pedido.crear")), db: Session = Depends(get_db)):
    pedido = service.crear(db, datos, usuario)
    return service.a_detalle(db, pedido, usuario)


@router.get("/{pedido_id}", response_model=PedidoDetalle)
def detalle(pedido_id: int, usuario: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db)):
    return service.a_detalle(db, service.obtener(db, pedido_id), usuario)


@router.patch("/{pedido_id}", response_model=PedidoDetalle)
def editar(
    pedido_id: int, datos: PedidoEditar,
    usuario: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db),
):
    # el permiso fino (editor o comercial dueño en primera columna) lo decide el service
    pedido = service.editar(db, service.obtener(db, pedido_id), datos, usuario)
    return service.a_detalle(db, pedido, usuario)


@router.post("/{pedido_id}/mover", response_model=PedidoDetalle)
def mover(
    pedido_id: int, datos: MoverIn,
    usuario: Usuario = Depends(requiere("tarjeta.mover")), db: Session = Depends(get_db),
):
    pedido = service.mover(db, service.obtener(db, pedido_id), datos, usuario)
    return service.a_detalle(db, pedido, usuario)


@router.put("/{pedido_id}/miembros", response_model=PedidoDetalle)
def asignar(
    pedido_id: int, datos: MiembrosIn,
    usuario: Usuario = Depends(requiere("pedido.editar")), db: Session = Depends(get_db),
):
    pedido = service.asignar(db, service.obtener(db, pedido_id), datos.asignados, usuario)
    return service.a_detalle(db, pedido, usuario)


@router.post("/{pedido_id}/seguir")
def seguir(pedido_id: int, usuario: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db)):
    return {"siguiendo": service.alternar_seguir(db, service.obtener(db, pedido_id), usuario)}


@router.delete("/{pedido_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(pedido_id: int, usuario: Usuario = Depends(requiere("pedido.eliminar")), db: Session = Depends(get_db)):
    service.eliminar(db, service.obtener(db, pedido_id), usuario)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{pedido_id}/historial", response_model=list[HistorialOut])
def historial(pedido_id: int, _: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db)):
    service.verificar_existe(db, pedido_id)
    filas = db.scalars(
        select(Historial).where(Historial.pedido_id == pedido_id).order_by(Historial.id.desc()).limit(200)
    ).all()
    return [
        HistorialOut(
            id=h.id, accion=h.accion, usuario=h.usuario, creado_en=h.creado_en,
            detalle=json.loads(h.detalle) if h.detalle else None,
        )
        for h in filas
    ]


# Checklist

def _item_editable(db: Session, item_id: int, usuario: Usuario) -> ChecklistItem:
    item = db.get(ChecklistItem, item_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ese ítem no existe")
    pedido = service.obtener(db, item.pedido_id)
    if not service.puede_editar(usuario, pedido, service.columna_inicial(db).id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No puedes editar este pedido")
    return item


@router.post("/{pedido_id}/checklist", response_model=PedidoDetalle)
def agregar_item(
    pedido_id: int, datos: ChecklistIn,
    usuario: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db),
):
    pedido = service.obtener(db, pedido_id)
    if not service.puede_editar(usuario, pedido, service.columna_inicial(db).id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No puedes editar este pedido")
    service.agregar_item(db, pedido, datos.texto, usuario)
    return service.a_detalle(db, pedido, usuario)


@router.patch("/checklist/{item_id}", response_model=PedidoDetalle)
def editar_item(
    item_id: int, datos: ChecklistEditar,
    usuario: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db),
):
    item = _item_editable(db, item_id, usuario)
    service.editar_item(db, item, datos.texto, datos.hecho, usuario)
    return service.a_detalle(db, service.obtener(db, item.pedido_id), usuario)


@router.delete("/checklist/{item_id}", response_model=PedidoDetalle)
def borrar_item(item_id: int, usuario: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db)):
    item = _item_editable(db, item_id, usuario)
    pedido = service.obtener(db, item.pedido_id)
    pedido.checklist.remove(item)
    db.commit()
    return service.a_detalle(db, pedido, usuario)
