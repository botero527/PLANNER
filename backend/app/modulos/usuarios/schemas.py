"""
Schemas = la forma de los datos que entran y salen de la API.
El modelo es la tabla; el schema es lo que el frontend ve. Por eso el
la password existe en el modelo pero no sale en los schemas generales.
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

PERSONAJES = {"vidrito", "vendedora", "trazos", "tuerca", "jefa"}


class RolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    nombre: str
    color: str


class UsuarioMini(BaseModel):
    """Lo minimo para pintar un avatar: se usa en tarjetas, chat, historial."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    usuario: str
    personaje: str


class UsuarioOut(UsuarioMini):
    correo: str | None
    rol: RolOut
    activo: bool
    recibir_correos: bool
    debe_cambiar_password: bool
    ultimo_acceso: datetime | None


class YoOut(UsuarioOut):
    permisos: list[str]


class _CamposUsuario(BaseModel):
    @field_validator("usuario", check_fields=False)
    @classmethod
    def usuario_limpio(cls, v: str) -> str:
        v = v.strip().lower()
        if not v.replace(".", "").replace("_", "").isalnum():
            raise ValueError("El usuario solo puede tener letras, números, punto o guion bajo")
        return v

    @field_validator("personaje", check_fields=False)
    @classmethod
    def personaje_valido(cls, v: str) -> str:
        if v not in PERSONAJES:
            raise ValueError(f"Ese personaje no existe. Opciones: {', '.join(sorted(PERSONAJES))}")
        return v


class UsuarioCrear(_CamposUsuario):
    usuario: str = Field(min_length=3, max_length=50)
    nombre: str = Field(min_length=2, max_length=120)
    correo: EmailStr | None = None
    rol_id: int
    personaje: str = "vidrito"
    password_temporal: str = Field(min_length=6, max_length=72)
    recibir_correos: bool = True


class UsuarioEditar(_CamposUsuario):
    nombre: str | None = Field(default=None, min_length=2, max_length=120)
    correo: EmailStr | None = None
    rol_id: int | None = None
    personaje: str | None = None
    activo: bool | None = None
    recibir_correos: bool | None = None


class ResetPassword(BaseModel):
    password_temporal: str = Field(min_length=6, max_length=72)
