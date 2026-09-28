from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, UnicodeText, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.modulos.usuarios.model import Usuario


class Mensaje(Base):
    """Un mensaje del chat de un pedido. Nunca se borra de verdad: se marca
    eliminado para que la conversacion no quede con huecos raros."""

    __tablename__ = "MENSAJES"

    id: Mapped[int] = mapped_column(primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("PEDIDOS.id", ondelete="CASCADE"), index=True)
    autor_id: Mapped[int] = mapped_column(ForeignKey("USUARIOS.id"))
    texto: Mapped[str] = mapped_column(UnicodeText)
    respuesta_a_id: Mapped[int | None] = mapped_column(ForeignKey("MENSAJES.id"))
    editado_en: Mapped[datetime | None] = mapped_column(DateTime)
    eliminado: Mapped[bool] = mapped_column(Boolean, default=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.sysutcdatetime())

    autor: Mapped[Usuario] = relationship(lazy="joined")
