"""
Ingreso del pedido: lo que pasa en la primera columna (Comercial) antes de que
el pedido arranque en Ingenieria.

    1. Tecnica/admin crea el codigo del vehiculo y sube evidencia  -> le avisa al comercial
    2. El comercial escribe el numero de pedido                     -> le avisa a tecnica, admin y asignados
    3. Tecnica/admin aprueba                                       -> el pedido pasa SOLO a la segunda columna

Cada paso exige el anterior, y todo esto solo se puede mientras el pedido siga
en la primera columna. Mientras no este aprobado, nadie lo puede sacar de ahi
(esa regla vive en pedidos.service.mover).
"""
from datetime import UTC, datetime

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.eventos import anotar_evento
from app.modulos.adjuntos import service as archivos
from app.modulos.adjuntos.model import Adjunto
from app.modulos.notificaciones.service import registrar_evento, usuarios_con_permiso
from app.modulos.pedidos import service as pedidos
from app.modulos.pedidos.model import Pedido
from app.modulos.pedidos.schemas import MoverIn
from app.modulos.tablero.model import Columna
from app.modulos.usuarios.model import Usuario


def _ahora() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _en_primera_columna(db: Session, pedido: Pedido) -> None:
    if pedido.columna_id != pedidos.columna_inicial(db).id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este pedido ya salió de la primera columna: el ingreso ya se cerró")


def _resumen(p: Pedido) -> str:
    return " ".join(str(x) for x in (p.marca, p.modelo, p.version_vehiculo) if x)


def marcar_codigo(db: Session, pedido: Pedido, codigo: str | None, evidencia: list[UploadFile], usuario: Usuario) -> Pedido:
    _en_primera_columna(db, pedido)
    if pedido.codigo_vehiculo_en:
        raise HTTPException(status.HTTP_409_CONFLICT, "El código de vehículo ya está marcado como creado")
    if not evidencia:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sube al menos una imagen o archivo como evidencia")

    nuevos, subidos = archivos.guardar(db, pedido_id=pedido.id, codigo_pedido=pedido.codigo, archivos=evidencia,
                                       usuario=usuario, categoria="evidencia_codigo")
    try:
        pedido.codigo_vehiculo = (codigo or "").strip() or None
        pedido.codigo_vehiculo_en = _ahora()
        pedido.codigo_vehiculo_por_id = usuario.id
        pedido.codigo_vehiculo_por = usuario
        # al comercial que creo el pedido: ya puede poner el numero de pedido
        registrar_evento(
            db, pedido=pedido, actor=usuario, accion="ingreso.codigo_creado",
            titulo=f"Ya está el código del vehículo: {_resumen(pedido)}",
            cuerpo=(f"{usuario.nombre} creó el código{' ' + pedido.codigo_vehiculo if pedido.codigo_vehiculo else ''}. "
                    "Entra al Planner y escribe el número de pedido para seguir."),
            detalle={"codigo": pedido.codigo_vehiculo, "evidencias": [a.nombre_original for a in nuevos]},
            para=[pedido.creado_por],
        )
        anotar_evento(db, "tablero.cambio", pedido_id=pedido.id, motivo="ingreso", por=usuario.id)
        anotar_evento(db, "adjuntos.cambio", pedido_id=pedido.id, mensaje_id=None)
        db.commit()
    except Exception:
        db.rollback()
        archivos.borrar_subidos(subidos)
        raise
    return pedido


def deshacer_codigo(db: Session, pedido: Pedido, usuario: Usuario) -> Pedido:
    """Por si se marco por error. Solo antes de que el comercial ponga el numero."""
    _en_primera_columna(db, pedido)
    if not pedido.codigo_vehiculo_en:
        raise HTTPException(status.HTTP_409_CONFLICT, "El código todavía no está marcado")
    if pedido.numero_pedido:
        raise HTTPException(status.HTTP_409_CONFLICT, "El comercial ya puso el número de pedido: ya no se puede deshacer")
    for a in db.scalars(select(Adjunto).where(Adjunto.pedido_id == pedido.id, Adjunto.categoria == "evidencia_codigo")):
        a.eliminado = True  # borrado suave, como todos los archivos
    pedido.codigo_vehiculo = pedido.codigo_vehiculo_en = pedido.codigo_vehiculo_por_id = None
    pedido.codigo_vehiculo_por = None
    registrar_evento(db, pedido=pedido, actor=usuario, accion="ingreso.codigo_deshecho",
                     titulo=f"{usuario.nombre} deshizo la marca del código de vehículo", para=[])
    anotar_evento(db, "tablero.cambio", pedido_id=pedido.id, motivo="ingreso", por=usuario.id)
    db.commit()
    return pedido


