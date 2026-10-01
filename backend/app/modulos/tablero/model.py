"""
Lo configurable del tablero: columnas (estados), etiquetas y parametros sueltos.
Si mañana cambian los estados del proceso, se cambian estas filas y ya.
"""
from sqlalchemy import Boolean, Integer, String, Unicode, UnicodeText
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, ConFechas


class Columna(ConFechas, Base):
    __tablename__ = "COLUMNAS"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(Unicode(60))
    descripcion: Mapped[str | None] = mapped_column(Unicode(200))
    orden: Mapped[int] = mapped_column(Integer)
    color: Mapped[str] = mapped_column(String(9))
    icono: Mapped[str] = mapped_column(String(30), default="inbox")
    es_inicial: Mapped[bool] = mapped_column(Boolean, default=False)  # aca caen los pedidos nuevos
    es_final: Mapped[bool] = mapped_column(Boolean, default=False)    # llegar aca = pedido terminado
    limite_wip: Mapped[int | None] = mapped_column(Integer)           # maximo de tarjetas, null = sin limite
    activa: Mapped[bool] = mapped_column(Boolean, default=True)


class Etiqueta(Base):
    __tablename__ = "ETIQUETAS"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(Unicode(40), unique=True)
    color: Mapped[str] = mapped_column(String(9))
    activa: Mapped[bool] = mapped_column(Boolean, default=True)


class Configuracion(Base):
    """Parametros clave/valor que el admin puede tocar sin desplegar."""

    __tablename__ = "CONFIGURACION"

    clave: Mapped[str] = mapped_column(String(60), primary_key=True)
    valor: Mapped[str] = mapped_column(UnicodeText)
    descripcion: Mapped[str | None] = mapped_column(Unicode(250))


class CatalogoPieza(Base):
    """Codigos de pieza de AGP (los mismos de Modulo 5). Si alguien escribe 001
    en el formulario se vuelve "Lateral Delantero Izquierdo", y si pide
    simetria entra tambien la simetrica (002)."""

    __tablename__ = "CATALOGO_PIEZAS"

    codigo: Mapped[str] = mapped_column(String(3), primary_key=True)
    nombre: Mapped[str] = mapped_column(Unicode(150))
    simetrica: Mapped[str | None] = mapped_column(String(3))  # codigo de la pieza del otro lado
    activa: Mapped[bool] = mapped_column(Boolean, default=True)
