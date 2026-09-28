"""
Subir y ver archivos de un pedido (imagenes, planos, PDFs, Excel...).
"""
from pathlib import PurePath

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import requiere
from app.core.eventos import anotar_evento
from app.core.tipos import FechaUTC
from app.modulos.adjuntos import blob
from app.modulos.adjuntos.model import Adjunto
from app.modulos.chat.model import Mensaje
from app.modulos.notificaciones.service import registrar_evento
from app.modulos.pedidos import service as pedidos
from app.modulos.usuarios.model import Usuario
from app.modulos.usuarios.schemas import UsuarioMini

router = APIRouter(tags=["adjuntos"])
settings = get_settings()
MAX_ARCHIVOS_POR_SUBIDA = 15


class AdjuntoOut(BaseModel):
    id: int
    pedido_id: int
    mensaje_id: int | None
    nombre: str
    tipo_mime: str
    tamano_bytes: int
    es_imagen: bool
    url: str             # para ver / previsualizar
    url_descarga: str    # fuerza descarga con el nombre original
    subido_por: UsuarioMini
    creado_en: FechaUTC


def adjunto_out(a: Adjunto) -> AdjuntoOut:
    return AdjuntoOut(
        id=a.id, pedido_id=a.pedido_id, mensaje_id=a.mensaje_id, nombre=a.nombre_original,
        tipo_mime=a.tipo_mime, tamano_bytes=a.tamano_bytes, es_imagen=a.es_imagen,
        url=blob.url_firmada(a.blob_nombre),
        url_descarga=blob.url_firmada(a.blob_nombre, nombre_descarga=a.nombre_original),
        subido_por=UsuarioMini.model_validate(a.subido_por), creado_en=a.creado_en,
    )


def _revisar_archivo(archivo: UploadFile) -> tuple[str, str]:
    nombre = PurePath(archivo.filename or "archivo").name  # sin rutas raras tipo ..\..\
    extension = nombre.rsplit(".", 1)[-1].lower() if "." in nombre else ""
    if extension not in settings.extensiones_permitidas:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"No se permiten archivos .{extension or '(sin extensión)'}")
    maximo = settings.adjunto_max_mb * 1024 * 1024
    if archivo.size is not None and archivo.size > maximo:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"{nombre} pasa el límite de {settings.adjunto_max_mb} MB")
    return nombre, blob.adivinar_mime(nombre)


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
    if len(archivos) > MAX_ARCHIVOS_POR_SUBIDA:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Máximo {MAX_ARCHIVOS_POR_SUBIDA} archivos por subida")
    if mensaje_id:
        m = db.get(Mensaje, mensaje_id)
        if not m or m.pedido_id != pedido_id or m.autor_id != usuario.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ese mensaje no es tuyo o no es de este pedido")

    # primero se revisan TODOS; si uno esta malo no se sube ninguno
    revisados = [(a, *_revisar_archivo(a)) for a in archivos]

    subidos: list[str] = []
    nuevos: list[Adjunto] = []
    try:
        for archivo, nombre, mime in revisados:
            archivo.file.seek(0, 2)
            tamano = archivo.file.tell()
            archivo.file.seek(0)
            if tamano > settings.adjunto_max_mb * 1024 * 1024:
                raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"{nombre} pasa el límite de {settings.adjunto_max_mb} MB")
            blob_nombre = blob.subir(pedido.codigo, nombre, archivo.file, mime)
            subidos.append(blob_nombre)
            a = Adjunto(pedido_id=pedido_id, mensaje_id=mensaje_id, nombre_original=nombre, blob_nombre=blob_nombre,
                        tipo_mime=mime, tamano_bytes=tamano, subido_por_id=usuario.id, subido_por=usuario)
            db.add(a)
            nuevos.append(a)

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
        # si la base falla, que no queden archivos huerfanos en el Blob
        db.rollback()
        for b in subidos:
            try:
                blob.borrar(b)
            except Exception:  # noqa: BLE001
                pass
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
