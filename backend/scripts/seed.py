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
from app.core.seguridad import hashear_password
from app.modulos.tablero.model import Columna, Configuracion, Etiqueta
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
}

TRABAJO = ["pedido.ver", "pedido.editar", "tarjeta.mover", "chat.escribir", "adjunto.subir", "notificacion.pedidos_nuevos"]

ROLES = {
    "admin": ("Administrador", "Ve y controla todo", "#FFB547", list(PERMISOS)),
    "comercial": ("Comercial", "Crea los pedidos y hace seguimiento", "#3FD1A5",
                  ["pedido.crear", "pedido.ver", "chat.escribir", "adjunto.subir"]),
    "dibujante": ("Dibujante", "Dibuja las piezas del pedido", "#7C8CFF", TRABAJO),
    "tecnico": ("Técnico", "Revisa y valida la parte tecnica", "#FF7AA8", TRABAJO),
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
    "correo.eventos": ("pedido.creado,pedido.movido,pedido.asignado,pedido.completado,chat.mencion",
                       "Eventos que ademas de la campanita mandan correo (separados por coma)"),
    "tablero.dias_visibles_terminados": ("30", "Dias que un pedido terminado sigue visible en el tablero"),
}

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

        db.flush()
        creados = []
        for usuario, nombre, rol, personaje in USUARIOS_DEMO:
            if db.scalar(select(Usuario.id).where(Usuario.usuario == usuario)):
                continue
            clave = clave_temporal()
            db.add(Usuario(usuario=usuario, nombre=nombre, rol_id=roles[rol].id, personaje=personaje,
                           correo=f"{usuario}@demo.agp.local",  # dominio falso a proposito
                           password_hash=hashear_password(clave), debe_cambiar_password=True))
            creados.append((usuario, clave))

        db.commit()

    print("Seed listo.")
    if creados:
        print("\nUsuarios creados (anota las claves, NO se vuelven a mostrar):")
        for usuario, clave in creados:
            print(f"  {usuario:<16} {clave}")


if __name__ == "__main__":
    main()
