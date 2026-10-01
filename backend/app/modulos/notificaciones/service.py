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

from app.core.config import get_settings
from app.core.eventos import anotar_evento
from app.modulos.notificaciones.model import CorreoCola, Notificacion
from app.modulos.notificaciones.plantillas import correo_evento
from app.modulos.pedidos.model import Historial, Pedido
from app.modulos.tablero.catalogos import valor_config
from app.modulos.usuarios.model import Permiso, Rol, Usuario, roles_permisos

EVENTOS_CON_CORREO_DEFECTO = (
    "pedido.creado,pedido.movido,pedido.asignado,pedido.completado,chat.mencion,"
    "ingreso.codigo_creado,ingreso.pedido_ingresado,ingreso.aprobado"
)

# Todos los avisos que existen, con quien los recibe (para mostrarlo en "Mis alertas")
EVENTOS = [
    ("pedido.creado", "Pedido nuevo", "Llega un pedido nuevo de comercial (dibujo, técnica y admin)"),
    ("ingreso.codigo_creado", "Ya está el código del vehículo", "Técnica creó el código de tu pedido: te toca poner el número de pedido"),
    ("ingreso.pedido_ingresado", "El comercial puso el número de pedido", "Un pedido quedó listo para aprobar (técnica, admin y asignados)"),
    ("ingreso.aprobado", "Pedido aprobado", "Técnica aprobó el ingreso y el pedido pasó a la siguiente columna"),
    ("pedido.asignado", "Me asignan un pedido", "Alguien te pone como responsable"),
    ("pedido.movido", "Un pedido cambia de columna", "Un pedido tuyo, asignado a ti o que sigues avanza o se devuelve"),
    ("pedido.completado", "Un pedido se termina", "Un pedido tuyo o que sigues llega a la columna final"),
    ("chat.mencion", "Me mencionan en el chat", "Alguien escribe @tu-usuario en un pedido"),
    ("chat.mensaje", "Mensajes del chat", "Cualquier mensaje nuevo en tus pedidos (puede ser mucho)"),
    ("pedido.editado", "Editan un pedido", "Cambian datos o piezas de un pedido tuyo o que sigues"),
    ("adjunto.subido", "Suben archivos", "Agregan fotos o planos a un pedido tuyo o que sigues"),
]
CODIGOS_EVENTOS = {e[0] for e in EVENTOS}


def alertas_de(db: Session, u: Usuario) -> set[str]:
    """Que avisos quiere esta persona por correo: los suyos, o los del admin si nunca los cambio."""
    if u.alertas_correo is not None:
        return {e.strip() for e in u.alertas_correo.split(",") if e.strip()}
    return eventos_con_correo(db)


def _correo_permitido(correo: str) -> bool:
    solo = tuple(d.strip().lower() for d in get_settings().correo_solo_dominios.split(",") if d.strip())
    return not solo or correo.lower().endswith(solo)


def eventos_con_correo(db: Session) -> set[str]:
    valor = valor_config(db, "correo.eventos", EVENTOS_CON_CORREO_DEFECTO)
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

    for u in destinatarios:
        db.add(Notificacion(usuario_id=u.id, pedido_id=pedido.id, tipo=accion, titulo=titulo, cuerpo=cuerpo))
        # la campanita le llega siempre; el correo solo si la persona lo quiere para este tipo de aviso
        if u.recibir_correos and u.correo and accion in alertas_de(db, u) and _correo_permitido(u.correo):
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
