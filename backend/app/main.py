"""
Punto de entrada del backend. Para correrlo en local:

    cd backend
    .venv\\Scripts\\activate
    uvicorn app.main:app --port 8010 --reload

Documentacion interactiva de la API en http://localhost:8010/docs
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.core.eventos  # noqa: F401  (registra los listeners de commit)
import app.modelos  # noqa: F401  (carga todos los modelos antes de cualquier consulta)
from app.core.config import get_settings
from app.modulos.adjuntos.router import router as adjuntos
from app.modulos.auth.router import router as auth
from app.modulos.chat.router import router as chat
from app.modulos.notificaciones.router import router as notificaciones
from app.modulos.notificaciones.worker import cartero
from app.modulos.pedidos.router import router as pedidos
from app.modulos.tablero.router import router as tablero
from app.modulos.tiempo_real.hub import hub
from app.modulos.tiempo_real.router import router as tiempo_real
from app.modulos.usuarios.router import router as usuarios

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def ciclo_de_vida(_: FastAPI):
    # lo que va antes del yield corre al arrancar, lo de despues al apagar
    hub.iniciar(asyncio.get_running_loop())
    cartero.arrancar()
    yield
    cartero.detener()


app = FastAPI(
    title="AGP Planner",
    description="Pedidos de comercial → tablero de dibujo y tecnica, con chat y avisos.",
    version="0.1.0",
    lifespan=ciclo_de_vida,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.lista_cors,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, usuarios, tablero, pedidos, chat, adjuntos, notificaciones):
    app.include_router(r, prefix="/api")
app.include_router(tiempo_real)


@app.get("/api/salud", tags=["sistema"])
def salud():
    return {"ok": True, "correo_modo": settings.correo_modo}
