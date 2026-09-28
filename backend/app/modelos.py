"""
Importa todos los modelos en un solo lugar.
Alembic y el seed necesitan que SQLAlchemy conozca TODAS las tablas; si un
modelo no se importa en ningun lado, para ellos esa tabla no existe.
"""
from app.core.db import Base  # noqa: F401
from app.modulos.adjuntos.model import Adjunto  # noqa: F401
from app.modulos.chat.model import Mensaje  # noqa: F401
from app.modulos.notificaciones.model import CorreoCola, Notificacion  # noqa: F401
from app.modulos.pedidos.model import (  # noqa: F401
    ChecklistItem, Historial, Pedido, PedidoMiembro, PedidoPieza,
)
from app.modulos.tablero.model import Columna, Configuracion, Etiqueta  # noqa: F401
from app.modulos.usuarios.model import Permiso, Rol, Usuario  # noqa: F401
