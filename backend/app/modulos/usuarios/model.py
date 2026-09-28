"""
Usuarios, roles y permisos.

Los permisos van en base de datos y no quemados en el codigo: el codigo solo
pregunta "este usuario tiene 'tarjeta.mover'?". Que rol tiene que permiso se
cambia en la tabla ROLES_PERMISOS sin volver a desplegar nada.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Unicode
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, ConFechas

roles_permisos = Table(
    "ROLES_PERMISOS",
    Base.metadata,
    Column("rol_id", ForeignKey("ROLES.id", ondelete="CASCADE"), primary_key=True),
    Column("permiso_id", ForeignKey("PERMISOS.id", ondelete="CASCADE"), primary_key=True),
)


class Permiso(Base):
    __tablename__ = "PERMISOS"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(60), unique=True)   # ej: pedido.crear
    descripcion: Mapped[str] = mapped_column(Unicode(200))


class Rol(Base):
    __tablename__ = "ROLES"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(30), unique=True)   # admin, comercial...
    nombre: Mapped[str] = mapped_column(Unicode(60))
    descripcion: Mapped[str | None] = mapped_column(Unicode(200))
    color: Mapped[str] = mapped_column(String(9), default="#6C8CFF")

    # lazy="select": los permisos solo se cargan si alguien los pide. Antes iban
    # siempre (selectin) y cada vez que se pintaba un avatar en una tarjeta se
    # iba una consulta extra a la base solo para traer permisos que nadie usaba.
    permisos: Mapped[list[Permiso]] = relationship(secondary=roles_permisos, lazy="select")


class Usuario(ConFechas, Base):
    __tablename__ = "USUARIOS"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario: Mapped[str] = mapped_column(String(50), unique=True)  # con este se loguea, siempre en minuscula
    nombre: Mapped[str] = mapped_column(Unicode(120))
    correo: Mapped[str | None] = mapped_column(String(150))
    rol_id: Mapped[int] = mapped_column(ForeignKey("ROLES.id"))
    personaje: Mapped[str] = mapped_column(String(30), default="vidrito")
    password_hash: Mapped[str] = mapped_column(String(100))
    debe_cambiar_password: Mapped[bool] = mapped_column(Boolean, default=True)
    version_sesion: Mapped[int] = mapped_column(Integer, default=1)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    recibir_correos: Mapped[bool] = mapped_column(Boolean, default=True)
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime)

    rol: Mapped[Rol] = relationship(lazy="joined")

    @property
    def permisos(self) -> set[str]:
        return {p.codigo for p in self.rol.permisos}

    def puede(self, permiso: str) -> bool:
        return permiso in self.permisos
