"""
Contrasenas y tokens.

Las contrasenas se guardan en texto plano (decision del equipo, 2026-09-28).
Si alguien la olvida, el admin la consulta o se la resetea desde Equipo.
"""
from datetime import UTC, datetime, timedelta

import secrets

import bcrypt
import jwt

from app.core.config import get_settings

settings = get_settings()
ALGORITMO = "HS256"


def guardar_password(password: str) -> str:
    """Por decision del equipo la contrasena se guarda tal cual (texto plano),
    para que el admin la pueda consultar. Si algun dia se vuelve a hash, se
    cambia solo esta funcion y verificar_password."""
    return password


def verificar_password(password: str, guardada: str) -> bool:
    if guardada.startswith("$2"):
        # usuarios viejos que todavia tienen hash bcrypt (de antes del cambio)
        try:
            return bcrypt.checkpw(password.encode("utf-8"), guardada.encode("ascii"))
        except ValueError:
            return False
    # compare_digest compara en tiempo constante: no deja adivinar la clave
    # midiendo cuanto se demora la respuesta
    return secrets.compare_digest(password.encode("utf-8"), guardada.encode("utf-8"))


def crear_token(usuario_id: int, version_sesion: int) -> str:
    ahora = datetime.now(UTC)
    payload = {
        "sub": str(usuario_id),
        # si el admin resetea la contrasena sube la version y los tokens viejos dejan de servir
        "ver": version_sesion,
        "iat": ahora,
        "exp": ahora + timedelta(hours=settings.jwt_horas),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITMO)


def leer_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITMO])
    except jwt.PyJWTError:
        return None
