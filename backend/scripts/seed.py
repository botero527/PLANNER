"""
Deja la base con lo minimo para arrancar: roles, permisos, columnas, etiquetas,
configuracion y usuarios de prueba.

Se puede correr las veces que sea: si algo ya existe no lo duplica
(eso se llama que el script es "idempotente").

    cd backend
    .venv\\Scripts\\python -m scripts.seed
"""
import secrets
import string

from sqlalchemy import select

import app.modelos  # noqa: F401
from app.core.db import SesionLocal
from app.core.seguridad import guardar_password
from app.modulos.tablero.model import CatalogoPieza, Columna, Configuracion, Etiqueta
from app.modulos.usuarios.model import Permiso, Rol, Usuario

PERMISOS = {
    "pedido.crear": "Crear pedidos nuevos desde el formulario",
    "pedido.ver": "Ver el tablero y el detalle de los pedidos",
    "pedido.editar": "Editar cualquier pedido, asignar gente y manejar la checklist",
    "pedido.eliminar": "Eliminar pedidos y archivos de otros",
    "tarjeta.mover": "Arrastrar tarjetas entre columnas",
    "chat.escribir": "Escribir en el chat de los pedidos",
    "adjunto.subir": "Subir imagenes y archivos",
    "usuario.administrar": "Crear usuarios, cambiar roles y resetear contraseñas",
    "tablero.configurar": "Cambiar columnas, etiquetas y parametros",
    "notificacion.pedidos_nuevos": "Recibir aviso de cada pedido nuevo",
    "ingreso.gestionar": "Marcar el código de vehículo creado y aprobar el ingreso del pedido",
}

TRABAJO = ["pedido.ver", "pedido.editar", "tarjeta.mover", "chat.escribir", "adjunto.subir", "notificacion.pedidos_nuevos"]

ROLES = {
    "admin": ("Administrador", "Ve y controla todo", "#FFB547", list(PERMISOS)),
    "comercial": ("Comercial", "Crea los pedidos y hace seguimiento", "#3FD1A5",
                  ["pedido.crear", "pedido.ver", "chat.escribir", "adjunto.subir"]),
    "dibujante": ("Dibujante", "Dibuja las piezas del pedido", "#7C8CFF", TRABAJO),
    "tecnico": ("Técnico", "Revisa y valida la parte tecnica", "#FF7AA8", TRABAJO + ["ingreso.gestionar"]),
}

# Borrador de 5 estados. Se cambian desde la app (admin) sin tocar codigo.
COLUMNAS = [
    ("Nuevos", "Recién llegados de comercial", "#5B8CFF", "inbox", True, False),
    ("En dibujo", "El dibujante está trabajando las piezas", "#9B6BFF", "pencil", False, False),
    ("Revisión técnica", "El técnico valida medidas y viabilidad", "#FF9F43", "wrench", False, False),
    ("Ajustes", "Volvió con correcciones", "#FF5C8A", "refresh", False, False),
    ("Listos", "Terminado y entregado", "#2FCB8B", "check", False, True),
]

ETIQUETAS = [
    ("Blindado", "#6B7CFF"), ("Cliente nuevo", "#2FCB8B"),
    ("Muestra", "#FFB547"), ("Repetición", "#38BDF8"),
]

CONFIG = {
    "correo.eventos": ("pedido.creado,pedido.movido,pedido.asignado,pedido.completado,chat.mencion,"
                       "ingreso.codigo_creado,ingreso.pedido_ingresado,ingreso.aprobado",
                       "Eventos que ademas de la campanita mandan correo (separados por coma)"),
    "tablero.dias_visibles_terminados": ("30", "Dias que un pedido terminado sigue visible en el tablero"),
    "pedido.mercados": ("México,LATAM,Europa,Asia,USA", "Opciones del desplegable Mercado del formulario (separadas por coma)"),
}

# Catalogo de piezas AGP, copiado de MODULO_5/app.py (PIEZAS y _PARES_SIMETRIA).
# Ojo: en Modulo 5 el 085 "Posterior Secundario" queda pisado por el for de
# "Vidrio Especial Laminado" (80-86). Aca gana el nombre explicito.
PIEZAS_AGP = {
    "000": "Parabrisas",
    "001": "Lateral Delantero Izquierdo", "002": "Lateral Delantero Derecho",
    "003": "Lateral Trasero Izquierdo", "004": "Lateral Trasero Derecho",
    "005": "Ventilete Trasero Izquierdo", "006": "Ventilete Trasero Derecho",
    "007": "Cabina Trasera Izquierda", "008": "Cabina Trasera Derecha",
    "009": "Posterior", "010": "Techo Solar Delantero",
    "011": "Lateral Extendido Izquierdo", "012": "Lateral Extendido Derecho",
    "013": "Posterior Izquierdo", "014": "Posterior Derecho",
    "015": "Claraboya Izquierda", "016": "Claraboya Derecha",
    "017": "Mirilla", "018": "Probeta",
    "019": "Ventilete Delantero Izquierdo", "020": "Ventilete Delantero Derecho",
    "021": "Cabina Delantera Izquierda", "022": "Cabina Delantera Derecha",
    "023": "Cabina Superior Izquierda", "024": "Cabina Superior Derecha",
    "025": "Techo Solar B", "026": "Parabrisas Derecho", "027": "Parabrisas Izquierdo",
    "028": "Lateral Secundario Derecho", "029": "Lateral Secundario Izquierdo",
    "030": "Partición", "031": "Arquitectura",
    "034": "Porthole 1", "035": "Porthole 2", "036": "Porthole 3", "037": "Porthole 4",
    "040": "Pummel", "087": "Techo Solar Céntrico", "088": "Techo Solar D",
    "090": "Techo Solar Panorámico", "091": "Probeta 2", "092": "Probeta 3",
    "093": "Probeta Especial", "094": "Probeta 4", "095": "Kit Opaco", "096": "Probeta 5",
    "097": "Probeta 6", "110": "Techo Solar A — Paquete", "125": "Techo Solar B — Paquete",
    "187": "Techo Solar C — Paquete", "190": "Techo Solar Panorámico — Paquete",
}
for _i in range(1, 20):
    PIEZAS_AGP[f"{40 + _i:03d}"] = f"Pieza Especial {_i}"
