from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.tipos import FechaUTC
from app.modulos.adjuntos.schemas import AdjuntoOut
from app.modulos.usuarios.schemas import UsuarioMini

Prioridad = Literal["baja", "media", "alta", "urgente"]
TipoVidrio = Literal["original", "3d"]
ANIO_MAX = date.today().year + 2


class PiezaIn(BaseModel):
    codigo: str | None = Field(default=None, max_length=3)  # si viene, el nombre sale del catalogo
    nombre: str = Field(default="", max_length=150)
    observacion: str | None = Field(default=None, max_length=500)

    @field_validator("codigo")
    @classmethod
    def codigo_limpio(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        if not v:
            return None
        if not v.isdigit() or len(v) > 3:
            raise ValueError("El código de pieza son hasta 3 números (ej: 000, 001)")
        return v.zfill(3)  # "1" -> "001"


class PiezaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str | None
    nombre: str
    observacion: str | None


class _CamposVehiculo(BaseModel):
    @field_validator("vin", check_fields=False)
    @classmethod
    def vin_limpio(cls, v: str | None) -> str | None:
        # libre: puede ser largo, traer varios VIN o notas. Solo le quitamos los bordes
        return v.strip() if v is not None else v

    @field_validator("marca", "modelo", "version_vehiculo", "plataforma", check_fields=False)
    @classmethod
    def sin_espacios_de_mas(cls, v: str | None) -> str | None:
        return " ".join(v.split()) if v else v

    @model_validator(mode="after")
    def drive_si_es_3d(self):
        # si es 3D hay que decir si la informacion ya esta en Drive; si es original no aplica
        tipo = getattr(self, "tipo_vidrio", None)
        if tipo == "3d" and getattr(self, "info_en_drive", None) is None:
            raise ValueError("Si el vidrio es 3D, indica si la información ya está en Drive")
        if tipo == "original":
            self.info_en_drive = None
        return self


class PedidoCrear(_CamposVehiculo):
    marca: str = Field(min_length=1, max_length=80)
    modelo: str = Field(min_length=1, max_length=120)
    version_vehiculo: str | None = Field(default=None, max_length=120)
    plataforma: str | None = Field(default=None, max_length=80)
    anio: int | None = Field(default=None, ge=1950, le=ANIO_MAX)
    vin: str = Field(min_length=1)
    mercado: str = Field(min_length=1, max_length=40)
    tipo_vidrio: TipoVidrio = "original"
    info_en_drive: bool | None = None
    descripcion: str | None = Field(default=None, max_length=4000)
    piezas: list[PiezaIn] = Field(min_length=1, max_length=100)
    asignados: list[int] = Field(default_factory=list, max_length=20)
    etiquetas: list[int] = Field(default_factory=list, max_length=10)
    datos_extra: dict | None = None


class PedidoEditar(_CamposVehiculo):
    version: int  # la que tenia el pedido cuando la persona abrio el formulario
    marca: str | None = Field(default=None, min_length=1, max_length=80)
    modelo: str | None = Field(default=None, min_length=1, max_length=120)
    version_vehiculo: str | None = Field(default=None, max_length=120)
    plataforma: str | None = Field(default=None, max_length=80)
    anio: int | None = Field(default=None, ge=1950, le=ANIO_MAX)
    vin: str | None = Field(default=None, min_length=1)
    mercado: str | None = Field(default=None, min_length=1, max_length=40)
    tipo_vidrio: TipoVidrio | None = None
    info_en_drive: bool | None = None
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
    marca: str
    modelo: str
    version_vehiculo: str | None
    anio: int | None
    mercado: str
    tipo_vidrio: str
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
    # ingreso (primera columna): para pintar el progreso en la tarjeta
    codigo_vehiculo_en: FechaUTC | None = None
    numero_pedido: str | None = None
    aprobado_en: FechaUTC | None = None


class PedidoDetalle(PedidoTarjeta):
    vin: str
    plataforma: str | None
    info_en_drive: bool | None
    descripcion: str | None
    piezas: list[PiezaOut]
    checklist: list[ChecklistOut]
    datos_extra: dict | None = None
    actualizado_en: FechaUTC
    puedo_editar: bool = False
    # detalle del ingreso
    codigo_vehiculo: str | None = None
    codigo_vehiculo_por: UsuarioMini | None = None
    numero_pedido_en: FechaUTC | None = None
    numero_pedido_por: UsuarioMini | None = None
    aprobado_por: UsuarioMini | None = None
    evidencias: list[AdjuntoOut] = []
    en_ingreso: bool = False          # esta en la primera columna
    puedo_gestionar_ingreso: bool = False  # tecnica/admin: marcar codigo y aprobar
    puedo_poner_pedido: bool = False       # el comercial dueño (o admin) escribe el numero


class HistorialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    accion: str
    detalle: dict | None = None
    usuario: UsuarioMini
    creado_en: FechaUTC
