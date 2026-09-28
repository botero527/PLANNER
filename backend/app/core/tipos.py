"""
Tipos que se repiten en varios schemas.

FechaUTC existe por un bug clasico: SQL Server devuelve la fecha "pelada",
sin zona horaria. Si la mandamos asi, el navegador cree que es hora local y
todo sale corrido 5 horas. Con esto la fecha sale con la Z al final (UTC)
y el navegador la convierte bien a hora Colombia.
"""
from datetime import UTC, datetime
from typing import Annotated

from pydantic import PlainSerializer


def _a_utc(valor: datetime) -> str:
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=UTC)
    return valor.isoformat().replace("+00:00", "Z")


FechaUTC = Annotated[datetime, PlainSerializer(_a_utc, return_type=str)]
