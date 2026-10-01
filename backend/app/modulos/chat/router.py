"""
Chat de cada pedido, estilo Teams: mensajes, respuestas, @menciones,
editar/borrar lo propio y "fulano esta escribiendo" (eso va por el WebSocket).
"""
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import requiere
from app.core.eventos import anotar_evento
from app.core.tipos import FechaUTC
from app.modulos.adjuntos.router import AdjuntoOut, adjunto_out
from app.modulos.adjuntos.model import Adjunto
from app.modulos.chat.model import Mensaje
from app.modulos.notificaciones.service import interesados_del_pedido, registrar_evento
from app.modulos.pedidos import service as pedidos
from app.modulos.usuarios.model import Usuario
from app.modulos.usuarios.schemas import UsuarioMini

router = APIRouter(tags=["chat"])

# @usuario: letras, numeros, punto y guion bajo (igual que los nombres de usuario)
PATRON_MENCION = re.compile(r"@([a-z0-9._]{3,50})", re.IGNORECASE)


class MensajeIn(BaseModel):
    texto: str = Field(min_length=1, max_length=4000)
    respuesta_a_id: int | None = None


class MensajeEditar(BaseModel):
    texto: str = Field(min_length=1, max_length=4000)


class MensajeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pedido_id: int
    autor: UsuarioMini
    texto: str
    respuesta_a_id: int | None
    editado_en: FechaUTC | None
    eliminado: bool
    creado_en: FechaUTC
    adjuntos: list[AdjuntoOut] = []


def _salida(m: Mensaje, adjuntos: list[Adjunto] | None = None) -> MensajeOut:
    out = MensajeOut.model_validate(m)
    if m.eliminado:
        out.texto = ""  # el texto borrado no sale, solo el aviso de "mensaje eliminado"
    else:
        out.adjuntos = [adjunto_out(a) for a in adjuntos or []]
    return out


def _mencionados(db: Session, texto: str) -> list[Usuario]:
    nombres = {n.lower() for n in PATRON_MENCION.findall(texto)}
    if not nombres:
        return []
    return list(db.scalars(select(Usuario).where(Usuario.usuario.in_(nombres), Usuario.activo)))


@router.get("/pedidos/{pedido_id}/mensajes", response_model=list[MensajeOut])
def listar(
    pedido_id: int,
    antes_de: int | None = Query(default=None, description="para paginar hacia atras (scroll arriba)"),
    limite: int = Query(default=50, ge=1, le=200),
    _: Usuario = Depends(requiere("pedido.ver")),
    db: Session = Depends(get_db),
):
    pedidos.verificar_existe(db, pedido_id)
    consulta = select(Mensaje).where(Mensaje.pedido_id == pedido_id)
    if antes_de:
        consulta = consulta.where(Mensaje.id < antes_de)
    mensajes = list(db.scalars(consulta.order_by(Mensaje.id.desc()).limit(limite)))
    mensajes.reverse()  # el chat se lee de viejo a nuevo

    ids = [m.id for m in mensajes]
    por_mensaje: dict[int, list[Adjunto]] = {}
    if ids:
        for a in db.scalars(select(Adjunto).where(Adjunto.mensaje_id.in_(ids), Adjunto.eliminado == False)):  # noqa: E712
            por_mensaje.setdefault(a.mensaje_id, []).append(a)
    return [_salida(m, por_mensaje.get(m.id)) for m in mensajes]


@router.post("/pedidos/{pedido_id}/mensajes", response_model=MensajeOut, status_code=status.HTTP_201_CREATED)
def enviar(
    pedido_id: int, datos: MensajeIn,
    usuario: Usuario = Depends(requiere("chat.escribir")), db: Session = Depends(get_db),
):
    pedido = pedidos.obtener_para_avisos(db, pedido_id)
    if datos.respuesta_a_id:
        original = db.get(Mensaje, datos.respuesta_a_id)
        if not original or original.pedido_id != pedido_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "El mensaje al que respondes no es de este pedido")

    mensaje = Mensaje(pedido_id=pedido_id, autor_id=usuario.id, autor=usuario,
                      texto=datos.texto.strip(), respuesta_a_id=datos.respuesta_a_id)
    db.add(mensaje)
    db.flush()

    corto = mensaje.texto if len(mensaje.texto) <= 140 else mensaje.texto[:137] + "..."
    mencionados = _mencionados(db, mensaje.texto)
    ids_mencionados = {u.id for u in mencionados}
    if mencionados:
        registrar_evento(
            db, pedido=pedido, actor=usuario, accion="chat.mencion",
            titulo=f"{usuario.nombre} te mencionó en {pedido.codigo}", cuerpo=corto,
            para=mencionados, bitacora=False,
        )
    # al resto de interesados les llega el aviso normal (sin repetirle a los mencionados)
    registrar_evento(
        db, pedido=pedido, actor=usuario, accion="chat.mensaje",
        titulo=f"{usuario.nombre} escribió en {pedido.codigo}", cuerpo=corto,
        para=[u for u in interesados_del_pedido(pedido) if u.id not in ids_mencionados],
        bitacora=False,
    )
    salida = _salida(mensaje)
    anotar_evento(db, "chat.mensaje", pedido_id=pedido_id, mensaje=salida.model_dump(mode="json"))
    db.commit()
    return salida


def _mensaje_propio(db: Session, mensaje_id: int, usuario: Usuario, permitir_admin: bool = False) -> Mensaje:
    m = db.get(Mensaje, mensaje_id)
    if not m or m.eliminado:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ese mensaje no existe")
    es_admin = permitir_admin and usuario.puede("usuario.administrar")
    if m.autor_id != usuario.id and not es_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo puedes cambiar tus propios mensajes")
    return m


@router.patch("/mensajes/{mensaje_id}", response_model=MensajeOut)
def editar(mensaje_id: int, datos: MensajeEditar, usuario: Usuario = Depends(requiere("chat.escribir")), db: Session = Depends(get_db)):
    m = _mensaje_propio(db, mensaje_id, usuario)
    m.texto = datos.texto.strip()
    m.editado_en = datetime.now(UTC).replace(tzinfo=None)
    salida = _salida(m)
    anotar_evento(db, "chat.editado", pedido_id=m.pedido_id, mensaje=salida.model_dump(mode="json"))
    db.commit()
    return salida


@router.delete("/mensajes/{mensaje_id}", response_model=MensajeOut)
def eliminar(mensaje_id: int, usuario: Usuario = Depends(requiere("chat.escribir")), db: Session = Depends(get_db)):
    m = _mensaje_propio(db, mensaje_id, usuario, permitir_admin=True)
    m.eliminado = True
    salida = _salida(m)
    anotar_evento(db, "chat.editado", pedido_id=m.pedido_id, mensaje=salida.model_dump(mode="json"))
    db.commit()
    return salida
