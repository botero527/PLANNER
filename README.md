# AGP Planner

Tablero tipo Microsoft Planner hecho a la medida de AGP: el **comercial** crea el pedido de un vehículo con sus piezas y archivos, y **dibujo**, **técnica** y **admin** lo van moviendo por columnas, conversan en un chat por pedido y reciben avisos en la app y por correo.

> Es un **borrador**: columnas, roles, campos y flujo pueden cambiar. Casi todo se configura desde la app o la base, sin tocar código.

## Qué hace hoy

| | |
|---|---|
| **Login propio** | Usuario y contraseña (hash bcrypt), la primera vez obliga a cambiarla, bloqueo tras 5 intentos fallidos |
| **4 roles con permisos en BD** | admin, comercial, dibujante, técnico; qué puede cada uno vive en `PLN.ROLES_PERMISOS` |
| **Formulario del comercial** | Vehículo, modelo, año, VIN validado, cliente, piezas, prioridad, fecha y archivos, con vista previa en vivo |
| **Tablero kanban** | Arrastrar tarjetas, filtros, límite por columna (WIP), portada con la primera imagen |
| **Detalle del pedido** | Datos editables con control de versiones, responsables, checklist, historial |
| **Chat estilo Teams** | Respuestas, @menciones con autocompletado, "está escribiendo…", archivos, editar/borrar |
| **Tiempo real** | WebSocket: todos ven los movimientos y mensajes al instante, y quién está en línea |
| **Notificaciones** | Campanita en la app + cola de correos (simulados como `.eml` hasta que TI habilite Graph) |
| **Archivos** | Azure Blob `saagpingenieria/planner-adjuntos`, privado, con links firmados que vencen |
| **Personajes** | Vidrito, Vendi, Trazos, Tuerca y La Jefa: SVG animados, uno por rol |

## Estructura

```
planner/
├── backend/            FastAPI + SQLAlchemy + SQL Server (schema PLN)
│   ├── app/
│   │   ├── core/       config, conexión, seguridad, permisos, eventos
│   │   └── modulos/    un dominio por carpeta: auth, usuarios, tablero,
│   │                   pedidos, chat, adjuntos, notificaciones, tiempo_real
│   ├── migraciones/    Alembic (versiones de la base)
│   ├── scripts/        seed.py (datos base), limpiar_pruebas.py
│   └── tests/          prueba de punta a punta contra Azure real
├── frontend/           React 19 + Vite + TypeScript
│   └── src/
│       ├── api/        cliente fetch, endpoints, tipos, WebSocket
│       ├── componentes/  Shell, personajes, avatar, panel, campana…
│       ├── paginas/    login, mis pedidos, nuevo pedido, tablero, detalle, admin
│       └── estilos/    tokens de diseño "Prisma" + base
└── docs/               arquitectura, base de datos, correos Outlook
```

## Arrancar en local

**Requisitos:** Python 3.12, Node 22+, ODBC Driver 18 for SQL Server, y estar en la red/VPN que llega a Azure.

```bash
# 1. Backend
cd backend
py -3.12 -m venv .venv
.venv\Scripts\pip install -r requirements.txt -r requirements-dev.txt
copy .env.example .env               # y llenar los valores
.venv\Scripts\alembic upgrade head   # crea/actualiza las tablas PLN
.venv\Scripts\python -m scripts.seed # roles, permisos, columnas, usuarios demo
.venv\Scripts\uvicorn app.main:app --port 8010 --reload

# 2. Frontend (otra terminal)
cd frontend
npm install
npm run dev                          # http://localhost:5190
```

La API documentada (Swagger) queda en http://localhost:8010/docs.

## Comandos útiles

| Comando | Para qué |
|---|---|
| `alembic revision --autogenerate -m "que cambio"` | Después de tocar un `model.py`, genera la migración. **Revisarla antes de correrla** |
| `alembic upgrade head` | Aplica las migraciones pendientes |
| `python -m pytest` | Prueba de punta a punta (crea y limpia sus propios datos `zz_test_*`) |
| `python -m scripts.limpiar_pruebas` | Borra todo lo de usuarios `zz_*` si una prueba se cortó |
| `npm run build` | Chequeo de tipos + build de producción |

## Documentación

- [docs/arquitectura.md](docs/arquitectura.md): cómo encajan las piezas y por qué
- [docs/base-de-datos.md](docs/base-de-datos.md): las 17 tablas y para qué es cada una
- [docs/correos-outlook.md](docs/correos-outlook.md): cómo activar los correos reales con TI
