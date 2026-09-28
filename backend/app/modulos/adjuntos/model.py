from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Unicode, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.modulos.usuarios.model import Usuario


class Adjunto(Base):
    """Solo los datos del archivo. El archivo en si vive en Azure Blob,
    en el contenedor planner-adjuntos, con el nombre de blob_nombre."""

    __tablename__ = "ADJUNTOS"

    id: Mapped[int] = mapped_column(primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("PEDIDOS.id", ondelete="CASCADE"), index=True)
    mensaje_id: Mapped[int | None] = mapped_column(ForeignKey("MENSAJES.id"))  # si se subio desde el chat
    nombre_original: Mapped[str] = mapped_column(Unicode(255))
    blob_nombre: Mapped[str] = mapped_column(Unicode(400), unique=True)
    tipo_mime: Mapped[str] = mapped_column(String(120))
    tamano_bytes: Mapped[int] = mapped_column(BigInteger)
    subido_por_id: Mapped[int] = mapped_column(ForeignKey("USUARIOS.id"))
    eliminado: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.sysutcdatetime())

    subido_por: Mapped[Usuario] = relationship(lazy="joined")

    @property
    def es_imagen(self) -> bool:
        return self.tipo_mime.startswith("image/")