def poner_numero(db: Session, pedido: Pedido, numero: str, usuario: Usuario) -> Pedido:
    _en_primera_columna(db, pedido)
    if not pedidos.puede_poner_pedido(usuario, pedido):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "El número de pedido lo pone el comercial que creó el pedido")
    if not pedido.codigo_vehiculo_en:
        raise HTTPException(status.HTTP_409_CONFLICT, "Primero técnica tiene que crear el código del vehículo")
    if pedido.aprobado_en:
        raise HTTPException(status.HTTP_409_CONFLICT, "El pedido ya está aprobado")
    numero = " ".join(numero.split())
    if not numero:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Escribe el número de pedido")

    corrigiendo = pedido.numero_pedido is not None
    anterior = pedido.numero_pedido
    pedido.numero_pedido = numero
    pedido.numero_pedido_en = _ahora()
    pedido.numero_pedido_por_id = usuario.id
    pedido.numero_pedido_por = usuario
    # a tecnica, admin y los asignados: ya pueden revisar y aprobar
    interesados = usuarios_con_permiso(db, "ingreso.gestionar") + [m.usuario for m in pedido.miembros if m.tipo == "asignado"]
    registrar_evento(
        db, pedido=pedido, actor=usuario, accion="ingreso.pedido_ingresado",
        titulo=(f"Corrigieron el número de pedido de {_resumen(pedido)}: {numero}" if corrigiendo
                else f"{usuario.nombre} puso el número de pedido {numero}: {_resumen(pedido)}"),
        cuerpo="La información está lista para revisar y aprobar en el Planner.",
        detalle={"numero": numero, "antes": anterior},
        para=interesados,
    )
    anotar_evento(db, "tablero.cambio", pedido_id=pedido.id, motivo="ingreso", por=usuario.id)
    db.commit()
    return pedido


def aprobar(db: Session, pedido: Pedido, usuario: Usuario) -> Pedido:
    _en_primera_columna(db, pedido)
    if not pedido.codigo_vehiculo_en:
        raise HTTPException(status.HTTP_409_CONFLICT, "Falta crear el código del vehículo")
    if not pedido.numero_pedido:
        raise HTTPException(status.HTTP_409_CONFLICT, "Falta que el comercial ponga el número de pedido")
    if pedido.aprobado_en:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este pedido ya está aprobado")

    # la columna que sigue a la primera (hoy: Ingenieria)
    inicial = pedidos.columna_inicial(db)
    siguiente = db.scalar(
        select(Columna).where(Columna.activa, Columna.orden > inicial.orden).order_by(Columna.orden).limit(1)
    )
    if not siguiente:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "No hay una columna después de la primera para mandar el pedido")

    pedido.aprobado_en = _ahora()
    pedido.aprobado_por_id = usuario.id
    pedido.aprobado_por = usuario
    registrar_evento(
        db, pedido=pedido, actor=usuario, accion="ingreso.aprobado",
        titulo=f"Pedido aprobado: {_resumen(pedido)} pasó a «{siguiente.nombre}»",
        cuerpo=f"{usuario.nombre} aprobó el ingreso (pedido {pedido.numero_pedido}). Desde ahora el comercial ya no puede editarlo.",
        detalle={"a": siguiente.nombre, "numero": pedido.numero_pedido},
    )
    db.flush()
    # lo movemos sin el aviso de "cambio de columna": ya avisamos con "aprobado" (si no, llegarian 2 correos)
    return pedidos.mover(db, pedido, MoverIn(columna_id=siguiente.id, indice=0), usuario, avisar=False)
