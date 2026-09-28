from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_usuario_actual, requiere
from app.core.seguridad import guardar_password
from app.modulos.usuarios.model import Rol, Usuario
from app.modulos.usuarios.schemas import (
    ResetPassword, RolOut, UsuarioCrear, UsuarioEditar, UsuarioMini, UsuarioOut,
)

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("/equipo", response_model=list[UsuarioMini])
def equipo(_: Usuario = Depends(get_usuario_actual), db: Session = Depends(get_db)):
    """Todos los activos, para asignar tarjetas y para las @menciones del chat."""
    return db.scalars(select(Usuario).where(Usuario.activo).order_by(Usuario.nombre)).all()


@router.get("/roles", response_model=list[RolOut])
def roles(_: Usuario = Depends(requiere("usuario.administrar")), db: Session = Depends(get_db)):
    return db.scalars(select(Rol).order_by(Rol.id)).all()


@router.get("", response_model=list[UsuarioOut])
def listar(_: Usuario = Depends(requiere("usuario.administrar")), db: Session = Depends(get_db)):
    return db.scalars(select(Usuario).order_by(Usuario.activo.desc(), Usuario.nombre)).all()


@router.post("", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def crear(datos: UsuarioCrear, _: Usuario = Depends(requiere("usuario.administrar")), db: Session = Depends(get_db)):
    if db.scalar(select(Usuario.id).where(Usuario.usuario == datos.usuario)):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Ya existe el usuario '{datos.usuario}'")
    if not db.get(Rol, datos.rol_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ese rol no existe")

    nuevo = Usuario(
        **datos.model_dump(exclude={"password_temporal"}),
        password=guardar_password(datos.password_temporal),
        debe_cambiar_password=True,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.patch("/{usuario_id}", response_model=UsuarioOut)
def editar(
    usuario_id: int,
    datos: UsuarioEditar,
    admin: Usuario = Depends(requiere("usuario.administrar")),
    db: Session = Depends(get_db),
):
    usuario = db.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    cambios = datos.model_dump(exclude_unset=True)

    # que el admin no se quite el admin a si mismo sin querer y quede todo huerfano
    if usuario.id == admin.id and (cambios.get("activo") is False or cambios.get("rol_id", usuario.rol_id) != usuario.rol_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No te puedes desactivar ni cambiar tu propio rol")
    if "rol_id" in cambios and not db.get(Rol, cambios["rol_id"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ese rol no existe")

    for campo, valor in cambios.items():
        setattr(usuario, campo, valor)
    if cambios.get("activo") is False or "rol_id" in cambios:
        usuario.version_sesion += 1  # lo saca de las sesiones abiertas
    db.commit()
    return usuario


@router.post("/{usuario_id}/reset-password", response_model=UsuarioOut)
def reset_password(
    usuario_id: int,
    datos: ResetPassword,
    _: Usuario = Depends(requiere("usuario.administrar")),
    db: Session = Depends(get_db),
):
    """El admin le pone una clave temporal y al entrar el sistema lo obliga a cambiarla."""
    usuario = db.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    usuario.password = guardar_password(datos.password_temporal)
    usuario.debe_cambiar_password = True
    usuario.version_sesion += 1
    db.commit()
    return usuario
