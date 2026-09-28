"""
Dependencias que usan los routers para saber quien esta haciendo la peticion
y si tiene permiso. Asi cada endpoint se protege con una sola linea:

    usuario: Usuario = Depends(requiere("tarjeta.mover"))
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.seguridad import leer_token
from app.modulos.usuarios.model import Rol, Usuario

esquema_bearer = HTTPBearer(auto_error=False)


def usuario_desde_token(db: Session, token: str | None) -> Usuario | None:
    """Tambien la usa el WebSocket, por eso esta separada de la dependencia."""
    if not token:
        return None
    payload = leer_token(token)
    if not payload:
        return None
    # usuario + rol + permisos en UNA sola consulta (con JOIN). Esto corre en
    # cada peticion, asi que cada viaje a la base que se ahorre aca se nota en todo.
    usuario = db.execute(
        select(Usuario)
        .options(joinedload(Usuario.rol).joinedload(Rol.permisos))
        .where(Usuario.id == int(payload["sub"]))
    ).unique().scalar_one_or_none()
    if not usuario or not usuario.activo or usuario.version_sesion != payload.get("ver"):
        return None
    return usuario


def get_usuario_actual(
    credenciales: HTTPAuthorizationCredentials | None = Depends(esquema_bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    usuario = usuario_desde_token(db, credenciales.credentials if credenciales else None)
    if not usuario:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión vencida o inválida, vuelve a entrar")
    return usuario


def requiere(*permisos: str):
    """Deja pasar solo si el usuario tiene TODOS los permisos pedidos."""

    def verificar(usuario: Usuario = Depends(get_usuario_actual)) -> Usuario:
        faltan = [p for p in permisos if not usuario.puede(p)]
        if faltan:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"No tienes permiso para esto ({', '.join(faltan)})")
        return usuario

    return verificar
