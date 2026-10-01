"""
El pedido es la tarjeta del tablero. Todo lo demas cuelga de el:
piezas, miembros, etiquetas, checklist, historial, chat y adjuntos.
"""
from datetime import date, datetime

from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Sequence, String, Table,
    Unicode, UnicodeText, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, ConFechas
from app.modulos.tablero.model import Etiqueta
from app.modulos.usuarios.model import Usuario

# La secuencia la maneja SQL Server, entonces dos comerciales creando pedidos
# en el mismo segundo nunca van a sacar el mismo consecutivo.
SEQ_PEDIDOS = Sequence("SEQ_PEDIDOS", start=1, metadata=Base.metadata)

pedido_etiquetas = Table(
    "PEDIDO_ETIQUETAS",
    Base.metadata,
    Column("pedido_id", ForeignKey("PEDIDOS.id", ondelete="CASCADE"), primary_key=True),
    Column("etiqueta_id", ForeignKey("ETIQUETAS.id", ondelete="CASCADE"), primary_key=True),
)


class Pedido(ConFechas, Base):
    __tablename__ = "PEDIDOS"
    __table_args__ = (Index("IX_PEDIDOS_columna_posicion", "columna_id", "posicion"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)  # PED-2026-0001
    marca: Mapped[str] = mapped_column(Unicode(80))
    modelo: Mapped[str] = mapped_column(Unicode(120))
    version_vehiculo: Mapped[str | None] = mapped_column(Unicode(120))  # "version" ya es el control de concurrencia
    plataforma: Mapped[str | None] = mapped_column(Unicode(80))  # generacion de plataforma o codigo de modelo
    anio: Mapped[int | None] = mapped_column(Integer)
    # texto libre y sin limite: a veces pegan varios VIN o traen notas
    vin: Mapped[str] = mapped_column(UnicodeText)
    mercado: Mapped[str] = mapped_column(Unicode(40))  # opciones en CONFIGURACION "pedido.mercados"
    tipo_vidrio: Mapped[str] = mapped_column(String(10), default="original")  # original|3d
    info_en_drive: Mapped[bool | None] = mapped_column(Boolean)  # solo aplica si es 3d
    descripcion: Mapped[str | None] = mapped_column(UnicodeText)
    # el comercial ya no los llena; quedan para que el equipo interno los use si quiere
    prioridad: Mapped[str] = mapped_column(String(10), default="media")  # baja|media|alta|urgente
    fecha_requerida: Mapped[date | None] = mapped_column(Date)

    columna_id: Mapped[int] = mapped_column(ForeignKey("COLUMNAS.id"))
    posicion: Mapped[int] = mapped_column(Integer)  # orden dentro de la columna, con huecos de 1024

    creado_por_id: Mapped[int] = mapped_column(ForeignKey("USUARIOS.id"))
    completado_en: Mapped[datetime | None] = mapped_column(DateTime)
    eliminado: Mapped[bool] = mapped_column(Boolean, default=False)

    # Campos que todavia no sabemos si van a existir. Se guardan como JSON y
    # cuando uno se vuelva fijo se pasa a columna de verdad.
    datos_extra: Mapped[str | None] = mapped_column(UnicodeText)

    # Control de concurrencia: si dos personas editan a la vez, el segundo
    # recibe error en vez de pisar al primero sin darse cuenta.
    version: Mapped[int] = mapped_column(Integer, default=1)
    __mapper_args__ = {"version_id_col": version}

    creado_por: Mapped[Usuario] = relationship(foreign_keys=[creado_por_id], lazy="joined")
    piezas: Mapped[list["PedidoPieza"]] = relationship(
        back_populates="pedido", cascade="all, delete-orphan", lazy="selectin",
        order_by="PedidoPieza.orden",
    )
    miembros: Mapped[list["PedidoMiembro"]] = relationship(
        back_populates="pedido", cascade="all, delete-orphan", lazy="selectin",
    )
    etiquetas: Mapped[list[Etiqueta]] = relationship(secondary=pedido_etiquetas, lazy="selectin")
    checklist: Mapped[list["ChecklistItem"]] = relationship(
        back_populates="pedido", cascade="all, delete-orphan", lazy="selectin",
        order_by="ChecklistItem.orden",
    )


class PedidoPieza(Base):
    __tablename__ = "PEDIDO_PIEZAS"

    id: Mapped[int] = mapped_column(primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("PEDIDOS.id", ondelete="CASCADE"), index=True)
    codigo: Mapped[str | None] = mapped_column(String(3))  # codigo AGP de la pieza (000 = Parabrisas...)
    nombre: Mapped[str] = mapped_column(Unicode(150))
    cantidad: Mapped[int] = mapped_column(Integer, default=1)  # ya no se pide, queda en 1
    observacion: Mapped[str | None] = mapped_column(Unicode(500))
    orden: Mapped[int] = mapped_column(Integer, default=0)

    pedido: Mapped[Pedido] = relationship(back_populates="piezas")


class PedidoMiembro(Base):
    __tablename__ = "PEDIDO_MIEMBROS"

    pedido_id: Mapped[int] = mapped_column(ForeignKey("PEDIDOS.id", ondelete="CASCADE"), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("USUARIOS.id"), primary_key=True)
    tipo: Mapped[str] = mapped_column(String(10), default="asignado")  # asignado|seguidor

    pedido: Mapped[Pedido] = relationship(back_populates="miembros")
    usuario: Mapped[Usuario] = relationship(lazy="joined")


class ChecklistItem(Base):
    __tablename__ = "CHECKLIST"

    id: Mapped[int] = mapped_column(primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("PEDIDOS.id", ondelete="CASCADE"), index=True)
    texto: Mapped[str] = mapped_column(Unicode(300))
    hecho: Mapped[bool] = mapped_column(Boolean, default=False)
    orden: Mapped[int] = mapped_column(Integer, default=0)
    hecho_por_id: Mapped[int | None] = mapped_column(ForeignKey("USUARIOS.id"))
    hecho_en: Mapped[datetime | None] = mapped_column(DateTime)

    pedido: Mapped[Pedido] = relationship(back_populates="checklist")


class Historial(Base):
    """Cada cosa que pasa con un pedido queda aca. Es la bitacora y de aca
    salen las notificaciones."""

    __tablename__ = "HISTORIAL"

    id: Mapped[int] = mapped_column(primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("PEDIDOS.id", ondelete="CASCADE"), index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("USUARIOS.id"))
    accion: Mapped[str] = mapped_column(String(40))  # creado, movido, editado, comentario...
    detalle: Mapped[str | None] = mapped_column(UnicodeText)  # JSON con el antes/despues
    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.sysutcdatetime())

    usuario: Mapped[Usuario] = relationship(lazy="joined")
