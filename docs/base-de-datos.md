# Base de datos

Servidor `agpcolombia.database.windows.net`, base `AGP_Ingenieria`, **schema `PLN`**. Las tablas se crean y cambian **solo** con Alembic (`backend/migraciones/`), nunca a mano en SSMS; si no, el código y la base se desfasan.

## Tablas

### Gente y permisos
| Tabla | Para qué |
|---|---|
| `ROLES` | admin, comercial, dibujante, tecnico (con color para la interfaz) |
| `PERMISOS` | Acciones sueltas: `pedido.crear`, `tarjeta.mover`, `usuario.administrar`… |
| `ROLES_PERMISOS` | Qué puede hacer cada rol. Se cambia aquí sin tocar código |
| `USUARIOS` | Usuario de login, nombre, correo, rol, personaje, clave (texto plano, decisión del equipo), si recibe correos, `version_sesion` (al subirla se cierran todas sus sesiones) |

### El tablero (configurable)
| Tabla | Para qué |
|---|---|
| `COLUMNAS` | Los estados del proceso: orden, color, ícono, límite WIP, cuál es la inicial y cuál la final |
| `ETIQUETAS` | Etiquetas de colores (Urgente, Blindado…) |
| `CONFIGURACION` | Parámetros clave/valor: qué eventos mandan correo, días visibles de los terminados, opciones de **mercado** (`pedido.mercados`) |
| `CATALOGO_PIEZAS` | Códigos de pieza AGP (los de Módulo 5): código, nombre y su **simétrica** (001↔002). Se amplía con filas nuevas |

### El pedido
| Tabla | Para qué |
|---|---|
| `PEDIDOS` | La tarjeta: código `PED-AAAA-NNNN`, marca, modelo, `version_vehiculo`, plataforma, año, VIN (texto libre sin límite), mercado, `tipo_vidrio` (original/3d), `info_en_drive`, prioridad y fecha (solo uso interno), columna, posición, `version` (control de concurrencia), `datos_extra` |
| `SEQ_PEDIDOS` *(secuencia)* | Da el consecutivo sin repetirse aunque dos pedidos entren al mismo tiempo |
| `PEDIDO_PIEZAS` | Las piezas del pedido: código AGP (si es del catálogo), nombre, observación. Si llega el código, el nombre lo pone el backend desde el catálogo |
| `PEDIDO_MIEMBROS` | Quién está asignado o sigue el pedido |
| `PEDIDO_ETIQUETAS` | Qué etiquetas tiene cada pedido |
| `CHECKLIST` | Pasos a chulear dentro del pedido |
| `HISTORIAL` | Bitácora: quién hizo qué y cuándo, con el antes/después en JSON |

### Conversación y archivos
| Tabla | Para qué |
|---|---|
| `MENSAJES` | Chat de cada pedido; respuestas con `respuesta_a_id`; borrado suave |
| `ADJUNTOS` | Datos del archivo (nombre, tipo, tamaño, ruta en el Blob). El archivo vive en Azure Blob `planner-adjuntos/pedidos/<codigo>/…` |

### Avisos
| Tabla | Para qué |
|---|---|
| `NOTIFICACIONES` | La campanita de cada persona (leída / sin leer) |
| `COLA_CORREOS` | Bandeja de salida: pendiente → enviado / error, con intentos y próximo reintento |

## Reglas que cuida la base

- Borrar un pedido de verdad borra en cascada piezas, miembros, checklist, historial, mensajes y adjuntos. En la app nunca se borra de verdad: se marca `eliminado = 1`.
- Los textos que escribe la gente son `NVARCHAR` (tildes y ñ sin problema).
- Todas las fechas en UTC (`sysutcdatetime()`).

## Cambiar una tabla

```bash
# 1. editar el model.py del módulo
# 2. generar la migración
.venv\Scripts\alembic revision --autogenerate -m "agrega campo color_vidrio a piezas"
# 3. ABRIR el archivo generado en migraciones/versions y revisarlo
# 4. aplicarla
.venv\Scripts\alembic upgrade head
```
