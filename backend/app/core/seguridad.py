"""
Contrasenas y tokens.

Las contrasenas NO se guardan tal cual: se guarda un hash bcrypt. Un hash es
de una sola via, o sea que ni nosotros podemos leer la contrasena original.
Si alguien la olvida, el admin se la resetea desde la pantalla de usuarios.
"""
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import get_settings

settings = get_settings()
ALGORITMO = "HS256"


def hashear_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verificar_password(password: str, hash_guardado: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hash_guardado.encode("ascii"))
    except ValueError:
        # hash corrupto o vacio: mejor decir que no coincide que tumbar el login
        return False


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
