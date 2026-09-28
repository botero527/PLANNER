"""
Todo lo de Azure Blob Storage (cuenta saagpingenieria, contenedor planner-adjuntos).

El contenedor es PRIVADO: nadie entra con solo saber la URL. Para ver un
archivo el backend genera una URL con firma SAS (Shared Access Signature)
que vence en unos minutos. Asi, aunque alguien copie el link y lo mande por
WhatsApp, al rato ya no sirve.
"""
import mimetypes
import re
import uuid
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import BinaryIO
from urllib.parse import quote

from azure.storage.blob import BlobSasPermissions, BlobServiceClient, ContentSettings, generate_blob_sas

from app.core.config import get_settings

settings = get_settings()


@lru_cache
def _servicio() -> BlobServiceClient:
    if not settings.azure_storage_connection_string:
        raise RuntimeError("Falta PLN_AZURE_STORAGE_CONNECTION_STRING en el .env")
    return BlobServiceClient.from_connection_string(settings.azure_storage_connection_string)


def _contenedor():
    return _servicio().get_container_client(settings.azure_storage_container)


def nombre_seguro(nombre: str) -> str:
    """Deja el nombre legible pero sin caracteres que rompan URLs o rutas."""
    base = re.sub(r"[^\w.\- ]+", "", nombre, flags=re.UNICODE).strip().replace(" ", "_")
    return base[:150] or "archivo"


def adivinar_mime(nombre: str) -> str:
    return mimetypes.guess_type(nombre)[0] or "application/octet-stream"


def subir(codigo_pedido: str, nombre_original: str, contenido: BinaryIO, tipo_mime: str) -> str:
    # el uuid evita que dos "plano.pdf" del mismo pedido se pisen
    blob_nombre = f"pedidos/{codigo_pedido}/{uuid.uuid4().hex[:12]}_{nombre_seguro(nombre_original)}"
    _contenedor().upload_blob(
        blob_nombre,
        contenido,
        overwrite=False,
        content_settings=ContentSettings(content_type=tipo_mime),
    )
    return blob_nombre


def url_firmada(blob_nombre: str, nombre_descarga: str | None = None) -> str:
    """URL de solo lectura que vence en PLN_ADJUNTO_LINK_MINUTOS.
    Si se pasa nombre_descarga, el navegador lo baja con ese nombre en vez de abrirlo."""
    servicio = _servicio()
    extras = {}
    if nombre_descarga:
        extras["content_disposition"] = f"attachment; filename*=UTF-8''{quote(nombre_descarga)}"
    sas = generate_blob_sas(
        account_name=servicio.account_name,
        container_name=settings.azure_storage_container,
        blob_name=blob_nombre,
        account_key=servicio.credential.account_key,
        permission=BlobSasPermissions(read=True),
        start=datetime.now(UTC) - timedelta(minutes=5),  # margen por relojes desfasados
        expiry=datetime.now(UTC) + timedelta(minutes=settings.adjunto_link_minutos),
        **extras,
    )
    return f"{servicio.url}{settings.azure_storage_container}/{quote(blob_nombre)}?{sas}"


def borrar(blob_nombre: str) -> None:
    _contenedor().delete_blob(blob_nombre, delete_snapshots="include")
