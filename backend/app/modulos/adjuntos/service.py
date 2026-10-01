"""
Guardar archivos de un pedido en el Blob + su fila en ADJUNTOS. Lo usan la
pestaña Archivos, el chat y la evidencia del codigo de vehiculo.
"""
from pathlib import PurePath

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modulos.adjuntos import blob
from app.modulos.adjuntos.model import Adjunto
from app.modulos.usuarios.model import Usuario

settings = get_settings()
MAX_ARCHIVOS_POR_SUBIDA = 15


def revisar(archivo: UploadFile) -> tuple[str, str]:
    nombre = PurePath(archivo.filename or "archivo").name  # sin rutas raras tipo ..\..\
    extension = nombre.rsplit(".", 1)[-1].lower() if "." in nombre else ""
    if extension not in settings.extensiones_permitidas:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"No se permiten archivos .{extension or '(sin extensión)'}")
    maximo = settings.adjunto_max_mb * 1024 * 1024
    if archivo.size is not None and archivo.size > maximo:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"{nombre} pasa el límite de {settings.adjunto_max_mb} MB")
    return nombre, blob.adivinar_mime(nombre)


def guardar(
    db: Session, *, pedido_id: int, codigo_pedido: str, archivos: list[UploadFile], usuario: Usuario,
    mensaje_id: int | None = None, categoria: str = "general",
) -> tuple[list[Adjunto], list[str]]:
    """Sube los archivos y deja las filas en la sesion (SIN commit).
    Devuelve (adjuntos, nombres en el blob) para que quien llama haga commit o,
    si algo falla, borre del blob lo que alcanzo a subir (ver borrar_subidos)."""
    if not archivos:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No llegó ningún archivo")
    if len(archivos) > MAX_ARCHIVOS_POR_SUBIDA:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Máximo {MAX_ARCHIVOS_POR_SUBIDA} archivos por subida")

    # primero se revisan TODOS; si uno esta malo no se sube ninguno
    revisados = [(a, *revisar(a)) for a in archivos]
    nuevos: list[Adjunto] = []
    subidos: list[str] = []
    try:
        for archivo, nombre, mime in revisados:
            archivo.file.seek(0, 2)
            tamano = archivo.file.tell()
            archivo.file.seek(0)
            if tamano > settings.adjunto_max_mb * 1024 * 1024:
                raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, f"{nombre} pasa el límite de {settings.adjunto_max_mb} MB")
            blob_nombre = blob.subir(codigo_pedido, nombre, archivo.file, mime)
            subidos.append(blob_nombre)
            a = Adjunto(pedido_id=pedido_id, mensaje_id=mensaje_id, nombre_original=nombre, blob_nombre=blob_nombre,
                        tipo_mime=mime, tamano_bytes=tamano, subido_por_id=usuario.id, subido_por=usuario, categoria=categoria)
            db.add(a)
            nuevos.append(a)
    except Exception:
        borrar_subidos(subidos)
        raise
    return nuevos, subidos


def borrar_subidos(subidos: list[str]) -> None:
    """Si la base fallo despues de subir, que no queden archivos huerfanos en el Blob."""
    for b in subidos:
        try:
            blob.borrar(b)
        except Exception:  # noqa: BLE001
            pass
