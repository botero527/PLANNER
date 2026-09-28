"""
Login con usuario y contrasena propia del planner (como Inventario de Moldes).
"""
import time
from collections import defaultdict
from datetime import UTC, datetime
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import get_usuario_actual
from app.core.seguridad import crear_token, guardar_password, verificar_password
from app.modulos.usuarios.model import Usuario
from app.modulos.usuarios.schemas import YoOut

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

# Freno contra alguien probando contrasenas a lo loco. Vive en memoria: si se
# reinicia el servidor se limpia, y para un sistema interno eso esta bien.
_fallos: dict[str, list[float]] = defaultdict(list)
_candado = Lock()


def _bloqueado(usuario: str) -> bool:
    ventana = settings.login_bloqueo_minutos * 60
    with _candado:
        recientes = [t for t in _fallos[usuario] if time.monotonic() - t < ventana]
        _fallos[usuario] = recientes
        return len(recientes) >= settings.login_intentos_max


def _registrar_fallo(usuario: str) -> None:
    with _candado:
        _fallos[usuario].append(time.monotonic())


class LoginIn(BaseModel):
    usuario: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=72)


class LoginOut(BaseModel):
    token: str
    usuario: YoOut


class CambiarPasswordIn(BaseModel):
    actual: str = Field(min_length=1, max_length=72)
    nueva: str = Field(min_length=8, max_length=72)


def yo_out(usuario: Usuario) -> YoOut:
    return YoOut.model_validate(usuario).model_copy(update={"permisos": sorted(usuario.permisos)})


@router.post("/login", response_model=LoginOut)
def login(datos: LoginIn, db: Session = Depends(get_db)):
    nombre = datos.usuario.strip().lower()
    if _bloqueado(nombre):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Demasiados intentos. Espera {settings.login_bloqueo_minutos} minutos.",
        )

    usuario = db.scalar(select(Usuario).where(Usuario.usuario == nombre))
    # Mismo mensaje si no existe o si la clave esta mal: asi nadie puede
    # adivinar que usuarios existen probando nombres.
    if not usuario or not usuario.activo or not verificar_password(datos.password, usuario.password):
        _registrar_fallo(nombre)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos")

    usuario.ultimo_acceso = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    return LoginOut(token=crear_token(usuario.id, usuario.version_sesion), usuario=yo_out(usuario))


@router.get("/yo", response_model=YoOut)
def yo(usuario: Usuario = Depends(get_usuario_actual)):
    return yo_out(usuario)


@router.post("/cambiar-password", response_model=LoginOut)
def cambiar_password(
    datos: CambiarPasswordIn,
    usuario: Usuario = Depends(get_usuario_actual),
    db: Session = Depends(get_db),
):
    if not verificar_password(datos.actual, usuario.password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña actual no es correcta")
    if datos.actual == datos.nueva:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La nueva tiene que ser distinta a la actual")

    usuario.password = guardar_password(datos.nueva)
    usuario.debe_cambiar_password = False
    usuario.version_sesion += 1  # cierra las sesiones abiertas en otros equipos
    db.commit()
    return LoginOut(token=crear_token(usuario.id, usuario.version_sesion), usuario=yo_out(usuario))
