"""
Subir y ver archivos de un pedido (imagenes, planos, PDFs, Excel...).
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import requiere
from app.core.eventos import anotar_evento
from app.modulos.adjuntos import blob
from app.modulos.adjuntos import service as archivos_service
from app.modulos.adjuntos.model import Adjunto
from app.modulos.adjuntos.schemas import AdjuntoOut, adjunto_out  # noqa: F401 (el chat lo importa de aca)
from app.modulos.chat.model import Mensaje
from app.modulos.notificaciones.service import registrar_evento
from app.modulos.pedidos import service as pedidos
from app.modulos.usuarios.model import Usuario

router = APIRouter(tags=["adjuntos"])
settings = get_settings()


@router.get("/pedidos/{pedido_id}/adjuntos", response_model=list[AdjuntoOut])
def listar(pedido_id: int, _: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db)):
    pedidos.verificar_existe(db, pedido_id)
    filas = db.scalars(
        select(Adjunto).where(Adjunto.pedido_id == pedido_id, Adjunto.eliminado == False)  # noqa: E712
        .order_by(Adjunto.id.desc())
    )
    return [adjunto_out(a) for a in filas]


@router.post("/pedidos/{pedido_id}/adjuntos", response_model=list[AdjuntoOut], status_code=status.HTTP_201_CREATED)
def subir(
    pedido_id: int,
    archivos: list[UploadFile] = File(...),
    mensaje_id: int | None = Form(default=None),
    usuario: Usuario = Depends(requiere("adjunto.subir")),
    db: Session = Depends(get_db),
):
    pedido = pedidos.obtener(db, pedido_id)
    if mensaje_id:
        m = db.get(Mensaje, mensaje_id)
        if not m or m.pedido_id != pedido_id or m.autor_id != usuario.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ese mensaje no es tuyo o no es de este pedido")

    nuevos, subidos = archivos_service.guardar(
        db, pedido_id=pedido_id, codigo_pedido=pedido.codigo, archivos=archivos, usuario=usuario, mensaje_id=mensaje_id,
    )
    try:
        if not mensaje_id:  # lo que se sube desde el chat ya avisa con el mensaje
            registrar_evento(
                db, pedido=pedido, actor=usuario, accion="adjunto.subido",
                titulo=f"{usuario.nombre} subió {len(nuevos)} archivo(s) a {pedido.codigo}",
                cuerpo=", ".join(a.nombre_original for a in nuevos)[:500],
                detalle={"archivos": [a.nombre_original for a in nuevos]},
            )
        anotar_evento(db, "adjuntos.cambio", pedido_id=pedido_id, mensaje_id=mensaje_id)
        db.commit()
    except Exception:
        db.rollback()
        archivos_service.borrar_subidos(subidos)
        raise
    return [adjunto_out(a) for a in nuevos]


@router.get("/adjuntos/{adjunto_id}/descargar")
def descargar(adjunto_id: int, _: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db)):
    a = db.get(Adjunto, adjunto_id)
    if not a or a.eliminado:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ese archivo no existe")
    return RedirectResponse(blob.url_firmada(a.blob_nombre, nombre_descarga=a.nombre_original))


@router.delete("/adjuntos/{adjunto_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(adjunto_id: int, usuario: Usuario = Depends(requiere("adjunto.subir")), db: Session = Depends(get_db)):
    a = db.get(Adjunto, adjunto_id)
    if not a or a.eliminado:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ese archivo no existe")
    if a.subido_por_id != usuario.id and not usuario.puede("pedido.eliminar"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo quien lo subió (o un admin) lo puede quitar")
    # borrado suave: el blob se queda por si toca recuperarlo
    a.eliminado = True
    anotar_evento(db, "adjuntos.cambio", pedido_id=a.pedido_id, mensaje_id=a.mensaje_id)
    db.commit()
