"""
El tablero completo en una sola llamada, y la configuracion de columnas/etiquetas.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import requiere
from app.core import cache
from app.core.eventos import anotar_evento
from app.modulos.pedidos import service as pedidos
from app.modulos.pedidos.schemas import EtiquetaOut, PedidoTarjeta
from app.modulos.tablero.catalogos import catalogo_piezas, mercados
from app.modulos.tablero.model import Columna, Configuracion, Etiqueta
from app.modulos.usuarios.model import Usuario

router = APIRouter(prefix="/tablero", tags=["tablero"])

PATRON_COLOR = r"^#[0-9A-Fa-f]{6}$"


class ColumnaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    nombre: str
    descripcion: str | None
    orden: int
    color: str
    icono: str
    es_inicial: bool
    es_final: bool
    limite_wip: int | None


class ColumnaIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=60)
    descripcion: str | None = Field(default=None, max_length=200)
    color: str = Field(pattern=PATRON_COLOR)
    icono: str = Field(default="inbox", max_length=30)
    es_final: bool = False
    limite_wip: int | None = Field(default=None, ge=1, le=500)


class ColumnaEditar(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=60)
    descripcion: str | None = Field(default=None, max_length=200)
    color: str | None = Field(default=None, pattern=PATRON_COLOR)
    icono: str | None = Field(default=None, max_length=30)
    es_final: bool | None = None
    limite_wip: int | None = Field(default=None, ge=1, le=500)


class OrdenColumnas(BaseModel):
    ids: list[int] = Field(min_length=1)


class TableroOut(BaseModel):
    columnas: list[ColumnaOut]
    pedidos: list[PedidoTarjeta]
    etiquetas: list[EtiquetaOut]


class ConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    clave: str
    valor: str
    descripcion: str | None


class ConfigIn(BaseModel):
    valor: str = Field(max_length=2000)


class PiezaCatalogoOut(BaseModel):
    codigo: str
    nombre: str
    simetrica: str | None


class CatalogosOut(BaseModel):
    piezas: list[PiezaCatalogoOut]
    mercados: list[str]


def _columnas(db: Session) -> list[Columna]:
    return list(db.scalars(select(Columna).where(Columna.activa).order_by(Columna.orden)))


@router.get("", response_model=TableroOut)
def tablero(_: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db)):
    return TableroOut(
        columnas=_columnas(db),
        pedidos=pedidos.a_tarjetas(db, pedidos.pedidos_del_tablero(db)),
        etiquetas=db.scalars(select(Etiqueta).where(Etiqueta.activa).order_by(Etiqueta.nombre)).all(),
    )


@router.get("/catalogos", response_model=CatalogosOut)
def catalogos(_: Usuario = Depends(requiere("pedido.ver")), db: Session = Depends(get_db)):
    """Lo que necesita el formulario: piezas con su codigo y simetrica, y los mercados."""
    piezas = sorted(catalogo_piezas(db).values(), key=lambda p: p.codigo)
    return CatalogosOut(
        piezas=[PiezaCatalogoOut(codigo=p.codigo, nombre=p.nombre, simetrica=p.simetrica) for p in piezas],
        mercados=mercados(db),
    )


@router.post("/columnas", response_model=ColumnaOut, status_code=status.HTTP_201_CREATED)
def crear_columna(datos: ColumnaIn, usuario: Usuario = Depends(requiere("tablero.configurar")), db: Session = Depends(get_db)):
    ultima = max((c.orden for c in _columnas(db)), default=0)
    col = Columna(**datos.model_dump(), orden=ultima + 1)
    db.add(col)
    anotar_evento(db, "tablero.cambio", motivo="columnas", por=usuario.id)
    db.commit()
    return col


@router.patch("/columnas/{columna_id}", response_model=ColumnaOut)
def editar_columna(
    columna_id: int, datos: ColumnaEditar,
    usuario: Usuario = Depends(requiere("tablero.configurar")), db: Session = Depends(get_db),
):
    col = db.get(Columna, columna_id)
    if not col or not col.activa:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esa columna no existe")
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(col, campo, valor)
    anotar_evento(db, "tablero.cambio", motivo="columnas", por=usuario.id)
    db.commit()
    return col


@router.put("/columnas/orden", response_model=list[ColumnaOut])
def ordenar_columnas(datos: OrdenColumnas, usuario: Usuario = Depends(requiere("tablero.configurar")), db: Session = Depends(get_db)):
    columnas = {c.id: c for c in _columnas(db)}
    if set(datos.ids) != set(columnas):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Hay que mandar todas las columnas activas, sin repetir")
    for i, cid in enumerate(datos.ids, start=1):
        columnas[cid].orden = i
    anotar_evento(db, "tablero.cambio", motivo="columnas", por=usuario.id)
    db.commit()
    return _columnas(db)


@router.delete("/columnas/{columna_id}", status_code=status.HTTP_204_NO_CONTENT)
def archivar_columna(columna_id: int, usuario: Usuario = Depends(requiere("tablero.configurar")), db: Session = Depends(get_db)):
    col = db.get(Columna, columna_id)
    if not col or not col.activa:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esa columna no existe")
    if col.es_inicial:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La columna inicial no se puede archivar: ahí caen los pedidos nuevos")
    if any(p.columna_id == col.id for p in pedidos.pedidos_del_tablero(db)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La columna tiene pedidos. Muévelos antes de archivarla")
    col.activa = False
    anotar_evento(db, "tablero.cambio", motivo="columnas", por=usuario.id)
    db.commit()


@router.get("/configuracion", response_model=list[ConfigOut])
def ver_config(_: Usuario = Depends(requiere("tablero.configurar")), db: Session = Depends(get_db)):
    return db.scalars(select(Configuracion).order_by(Configuracion.clave)).all()


@router.put("/configuracion/{clave}", response_model=ConfigOut)
def guardar_config(clave: str, datos: ConfigIn, _: Usuario = Depends(requiere("tablero.configurar")), db: Session = Depends(get_db)):
    fila = db.get(Configuracion, clave)
    if not fila:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esa clave de configuración no existe")
    fila.valor = datos.valor
    db.commit()
    cache.invalidar(f"config:{clave}")  # que el cambio se vea de una, sin esperar a que venza el cache
    return fila
