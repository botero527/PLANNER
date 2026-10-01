"""
Reglas de negocio de los pedidos. El router solo recibe y responde; toda la
logica (quien puede que, como se ordena, que se notifica) vive aca.
"""
import json
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import case, func, select, update
from sqlalchemy.orm import Session, aliased, lazyload
from sqlalchemy.orm.attributes import set_committed_value

from app.core.eventos import anotar_evento
from app.modulos.adjuntos import blob
from app.modulos.adjuntos.model import Adjunto
from app.modulos.chat.model import Mensaje
from app.modulos.notificaciones.service import registrar_evento, usuarios_con_permiso
from app.modulos.pedidos.model import SEQ_PEDIDOS, ChecklistItem, Pedido, PedidoMiembro, PedidoPieza
from app.modulos.pedidos.schemas import (
    ChecklistOut, MoverIn, PedidoCrear, PedidoDetalle, PedidoEditar, PedidoTarjeta, PiezaIn, PiezaOut,
)
from app.modulos.tablero.catalogos import catalogo_piezas, mercados, valor_config
from app.modulos.tablero.model import Columna, Etiqueta
from app.modulos.usuarios.model import Usuario

HUECO = 1024  # distancia entre posiciones, ver mover()

NOMBRE_PRIORIDAD = {"baja": "Baja", "media": "Media", "alta": "Alta", "urgente": "Urgente"}


def _ahora() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def obtener(db: Session, pedido_id: int) -> Pedido:
    pedido = db.get(Pedido, pedido_id)
    if not pedido or pedido.eliminado:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ese pedido no existe o fue eliminado")
    return pedido


def obtener_para_avisos(db: Session, pedido_id: int) -> Pedido:
    """El pedido con solo lo necesario para saber a quien avisar (creador y
    miembros). Las piezas, etiquetas y checklist quedan para cargarse solo si
    alguien las pide (por ejemplo el correo). El chat lo usa en cada mensaje."""
    pedido = db.scalar(
        select(Pedido)
        .options(lazyload(Pedido.piezas), lazyload(Pedido.etiquetas), lazyload(Pedido.checklist))
        .where(Pedido.id == pedido_id, Pedido.eliminado == False)  # noqa: E712
    )
    if not pedido:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ese pedido no existe o fue eliminado")
    return pedido


def verificar_existe(db: Session, pedido_id: int) -> None:
    """Para los endpoints que solo necesitan saber que el pedido existe (chat,
    archivos, historial): una consulta liviana en vez de cargarlo con todo."""
    if not db.scalar(select(Pedido.id).where(Pedido.id == pedido_id, Pedido.eliminado == False)):  # noqa: E712
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ese pedido no existe o fue eliminado")


def puede_editar(usuario: Usuario, pedido: Pedido, columna_inicial_id: int | None) -> bool:
    """Los que trabajan el pedido lo editan siempre. El comercial que lo creo
    solo mientras siga en la primera columna (despues ya lo estan trabajando)."""
    if usuario.puede("pedido.editar"):
        return True
    return pedido.creado_por_id == usuario.id and pedido.columna_id == columna_inicial_id


def columna_inicial(db: Session) -> Columna:
    col = db.scalar(
        select(Columna).where(Columna.activa, Columna.es_inicial).order_by(Columna.orden)
    ) or db.scalar(select(Columna).where(Columna.activa).order_by(Columna.orden))
    if not col:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "No hay columnas configuradas en el tablero")
    return col


