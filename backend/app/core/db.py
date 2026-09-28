"""
Conexion a SQL Server y la sesion que usan todos los endpoints.

Todas las tablas del planner van en el schema PLN. En la misma base viven
Gestion de Cambios (GMB), Herramentales (HTA) y otros, entonces el schema es
lo que evita que nos pisemos con ellos.
"""
import logging
import time
from collections.abc import Iterator
from datetime import datetime

import pyodbc
from sqlalchemy import DateTime, MetaData, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# Nombres fijos para llaves e indices. Sin esto SQL Server inventa nombres
# random (PK__PEDIDOS__3213E83F...) y despues las migraciones no los encuentran.
CONVENCION_NOMBRES = {
    "ix": "IX_%(table_name)s_%(column_0_N_name)s",
    "uq": "UQ_%(table_name)s_%(column_0_N_name)s",
    "ck": "CK_%(table_name)s_%(constraint_name)s",
    "fk": "FK_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "PK_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(schema=settings.db_schema, naming_convention=CONVENCION_NOMBRES)


class ConFechas:
    """Mixin para no repetir creado_en / actualizado_en en cada tabla.
    Todo se guarda en UTC; el frontend lo pasa a hora Colombia al mostrarlo."""

    creado_en: Mapped[datetime] = mapped_column(DateTime, server_default=func.sysutcdatetime())
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.sysutcdatetime(), onupdate=func.sysutcdatetime()
    )


log = logging.getLogger("planner.db")
INTENTOS_CONEXION = 4


def _conectar() -> pyodbc.Connection:
    """Abre la conexion reintentando. Azure SQL a veces corta conexiones nuevas
    (error 10054, reconfiguraciones del servidor, red inestable) y Microsoft
    recomienda reintentar esos errores "transitorios" en vez de fallar de una."""
    for intento in range(1, INTENTOS_CONEXION + 1):
        try:
            return pyodbc.connect(settings.odbc, timeout=30)
        except pyodbc.OperationalError as e:
            if intento == INTENTOS_CONEXION:
                raise
            espera = 0.5 * 2 ** (intento - 1)
            log.warning("no se pudo conectar a SQL (intento %s), reintento en %.1fs: %s", intento, espera, str(e)[:120])
            time.sleep(espera)
    raise RuntimeError("inalcanzable")


engine = create_engine(
    "mssql+pyodbc://",
    creator=_conectar,
    pool_pre_ping=True,   # Azure SQL cierra conexiones quietas, esto las revive
    pool_recycle=1800,
    pool_size=5,
    max_overflow=10,
    fast_executemany=True,
)

SesionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SesionLocal()
    try:
        yield db
    finally:
        db.close()
