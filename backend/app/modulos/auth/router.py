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
from app.modulos.notificaciones.model import CorreoCola
from app.modulos.notificaciones.service import CODIGOS_EVENTOS, EVENTOS, alertas_de
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


# Mis alertas: cada persona escoge que avisos le llegan al correo

class EventoAlerta(BaseModel):
    id: str
    nombre: str
    descripcion: str


class MisAlertasOut(BaseModel):
    correo: str | None
    recibir_correos: bool
    eventos: list[EventoAlerta]
    activas: list[str]
    personalizadas: bool  # False = esta usando lo que definio el admin
    modo_envio: str        # simulado | powerautomate | graph


class MisAlertasIn(BaseModel):
    recibir_correos: bool
    activas: list[str] = Field(max_length=20)


def _mis_alertas(db: Session, usuario: Usuario) -> MisAlertasOut:
    return MisAlertasOut(
        correo=usuario.correo,
        recibir_correos=usuario.recibir_correos,
        # "Pedido nuevo" solo le llega a quien tiene ese permiso (el comercial es quien los crea)
        eventos=[EventoAlerta(id=i, nombre=n, descripcion=d) for i, n, d in EVENTOS
                 if i != "pedido.creado" or usuario.puede("notificacion.pedidos_nuevos")],
        activas=sorted(alertas_de(db, usuario)),
        personalizadas=usuario.alertas_correo is not None,
        modo_envio=settings.correo_modo,
    )


@router.get("/alertas", response_model=MisAlertasOut)
def ver_alertas(usuario: Usuario = Depends(get_usuario_actual), db: Session = Depends(get_db)):
    return _mis_alertas(db, usuario)


@router.put("/alertas", response_model=MisAlertasOut)
def guardar_alertas(datos: MisAlertasIn, usuario: Usuario = Depends(get_usuario_actual), db: Session = Depends(get_db)):
    desconocidos = set(datos.activas) - CODIGOS_EVENTOS
    if desconocidos:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Avisos que no existen: {', '.join(sorted(desconocidos))}")
    usuario.recibir_correos = datos.recibir_correos
    usuario.alertas_correo = ",".join(sorted(set(datos.activas)))
    db.commit()
    return _mis_alertas(db, usuario)


@router.post("/alertas/prueba")
def correo_de_prueba(usuario: Usuario = Depends(get_usuario_actual), db: Session = Depends(get_db)):
    """Mete un correo de prueba en la cola de verdad: si llega, toda la cadena funciona
    (cola -> cartero -> Power Automate/Graph -> Outlook)."""
    if not usuario.correo:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No tienes correo registrado. Pídele al admin que lo agregue en Equipo.")
    html = (
        '<div style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#F1F4F6">'
        '<div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">'
        '<div style="background:#2B2D31;color:#fff;padding:18px 24px;font-weight:700">AGP Planner</div>'
        '<div style="height:4px;background:#7ECEE0"></div><div style="padding:24px;color:#2B2D31">'
        f'<h2 style="margin:0 0 8px">¡Hola {usuario.nombre.split()[0]}, tus alertas funcionan! ✅</h2>'
        '<p style="margin:0;color:#4f555b">Así te van a llegar los avisos del Planner a Outlook.</p></div></div></div>'
    )
    db.add(CorreoCola(para=usuario.correo, asunto="Prueba de alertas · AGP Planner", html=html, evento="prueba"))
    db.commit()
    return {"ok": True, "para": usuario.correo, "modo_envio": settings.correo_modo}