def _validar_usuarios(db: Session, ids: list[int]) -> list[Usuario]:
    if not ids:
        return []
    usuarios = list(db.scalars(select(Usuario).where(Usuario.id.in_(set(ids)), Usuario.activo)))
    if len(usuarios) != len(set(ids)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Alguno de los usuarios asignados no existe o está inactivo")
    return usuarios


def _validar_etiquetas(db: Session, ids: list[int]) -> list[Etiqueta]:
    if not ids:
        return []
    etiquetas = list(db.scalars(select(Etiqueta).where(Etiqueta.id.in_(set(ids)), Etiqueta.activa)))
    if len(etiquetas) != len(set(ids)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Alguna etiqueta no existe")
    return etiquetas


def _resumen_vehiculo(p: Pedido) -> str:
    return " ".join(str(x) for x in (p.marca, p.modelo, p.version_vehiculo) if x)


def _validar_mercado(db: Session, mercado: str) -> None:
    if mercado not in mercados(db):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Mercado no válido. Opciones: {', '.join(mercados(db))}")


def _armar_piezas(db: Session, piezas: list[PiezaIn]) -> list[PedidoPieza]:
    """Si la pieza trae codigo, el nombre sale del catalogo (asi todos escriben
    igual "Lateral Delantero Izquierdo"). Si escriben el nombre exacto de una
    pieza del catalogo, se le pone su codigo."""
    catalogo = catalogo_piezas(db)
    por_nombre = {c.nombre.lower(): c for c in catalogo.values()}
    resultado = []
    for i, pz in enumerate(piezas):
        if pz.codigo:
            item = catalogo.get(pz.codigo)
            if not item:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"El código de pieza {pz.codigo} no existe en el catálogo")
            codigo, nombre = item.codigo, item.nombre
        else:
            nombre = " ".join(pz.nombre.split())
            if not nombre:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cada pieza necesita un código o un nombre")
            item = por_nombre.get(nombre.lower())
            codigo = item.codigo if item else None
        resultado.append(PedidoPieza(codigo=codigo, nombre=nombre, observacion=pz.observacion or None, orden=i))
    return resultado


# Lectura

def a_tarjetas(db: Session, pedidos: list[Pedido]) -> list[PedidoTarjeta]:
    """Arma las tarjetas con sus contadores. Los conteos salen de UNA sola
    consulta para todos los pedidos, no una por pedido (eso seria el famoso N+1)."""
    if not pedidos:
        return []
    ids = [p.id for p in pedidos]

    # Todo en UNA consulta: por cada pedido, cuantos mensajes, cuantos
    # archivos y cual es la primera imagen (la portada, como en Planner).
    mensajes = (
        select(Mensaje.pedido_id, func.count().label("n"))
        .where(Mensaje.pedido_id.in_(ids), Mensaje.eliminado == False)  # noqa: E712
        .group_by(Mensaje.pedido_id)
        .subquery()
    )
    archivos = (
        select(
            Adjunto.pedido_id,
            func.count().label("n"),
            func.min(case((Adjunto.tipo_mime.like("image/%"), Adjunto.id))).label("portada_id"),
        )
        .where(Adjunto.pedido_id.in_(ids), Adjunto.eliminado == False)  # noqa: E712
        .group_by(Adjunto.pedido_id)
        .subquery()
    )
    portada = aliased(Adjunto)
    filas = db.execute(
        select(Pedido.id, mensajes.c.n, archivos.c.n, portada.blob_nombre)
        .outerjoin(mensajes, mensajes.c.pedido_id == Pedido.id)
        .outerjoin(archivos, archivos.c.pedido_id == Pedido.id)
        .outerjoin(portada, portada.id == archivos.c.portada_id)
        .where(Pedido.id.in_(ids))
    ).all()
    conteos = {pid: (n_msj or 0, n_adj or 0, blob_portada) for pid, n_msj, n_adj, blob_portada in filas}

    tarjetas = []
    for p in pedidos:
        t = PedidoTarjeta.model_validate(p)
        t.total_piezas = len(p.piezas)
        t.checklist_total = len(p.checklist)
        t.checklist_hechos = sum(1 for c in p.checklist if c.hecho)
        n_msj, n_adj, blob_portada = conteos.get(p.id, (0, 0, None))
        t.total_mensajes = n_msj
        t.total_adjuntos = n_adj
        if blob_portada:
            t.portada_url = blob.url_firmada(blob_portada)
        tarjetas.append(t)
    return tarjetas


def a_detalle(db: Session, pedido: Pedido, usuario: Usuario) -> PedidoDetalle:
    tarjeta = a_tarjetas(db, [pedido])[0]
    return PedidoDetalle(
        **tarjeta.model_dump(),
        vin=pedido.vin,
        plataforma=pedido.plataforma,
        info_en_drive=pedido.info_en_drive,
        descripcion=pedido.descripcion,
        piezas=[PiezaOut.model_validate(pz) for pz in pedido.piezas],
        checklist=[ChecklistOut.model_validate(c) for c in pedido.checklist],
        # en la base es texto JSON, hacia afuera sale como objeto
        datos_extra=json.loads(pedido.datos_extra) if pedido.datos_extra else None,
        actualizado_en=pedido.actualizado_en,
        puedo_editar=puede_editar(usuario, pedido, columna_inicial(db).id),
    )


def pedidos_del_tablero(db: Session) -> list[Pedido]:
    """Todo lo activo, menos lo terminado hace mas de N dias (configurable),
    para que la columna final no se vuelva un cementerio infinito."""
    dias = int(valor_config(db, "tablero.dias_visibles_terminados", "30"))
    limite = _ahora() - timedelta(days=dias)
    return list(db.scalars(
        select(Pedido)
        .where(
            Pedido.eliminado == False,  # noqa: E712
            (Pedido.completado_en.is_(None)) | (Pedido.completado_en >= limite),
        )
        .order_by(Pedido.columna_id, Pedido.posicion, Pedido.id)
    ))


# Escritura

def crear(db: Session, datos: PedidoCrear, usuario: Usuario) -> Pedido:
    asignados = _validar_usuarios(db, datos.asignados)
    etiquetas = _validar_etiquetas(db, datos.etiquetas)
    _validar_mercado(db, datos.mercado)
    piezas = _armar_piezas(db, datos.piezas)
    col = columna_inicial(db)

    consecutivo = db.execute(SEQ_PEDIDOS.next_value()).scalar_one()
    arriba = db.scalar(select(func.min(Pedido.posicion)).where(Pedido.columna_id == col.id, Pedido.eliminado == False))  # noqa: E712

    pedido = Pedido(
        codigo=f"PED-{_ahora().year}-{consecutivo:04d}",
        **datos.model_dump(exclude={"piezas", "asignados", "etiquetas", "datos_extra"}),
        datos_extra=json.dumps(datos.datos_extra, ensure_ascii=False) if datos.datos_extra else None,
        columna_id=col.id,
        posicion=(arriba - HUECO) if arriba is not None else HUECO,  # lo nuevo entra arriba
        creado_por_id=usuario.id,
        creado_por=usuario,
        piezas=piezas,
        miembros=[PedidoMiembro(usuario=u, usuario_id=u.id, tipo="asignado") for u in asignados],
        etiquetas=etiquetas,
    )
    db.add(pedido)
    db.flush()

    # pedido nuevo: le llega a todos los que tienen el permiso de recibirlos + asignados
    interesados = usuarios_con_permiso(db, "notificacion.pedidos_nuevos") + asignados
    registrar_evento(
        db, pedido=pedido, actor=usuario, accion="pedido.creado",
        titulo=f"Nuevo pedido: {_resumen_vehiculo(pedido)}",
        cuerpo=(f"{usuario.nombre} creó un pedido con {len(pedido.piezas)} pieza(s). "
                f"Mercado {pedido.mercado} · vidrio {'3D' if pedido.tipo_vidrio == '3d' else 'original'}."),
        para=interesados,
    )
    anotar_evento(db, "tablero.cambio", pedido_id=pedido.id, motivo="creado", por=usuario.id)
    db.commit()
    return pedido


def editar(db: Session, pedido: Pedido, datos: PedidoEditar, usuario: Usuario) -> Pedido:
    if not puede_editar(usuario, pedido, columna_inicial(db).id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No puedes editar este pedido")
    if datos.version != pedido.version:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Alguien más modificó este pedido mientras lo editabas. Recarga para ver los cambios.",
        )

    if datos.mercado is not None:
        _validar_mercado(db, datos.mercado)
    cambios = datos.model_dump(exclude_unset=True, exclude={"version", "piezas", "etiquetas", "datos_extra"})
    antes = {k: getattr(pedido, k) for k in cambios}
    for campo, valor in cambios.items():
        setattr(pedido, campo, valor)

    if datos.piezas is not None:
        pedido.piezas = _armar_piezas(db, datos.piezas)
        cambios["piezas"] = len(datos.piezas)
    if datos.etiquetas is not None:
        pedido.etiquetas = _validar_etiquetas(db, datos.etiquetas)
        cambios["etiquetas"] = [e.nombre for e in pedido.etiquetas]
    if "datos_extra" in datos.model_fields_set:
        pedido.datos_extra = json.dumps(datos.datos_extra, ensure_ascii=False) if datos.datos_extra else None

    if cambios:
        registrar_evento(
            db, pedido=pedido, actor=usuario, accion="pedido.editado",
            titulo=f"{usuario.nombre} actualizó el pedido",
            detalle={"antes": antes, "despues": {k: v for k, v in cambios.items()}},
        )
    anotar_evento(db, "tablero.cambio", pedido_id=pedido.id, motivo="editado", por=usuario.id)
    db.commit()
    return pedido


def mover(db: Session, pedido: Pedido, datos: MoverIn, usuario: Usuario) -> Pedido:
    """Mueve la tarjeta a otra columna y/o puesto.

    Las posiciones van con huecos (1024, 2048, 3072...). Meter una tarjeta
    entre dos es solo sacar el promedio: se actualiza UNA fila en vez de
    renumerar toda la columna. Solo cuando los huecos se agotan (despues de
    muchos movimientos en el mismo sitio) se renumera la columna completa.

    Ojo: esto se guarda con UPDATE directo y NO sube la version del pedido.
    La version es para cambios de contenido; si moverlo la subiera, alguien
    que estuviera editando los datos recibiria un "conflicto" falso al guardar."""
    destino = db.get(Columna, datos.columna_id)
    if not destino or not destino.activa:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Esa columna no existe")
    origen = db.get(Columna, pedido.columna_id)
    cambia_columna = destino.id != pedido.columna_id

    # solo lo necesario de los vecinos (id, posicion, terminado), sin cargar sus relaciones
    vecinos = db.execute(
        select(Pedido.id, Pedido.posicion, Pedido.completado_en)
        .where(Pedido.columna_id == destino.id, Pedido.eliminado == False, Pedido.id != pedido.id)  # noqa: E712
        .order_by(Pedido.posicion, Pedido.id)
    ).all()

    if cambia_columna and destino.limite_wip is not None:
        activos = sum(1 for v in vecinos if v.completado_en is None)
        if activos >= destino.limite_wip:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"«{destino.nombre}» ya tiene su máximo de {destino.limite_wip} pedidos. Saca uno primero.",
            )

    indice = min(datos.indice, len(vecinos))
    arriba = vecinos[indice - 1].posicion if indice > 0 else None
    abajo = vecinos[indice].posicion if indice < len(vecinos) else None

    renumerar: list[int] | None = None
    if arriba is None and abajo is None:
        posicion = HUECO
    elif arriba is None:
        posicion = abajo - HUECO
    elif abajo is None:
        posicion = arriba + HUECO
    elif abajo - arriba > 1:
        posicion = (arriba + abajo) // 2
    else:
        # se acabo el hueco: renumerar la columna con el pedido ya en su puesto
        renumerar = [v.id for v in vecinos]
        renumerar.insert(indice, pedido.id)
        posicion = (indice + 1) * HUECO

    cambios: dict = {"posicion": posicion}
    if cambia_columna:
        cambios["columna_id"] = destino.id
        if destino.es_final and not pedido.completado_en:
            cambios["completado_en"] = _ahora()
        elif not destino.es_final:
            cambios["completado_en"] = None

    if renumerar:
        for i, pid in enumerate(renumerar, start=1):
            if pid != pedido.id:
                db.execute(update(Pedido).where(Pedido.id == pid).values(posicion=i * HUECO))
    db.execute(update(Pedido).where(Pedido.id == pedido.id).values(**cambios))
    # le decimos al objeto en memoria los valores nuevos sin que el ORM lo marque
    # como "modificado" (si no, al hacer commit subiria la version)
    for campo, valor in cambios.items():
        set_committed_value(pedido, campo, valor)

    if cambia_columna:
        terminado = destino.es_final
        registrar_evento(
            db, pedido=pedido, actor=usuario,
            accion="pedido.completado" if terminado else "pedido.movido",
            titulo=(f"¡Pedido terminado! {_resumen_vehiculo(pedido)}" if terminado
                    else f"{_resumen_vehiculo(pedido)} pasó a «{destino.nombre}»"),
            cuerpo=f"{usuario.nombre} lo movió de «{origen.nombre if origen else '?'}» a «{destino.nombre}».",
            detalle={"de": origen.nombre if origen else None, "a": destino.nombre,
                     "de_id": origen.id if origen else None, "a_id": destino.id},
        )

    anotar_evento(
        db, "tablero.movido",
        pedido_id=pedido.id, columna_id=destino.id, posicion=posicion,
        por={"id": usuario.id, "nombre": usuario.nombre, "personaje": usuario.personaje},
        completado=bool(cambia_columna and destino.es_final),
    )
    db.commit()
    return pedido


