"""
Cache en memoria para cosas que casi nunca cambian (configuracion, catalogo de
piezas). Cada consulta a Azure cuesta ~200 ms desde aca, y estas se leian en
casi todas las peticiones.

Vive en memoria de este proceso y vence sola a los N segundos. Cuando el admin
cambia algo se llama a invalidar() para que se vea de una.
"""
import time
from collections.abc import Callable
from threading import Lock
from typing import Any

_datos: dict[str, tuple[float, Any]] = {}
_candado = Lock()


def recordar(clave: str, cargar: Callable[[], Any], segundos: int = 30) -> Any:
    ahora = time.monotonic()
    with _candado:
        guardado = _datos.get(clave)
        if guardado and guardado[0] > ahora:
            return guardado[1]
    valor = cargar()  # fuera del candado: si la base se demora no frena a los demas
    with _candado:
        _datos[clave] = (ahora + segundos, valor)
    return valor


def invalidar(prefijo: str = "") -> None:
    with _candado:
        for clave in [c for c in _datos if c.startswith(prefijo)]:
            del _datos[clave]
