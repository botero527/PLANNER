import asyncio
import contextlib
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core.db import SesionLocal
from app.core.deps import usuario_desde_token
from app.modulos.tiempo_real.hub import Conexion, hub

router = APIRouter(tags=["tiempo real"])


@router.websocket("/ws")
async def websocket(ws: WebSocket, token: str = ""):
    # El navegador no deja mandar headers en un WebSocket, por eso el token va en la URL
    with SesionLocal() as db:
        usuario = usuario_desde_token(db, token)
        if usuario:
            datos = (usuario.id, usuario.nombre, usuario.personaje)
    if not usuario:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws.accept()
    conexion = Conexion(ws=ws, usuario_id=datos[0], nombre=datos[1], personaje=datos[2])
    await hub.conectar(conexion)
    bomba = asyncio.create_task(hub.bombear(conexion))
    try:
        while True:
            mensaje = json.loads(await ws.receive_text())
            tipo = mensaje.get("tipo")
            if tipo == "ping":
                await ws.send_text('{"tipo":"pong"}')
            elif tipo == "escribiendo":
                # "Fulano esta escribiendo..." no se guarda en BD, solo se reenvia
                await hub.enviar_a_todos({
                    "tipo": "escribiendo",
                    "pedido_id": mensaje.get("pedido_id"),
                    "usuario": {"id": conexion.usuario_id, "nombre": conexion.nombre},
                })
    except (WebSocketDisconnect, json.JSONDecodeError, RuntimeError, OSError):
        # OSError cubre el ClientDisconnected de uvicorn (cuando se va a mitad de un envio)
        pass
    finally:
        bomba.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await bomba
        await hub.desconectar(conexion)