def asignar(db: Session, pedido: Pedido, ids: list[int], usuario: Usuario) -> Pedido:
    nuevos_asignados = _validar_usuarios(db, ids)
    antes = {m.usuario_id for m in pedido.miembros if m.tipo == "asignado"}
    seguidores = [m for m in pedido.miembros if m.tipo == "seguidor" and m.usuario_id not in set(ids)]

    pedido.miembros = seguidores + [
        PedidoMiembro(usuario_id=u.id, usuario=u, tipo="asignado") for u in nuevos_asignados
    ]
    recien = [u for u in nuevos_asignados if u.id not in antes]
    if recien:
        registrar_evento(
            db, pedido=pedido, actor=usuario, accion="pedido.asignado",
            titulo=f"Te asignaron: {_resumen_vehiculo(pedido)}",
            cuerpo=f"{usuario.nombre} te puso a cargo de este pedido.",
            detalle={"asignados": [u.nombre for u in recien]},
            para=recien,
        )
    anotar_evento(db, "tablero.cambio", pedido_id=pedido.id, motivo="miembros", por=usuario.id)
    db.commit()
    return pedido


def alternar_seguir(db: Session, pedido: Pedido, usuario: Usuario) -> bool:
    actual = next((m for m in pedido.miembros if m.usuario_id == usuario.id), None)
    if actual and actual.tipo == "asignado":
        return True  # el asignado siempre sigue el pedido, no se puede "dejar de seguir"
    if actual:
        pedido.miembros.remove(actual)
        siguiendo = False
    else:
        pedido.miembros.append(PedidoMiembro(usuario_id=usuario.id, usuario=usuario, tipo="seguidor"))
        siguiendo = True
    db.commit()
    return siguiendo


