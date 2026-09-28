"""
Tiempo real con WebSockets.

Cada navegador abierto mantiene UNA conexion con el servidor. Cuando pasa
algo (tarjeta movida, mensaje nuevo...) el servidor le avisa a todos y cada
pantalla se actualiza sola, sin darle F5.

Ojo: el hub vive en la memoria de este proceso. Si algun dia se corre el
backend con varias copias (varios workers o servidores), cada copia tendria
su propia lista de conexiones y habria que meter algo en el medio tipo
Redis o Azure Web PubSub. Para el tamaño del equipo, un proceso sobra.
"""
import asyncio
import json
import logging
from dataclasses import dataclass, field

from fastapi import WebSocket

log = logging.getLogger("planner.tiempo_real")


@dataclass(eq=False)
class Conexion:
    ws: WebSocket
    usuario_id: int
    nombre: str
    personaje: str
    viendo_pedido: int | None = None
    _cola: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=200))


class Hub:
    def __init__(self) -> None:
        self._conexiones: set[Conexion] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def iniciar(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def conectar(self, conexion: Conexion) -> None:
        self._conexiones.add(conexion)
        await self._avisar_presencia()

    async def desconectar(self, conexion: Conexion) -> None:
        self._conexiones.discard(conexion)
        await self._avisar_presencia()

    def en_linea(self) -> list[dict]:
        vistos: dict[int, dict] = {}
        for c in self._conexiones:
            vistos[c.usuario_id] = {"id": c.usuario_id, "nombre": c.nombre, "personaje": c.personaje}
        return list(vistos.values())

    async def enviar_a_todos(self, evento: dict) -> None:
        texto = json.dumps(evento, default=str)
        for c in list(self._conexiones):
            try:
                c._cola.put_nowait(texto)
            except asyncio.QueueFull:
                # un cliente que no lee (pestaña congelada) no puede frenar a los demas
                log.warning("cola llena para usuario %s, se descarta evento", c.usuario_id)

    def publicar(self, tipo: str, datos: dict) -> None:
        """Se llama desde los endpoints normales, que corren en otro hilo.
        run_coroutine_threadsafe es el puente seguro entre ese hilo y el loop
        async donde viven los websockets."""
        if self._loop is None or self._loop.is_closed():
            return
        asyncio.run_coroutine_threadsafe(self.enviar_a_todos({"tipo": tipo, **datos}), self._loop)

    async def bombear(self, conexion: Conexion) -> None:
        """Saca de la cola de esa conexion y le escribe al navegador."""
        try:
            while True:
                texto = await conexion._cola.get()
                await conexion.ws.send_text(texto)
        except Exception:  # noqa: BLE001
            # el navegador se fue justo mientras le escribiamos: no es un error,
            # el ciclo de recibir se entera del cierre y limpia la conexion
            return

    async def _avisar_presencia(self) -> None:
        await self.enviar_a_todos({"tipo": "presencia", "usuarios": self.en_linea()})


hub = Hub()
