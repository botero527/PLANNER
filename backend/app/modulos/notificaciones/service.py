"""
Todo lo que pasa con un pedido entra por registrar_evento():

    1. se guarda en HISTORIAL (la bitacora)
    2. se crea la notificacion de la campanita para cada interesado
    3. si ese tipo de evento manda correo, se deja en COLA_CORREOS
    4. se anota el aviso en vivo (sale cuando haga commit)

Todo en la misma transaccion del cambio: o queda todo o no queda nada.
"""
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.eventos import anotar_evento
from app.modulos.notificaciones.model import CorreoCola, Notificacion
from app.modulos.notificaciones.plantillas import correo_evento
from app.modulos.pedidos.model import Historial, Pedido
from app.modulos.tablero.model import Configuracion
from app.modulos.usuarios.model import Permiso, Rol, Usuario, roles_permisos

EVENTOS_CON_CORREO_DEFECTO = "pedido.creado,pedido.movido,pedido.asignado,pedido.completado,chat.mencion"


def eventos_con_correo(db: Session) -> set[str]:
    fila = db.get(Configuracion, "correo.eventos")
    valor = fila.valor if fila else EVENTOS_CON_CORREO_DEFECTO
    return {e.strip() for e in valor.split(",") if e.strip()}


def usuarios_con_permiso(db: Session, permiso: str) -> list[Usuario]:
    return list(db.scalars(
        select(Usuario)
        .join(Rol, Usuario.rol_id == Rol.id)
        .join(roles_permisos, roles_permisos.c.rol_id == Rol.id)
        .join(Permiso, Permiso.id == roles_permisos.c.permiso_id)
        .where(Permiso.codigo == permiso, Usuario.activo)
    ).unique())


def interesados_del_pedido(pedido: Pedido) -> list[Usuario]:
    """Quien creo el pedido + asignados + seguidores."""
    personas = {pedido.creado_por.id: pedido.creado_por}
    for m in pedido.miembros:
        personas[m.usuario.id] = m.usuario
    return [u for u in personas.values() if u.activo]


def registrar_evento(
    db: Session,
    *,
    pedido: Pedido,
    actor: Usuario,
    accion: str,
    titulo: str,
    cuerpo: str | None = None,
    detalle: dict | None = None,
    para: list[Usuario] | None = None,
    bitacora: bool = True,
) -> None:
    if pedido.id is None:
        db.flush()  # pedido recien creado: necesitamos su id para colgarle el historial
    if bitacora:  # los mensajes del chat no llenan el historial, ya tienen su propia tabla
        db.add(Historial(
            pedido_id=pedido.id,
            usuario_id=actor.id,
            accion=accion,
            detalle=json.dumps(detalle, ensure_ascii=False, default=str) if detalle else None,
        ))

    destinatarios = para if para is not None else interesados_del_pedido(pedido)
    # a uno mismo no le llega aviso de lo que uno mismo hizo
    destinatarios = [u for u in {u.id: u for u in destinatarios}.values() if u.id != actor.id]

    manda_correo = accion in eventos_con_correo(db)
    for u in destinatarios:
        db.add(Notificacion(usuario_id=u.id, pedido_id=pedido.id, tipo=accion, titulo=titulo, cuerpo=cuerpo))
        if manda_correo and u.recibir_correos and u.correo:
            asunto, html = correo_evento(pedido=pedido, actor=actor, titulo=titulo, cuerpo=cuerpo, para=u)
            db.add(CorreoCola(para=u.correo, asunto=asunto, html=html, evento=accion, pedido_id=pedido.id))

    if not destinatarios:
        return
    anotar_evento(
        db, "notificacion",
        accion=accion,
        usuarios=[u.id for u in destinatarios],
        pedido_id=pedido.id,
        titulo=titulo,
        actor={"id": actor.id, "nombre": actor.nombre, "personaje": actor.personaje},
    )
