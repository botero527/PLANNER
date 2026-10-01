"""
Como sale un archivo hacia el frontend. Vive aparte del router para que otros
modulos (pedidos, ingreso, chat) lo usen sin importarse en circulo.
"""
from pydantic import BaseModel

from app.core.tipos import FechaUTC
from app.modulos.adjuntos import blob
from app.modulos.adjuntos.model import Adjunto
from app.modulos.usuarios.schemas import UsuarioMini


class AdjuntoOut(BaseModel):
    id: int
    pedido_id: int
    mensaje_id: int | None
    nombre: str
    tipo_mime: str
    tamano_bytes: int
    es_imagen: bool
    categoria: str       # general | evidencia_codigo
    url: str             # para ver / previsualizar
    url_descarga: str    # fuerza descarga con el nombre original
    subido_por: UsuarioMini
    creado_en: FechaUTC


def adjunto_out(a: Adjunto) -> AdjuntoOut:
    return AdjuntoOut(
        id=a.id, pedido_id=a.pedido_id, mensaje_id=a.mensaje_id, nombre=a.nombre_original,
        tipo_mime=a.tipo_mime, tamano_bytes=a.tamano_bytes, es_imagen=a.es_imagen, categoria=a.categoria,
        url=blob.url_firmada(a.blob_nombre),
        url_descarga=blob.url_firmada(a.blob_nombre, nombre_descarga=a.nombre_original),
        subido_por=UsuarioMini.model_validate(a.subido_por), creado_en=a.creado_en,
    )