for _i in range(1, 11):
    PIEZAS_AGP[f"{59 + _i:03d}"] = f"Vidrio Especial {_i}"
for _i, _n in enumerate([25, 26, 27, 28], 70):
    PIEZAS_AGP[f"{_i:03d}"] = f"Pieza Plana Especial {_n}"
for _i in range(80, 87):
    PIEZAS_AGP.setdefault(f"{_i:03d}", "Vidrio Especial Laminado")
PIEZAS_AGP["085"] = "Posterior Secundario"

# izquierda <-> derecha
PARES_SIMETRIA = [("001", "002"), ("003", "004"), ("005", "006"), ("007", "008"), ("011", "012"), ("013", "014"),
                  ("015", "016"), ("019", "020"), ("021", "022"), ("023", "024"), ("026", "027"), ("028", "029")]

# Usuarios de prueba (uno por rol). Clave temporal random: se imprime una sola vez
USUARIOS_DEMO = [
    ("admin", "Administrador AGP", "admin", "jefa"),
    ("comercial.demo", "Camila Comercial", "comercial", "vendedora"),
    ("dibujante.demo", "Diego Dibujante", "dibujante", "trazos"),
    ("tecnico.demo", "Tomás Técnico", "tecnico", "tuerca"),
]


def clave_temporal() -> str:
    alfabeto = string.ascii_letters + string.digits
    return "".join(secrets.choice(alfabeto) for _ in range(10))


def main() -> None:
    with SesionLocal() as db:
        permisos = {p.codigo: p for p in db.scalars(select(Permiso))}
        for codigo, desc in PERMISOS.items():
            if codigo not in permisos:
                permisos[codigo] = Permiso(codigo=codigo, descripcion=desc)
                db.add(permisos[codigo])

        roles = {r.codigo: r for r in db.scalars(select(Rol))}
        for codigo, (nombre, desc, color, lista) in ROLES.items():
            if codigo not in roles:
                roles[codigo] = Rol(codigo=codigo, nombre=nombre, descripcion=desc, color=color,
                                    permisos=[permisos[p] for p in lista])
                db.add(roles[codigo])
            elif codigo == "admin":
                # al admin siempre se le suman los permisos nuevos que aparezcan
                faltan = [permisos[p] for p in PERMISOS if permisos[p] not in roles[codigo].permisos]
                roles[codigo].permisos.extend(faltan)

        if not db.scalar(select(Columna.id).limit(1)):
            for i, (nombre, desc, color, icono, inicial, final) in enumerate(COLUMNAS, start=1):
                db.add(Columna(nombre=nombre, descripcion=desc, orden=i, color=color, icono=icono,
                               es_inicial=inicial, es_final=final))

        existentes = set(db.scalars(select(Etiqueta.nombre)))
        for nombre, color in ETIQUETAS:
            if nombre not in existentes:
                db.add(Etiqueta(nombre=nombre, color=color))

        for clave, (valor, desc) in CONFIG.items():
            if not db.get(Configuracion, clave):
                db.add(Configuracion(clave=clave, valor=valor, descripcion=desc))

        simetrica = {a: b for a, b in PARES_SIMETRIA} | {b: a for a, b in PARES_SIMETRIA}
        existentes_piezas = set(db.scalars(select(CatalogoPieza.codigo)))
        for codigo, nombre in sorted(PIEZAS_AGP.items()):
            if codigo not in existentes_piezas:
                db.add(CatalogoPieza(codigo=codigo, nombre=nombre, simetrica=simetrica.get(codigo)))

        db.flush()
        creados = []
        for usuario, nombre, rol, personaje in USUARIOS_DEMO:
            if db.scalar(select(Usuario.id).where(Usuario.usuario == usuario)):
                continue
            clave = clave_temporal()
            db.add(Usuario(usuario=usuario, nombre=nombre, rol_id=roles[rol].id, personaje=personaje,
                           correo=f"{usuario}@planner.invalid",  # .invalid: el cartero nunca le manda nada
                           password=guardar_password(clave), debe_cambiar_password=True))
            creados.append((usuario, clave))

        db.commit()

    print("Seed listo.")
    if creados:
        print("\nUsuarios creados (anota las claves, NO se vuelven a mostrar):")
        for usuario, clave in creados:
            print(f"  {usuario:<16} {clave}")


if __name__ == "__main__":
    main()
