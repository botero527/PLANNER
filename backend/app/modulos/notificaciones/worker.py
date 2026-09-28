"""
El cartero: un hilo que cada N segundos revisa COLA_CORREOS y manda lo pendiente.

Si un envio falla, no se pierde: se reintenta mas tarde y cada vez espera mas
(1, 2, 4, 8 minutos...). Eso se llama "backoff exponencial" y evita que un
Outlook caido reciba una avalancha de reintentos.
"""
import logging
import threading
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.core.db import SesionLocal
from app.modulos.notificaciones.enviadores import Enviador, crear_enviador
from app.modulos.notificaciones.model import CorreoCola

log = logging.getLogger("planner.correo")
settings = get_settings()
LOTE = 20


def _ahora() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def procesar_lote(enviador: Enviador) -> int:
    with SesionLocal() as db:
        # UPDLOCK + READPAST: si algun dia corren dos workers, cada uno toma
        # filas distintas y ningun correo sale dos veces.
        pendientes = db.scalars(
            select(CorreoCola)
            .where(CorreoCola.estado == "pendiente", CorreoCola.proximo_intento_en <= _ahora())
            .order_by(CorreoCola.id)
            .limit(LOTE)
            .with_hint(CorreoCola, "WITH (UPDLOCK, READPAST, ROWLOCK)", "mssql")
        ).all()

        for correo in pendientes:
            try:
                enviador.enviar(correo.para, correo.asunto, correo.html)
                correo.estado = "enviado"
                correo.enviado_en = _ahora()
                correo.ultimo_error = None
            except Exception as e:  # noqa: BLE001 - cualquier falla del envio se reintenta
                correo.intentos += 1
                correo.ultimo_error = str(e)[:1000]
                if correo.intentos >= settings.correo_intentos_max:
                    correo.estado = "error"
                    log.error("correo %s se rindio tras %s intentos: %s", correo.id, correo.intentos, e)
                else:
                    correo.proximo_intento_en = _ahora() + timedelta(minutes=2 ** (correo.intentos - 1))
                    log.warning("correo %s fallo (intento %s), se reintenta: %s", correo.id, correo.intentos, e)
            # commit por cada correo: si el proceso se cae a mitad de lote,
            # los que ya salieron quedan marcados y no se mandan dos veces
            db.commit()
        return len(pendientes)


class Cartero:
    def __init__(self) -> None:
        self._parar = threading.Event()
        self._hilo: threading.Thread | None = None

    def arrancar(self) -> None:
        enviador = crear_enviador()
        log.info("cartero arrancando en modo '%s'", settings.correo_modo)

        def bucle() -> None:
            while not self._parar.is_set():
                try:
                    procesar_lote(enviador)
                except OperationalError as e:
                    # la red o la base se cayeron un momento: en la proxima vuelta se reintenta
                    log.warning("cola de correos sin conexion a la base, reintento luego: %s", str(e.orig)[:120])
                except Exception:  # noqa: BLE001 - que un error inesperado no mate el hilo
                    log.exception("error procesando la cola de correos")
                self._parar.wait(settings.correo_intervalo_segundos)

        self._hilo = threading.Thread(target=bucle, name="cartero", daemon=True)
        self._hilo.start()

    def detener(self) -> None:
        self._parar.set()
        if self._hilo:
            self._hilo.join(timeout=5)


cartero = Cartero()
