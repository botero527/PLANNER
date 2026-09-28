from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Unicode, UnicodeText, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Notificacion(Base):
    """La campanita dentro de la app."""

    __tablename__ = "NOTIFICACIONES"
    __table_args__ = (Index("IX_NOTIFICACIONES_usuario_leida", "usuario_id", "leida_en"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("USUARIOS.id"))
    pedido_id: Mapped[int | None] = mapped_column(ForeignKey("PEDIDOS.id", ondelete="CASCADE"))
    tipo: Mapped[str] = mapped_column(String(40))
    titulo: Mapped[str] = mapped_column(Unicode(200))
    cuerpo: Mapped[str | None] = mapped_column(Unicode(500))
    leida_en: Mapped[datetime | None] = mapped_column(DateTime)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.sysutcdatetime())


class CorreoCola(Base):
    """Bandeja de salida (patron outbox).

    Cuando pasa algo NO mandamos el correo en ese momento: guardamos la fila
    aca en la misma transaccion del cambio. Un proceso aparte la recoge y la
    manda. Si Outlook esta caido, el tablero sigue funcionando y el correo se
    reintenta despues."""

    __tablename__ = "COLA_CORREOS"
    __table_args__ = (Index("IX_COLA_CORREOS_estado_proximo", "estado", "proximo_intento_en"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    para: Mapped[str] = mapped_column(String(150))
    asunto: Mapped[str] = mapped_column(Unicode(250))
    html: Mapped[str] = mapped_column(UnicodeText)
    evento: Mapped[str] = mapped_column(String(40))
    pedido_id: Mapped[int | None] = mapped_column(ForeignKey("PEDIDOS.id", ondelete="SET NULL"))
    estado: Mapped[str] = mapped_column(String(12), default="pendiente")  # pendiente|enviado|error
    intentos: Mapped[int] = mapped_column(Integer, default=0)
    ultimo_error: Mapped[str | None] = mapped_column(Unicode(1000))
    proximo_intento_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.sysutcdatetime())
    enviado_en: Mapped[datetime | None] = mapped_column(DateTime)
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.sysutcdatetime())
