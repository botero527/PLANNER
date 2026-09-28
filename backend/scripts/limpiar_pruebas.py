"""
Borra TODO lo que dejaron las pruebas: usuarios que empiezan por zz_ y todo
lo que ellos crearon (pedidos, chat, archivos en el Blob, correos, notificaciones).

Lo usan los tests al empezar y al terminar, y tambien se puede correr a mano
si una prueba se corto a la mitad:

    cd backend
    .venv\\Scripts\\python -m scripts.limpiar_pruebas
"""
from sqlalchemy import delete, or_, select

import app.modelos  # noqa: F401
from app.core.db import SesionLocal
from app.modulos.adjuntos import blob
from app.modulos.adjuntos.model import Adjunto
from app.modulos.chat.model import Mensaje
from app.modulos.notificaciones.model import CorreoCola, Notificacion
from app.modulos.pedidos.model import Historial, Pedido, PedidoMiembro
from app.modulos.usuarios.model import Usuario

PREFIJO = "zz_"


def limpiar(prefijo: str = PREFIJO) -> dict[str, int]:
    with SesionLocal() as db:
        ids_usuarios = list(db.scalars(select(Usuario.id).where(Usuario.usuario.like(f"{prefijo}%"))))
        if not ids_usuarios:
            return {"usuarios": 0, "pedidos": 0, "archivos": 0}

        ids_pedidos = list(db.scalars(select(Pedido.id).where(Pedido.creado_por_id.in_(ids_usuarios))))
        archivos = 0
        if ids_pedidos:
            for a in db.scalars(select(Adjunto).where(Adjunto.pedido_id.in_(ids_pedidos))):
                try:
                    blob.borrar(a.blob_nombre)
                    archivos += 1
                except Exception:  # noqa: BLE001 - si ya no existe en el Blob, igual seguimos
                    pass
            db.execute(delete(CorreoCola).where(CorreoCola.pedido_id.in_(ids_pedidos)))
            db.execute(delete(Notificacion).where(Notificacion.pedido_id.in_(ids_pedidos)))
            # cascada: piezas, miembros, checklist, historial, mensajes y adjuntos
            db.execute(delete(Pedido).where(Pedido.id.in_(ids_pedidos)))

        # rastros de estos usuarios en pedidos de OTRAS personas
        db.execute(delete(Mensaje).where(Mensaje.autor_id.in_(ids_usuarios)))
        db.execute(delete(Historial).where(Historial.usuario_id.in_(ids_usuarios)))
        db.execute(delete(PedidoMiembro).where(PedidoMiembro.usuario_id.in_(ids_usuarios)))
        db.execute(delete(Notificacion).where(Notificacion.usuario_id.in_(ids_usuarios)))
        db.execute(delete(CorreoCola).where(or_(CorreoCola.para.like(f"{prefijo}%"))))
        db.execute(delete(Usuario).where(Usuario.id.in_(ids_usuarios)))
        db.commit()
        return {"usuarios": len(ids_usuarios), "pedidos": len(ids_pedidos), "archivos": archivos}


if __name__ == "__main__":
    print("Limpieza:", limpiar())
