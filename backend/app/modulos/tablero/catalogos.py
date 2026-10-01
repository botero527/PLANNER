"""
Lecturas de configuracion y catalogos, con cache (ver core/cache.py).
Vive aparte para que cualquier modulo lo pueda usar sin importarse en circulo.
"""
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import cache
from app.modulos.tablero.model import CatalogoPieza, Configuracion


def valor_config(db: Session, clave: str, defecto: str) -> str:
    def cargar() -> str:
        fila = db.get(Configuracion, clave)
        return fila.valor if fila else defecto
    return cache.recordar(f"config:{clave}", cargar)


def mercados(db: Session) -> list[str]:
    return [m.strip() for m in valor_config(db, "pedido.mercados", "México,LATAM,Europa,Asia,USA").split(",") if m.strip()]


@dataclass(frozen=True)
class PiezaCatalogo:
    codigo: str
    nombre: str
    simetrica: str | None


def catalogo_piezas(db: Session) -> dict[str, PiezaCatalogo]:
    # datos simples (no objetos del ORM): el cache se comparte entre peticiones
    # y los objetos del ORM pertenecen a la sesion que los cargo
    def cargar() -> dict[str, PiezaCatalogo]:
        filas = db.execute(
            select(CatalogoPieza.codigo, CatalogoPieza.nombre, CatalogoPieza.simetrica).where(CatalogoPieza.activa)
        ).all()
        return {f.codigo: PiezaCatalogo(f.codigo, f.nombre, f.simetrica) for f in filas}
    return cache.recordar("catalogo:piezas", cargar, segundos=300)
