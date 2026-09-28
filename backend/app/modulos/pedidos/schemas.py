import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.tipos import FechaUTC
from app.modulos.usuarios.schemas import UsuarioMini

Prioridad = Literal["baja", "media", "alta", "urgente"]

# El VIN tiene 17 caracteres y nunca lleva I, O ni Q (se confunden con 1 y 0)
PATRON_VIN = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")
ANIO_MAX = date.today().year + 2


class PiezaIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=150)
    cantidad: int = Field(default=1, ge=1, le=9999)
    observacion: str | None = Field(default=None, max_length=500)


class PiezaOut(PiezaIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class _CamposVehiculo(BaseModel):
    @field_validator("vin", check_fields=False)
    @classmethod
    def vin_valido(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return None
        v = v.strip().upper().replace(" ", "")
        if not PATRON_VIN.match(v):
            raise ValueError("El VIN debe tener 17 caracteres (letras y números, sin I, O ni Q)")
        return v

    @field_validator("vehiculo", "modelo", "cliente", check_fields=False)
    @classmethod
    def sin_espacios_de_mas(cls, v: str | None) -> str | None:
        return " ".join(v.split()) if v else v


class PedidoCrear(_CamposVehiculo):
    vehiculo: str = Field(min_length=1, max_length=120)
    modelo: str | None = Field(default=None, max_length=120)
    anio: int | None = Field(default=None, ge=1950, le=ANIO_MAX)
    vin: str | None = None
    cliente: str | None = Field(default=None, max_length=150)
    descripcion: str | None = Field(default=None, max_length=4000)
    prioridad: Prioridad = "media"
    fecha_requerida: date | None = None
    piezas: list[PiezaIn] = Field(min_length=1, max_length=100)
    asignados: list[int] = Field(default_factory=list, max_length=20)
    etiquetas: list[int] = Field(default_factory=list, max_length=10)
    datos_extra: dict | None = None


class PedidoEditar(_CamposVehiculo):
    version: int  # la que tenia el pedido cuando la persona abrio el formulario
    vehiculo: str | None = Field(default=None, min_length=1, max_length=120)
    modelo: str | None = Field(default=None, max_length=120)
    anio: int | None = Field(default=None, ge=1950, le=ANIO_MAX)
    vin: str | None = None
    cliente: str | None = Field(default=None, max_length=150)
    descripcion: str | None = Field(default=None, max_length=4000)
    prioridad: Prioridad | None = None
    fecha_requerida: date | None = None
    piezas: list[PiezaIn] | None = Field(default=None, min_length=1, max_length=100)
    etiquetas: list[int] | None = Field(default=None, max_length=10)
    datos_extra: dict | None = None


class MoverIn(BaseModel):
    columna_id: int
    indice: int = Field(ge=0)  # en que puesto de la columna queda (0 = arriba del todo)


class MiembrosIn(BaseModel):
    asignados: list[int] = Field(max_length=20)


class ChecklistIn(BaseModel):
    texto: str = Field(min_length=1, max_length=300)


class ChecklistEditar(BaseModel):
    texto: str | None = Field(default=None, min_length=1, max_length=300)
    hecho: bool | None = None


class EtiquetaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    color: str


class MiembroOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    usuario: UsuarioMini
    tipo: str


class ChecklistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    texto: str
    hecho: bool
    orden: int


class PedidoTarjeta(BaseModel):
    """Lo que se ve en la tarjeta del tablero. Liviano a proposito."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str
    vehiculo: str
    modelo: str | None
    anio: int | None
    prioridad: str
    fecha_requerida: date | None
    columna_id: int
    posicion: int
    creado_por: UsuarioMini
    miembros: list[MiembroOut]
    etiquetas: list[EtiquetaOut]
    total_piezas: int = 0
    checklist_hechos: int = 0
    checklist_total: int = 0
    total_mensajes: int = 0
    total_adjuntos: int = 0
    portada_url: str | None = None
    completado_en: FechaUTC | None
    creado_en: FechaUTC
    version: int


class PedidoDetalle(PedidoTarjeta):
    vin: str | None
    cliente: str | None
    descripcion: str | None
    piezas: list[PiezaOut]
    checklist: list[ChecklistOut]
    datos_extra: dict | None = None
    actualizado_en: FechaUTC
    puedo_editar: bool = False


class HistorialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    accion: str
    detalle: dict | None = None
    usuario: UsuarioMini
    creado_en: FechaUTC