def eliminar(db: Session, pedido: Pedido, usuario: Usuario) -> None:
    # borrado suave: se esconde pero queda en la base por si toca recuperarlo
    pedido.eliminado = True
    registrar_evento(db, pedido=pedido, actor=usuario, accion="pedido.eliminado",
                     titulo=f"{usuario.nombre} eliminó el pedido {pedido.codigo}", para=[])
    anotar_evento(db, "tablero.cambio", pedido_id=pedido.id, motivo="eliminado", por=usuario.id)
    db.commit()


# Checklist

def agregar_item(db: Session, pedido: Pedido, texto: str, usuario: Usuario) -> ChecklistItem:
    item = ChecklistItem(texto=texto.strip(), orden=len(pedido.checklist))
    pedido.checklist.append(item)
    anotar_evento(db, "pedido.cambio", pedido_id=pedido.id, por=usuario.id)
    db.commit()
    return item


def editar_item(db: Session, item: ChecklistItem, texto: str | None, hecho: bool | None, usuario: Usuario) -> ChecklistItem:
    if texto is not None:
        item.texto = texto.strip()
    if hecho is not None and hecho != item.hecho:
        item.hecho = hecho
        item.hecho_por_id = usuario.id if hecho else None
        item.hecho_en = _ahora() if hecho else None
    anotar_evento(db, "pedido.cambio", pedido_id=item.pedido_id, por=usuario.id)
    db.commit()
    return item
