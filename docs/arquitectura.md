# Arquitectura

## El recorrido de un pedido

```
 Comercial                 Backend (FastAPI)                     Base (Azure SQL, schema PLN)
 ─────────                 ─────────────────                     ────────────────────────────
 llena el formulario ──►  POST /api/pedidos
                           ├─ valida (Pydantic: VIN, año, piezas)
                           ├─ saca consecutivo de SEQ_PEDIDOS ───► PED-2026-0001
                           ├─ guarda pedido + piezas ────────────► PEDIDOS, PEDIDO_PIEZAS
                           └─ registrar_evento()
                               ├─ HISTORIAL ─────────────────────► bitácora
                               ├─ NOTIFICACIONES ────────────────► campanita de cada interesado
                               └─ COLA_CORREOS ──────────────────► correos pendientes
                           COMMIT  (todo o nada)
                               └─ después del commit: aviso por WebSocket a todos
 sube archivos ─────────► POST /api/pedidos/{id}/adjuntos ──────► Azure Blob + ADJUNTOS

 Dibujante arrastra ────► POST /api/pedidos/{id}/mover ─────────► posición nueva + evento
 Todos los navegadores ◄── WebSocket "tablero.movido" (se refrescan solos)

 Cartero (hilo aparte) ── cada 10 s lee COLA_CORREOS ──► .eml simulado / Microsoft Graph
```

## Decisiones y por qué

**Schema propio `PLN`.** La base `AGP_Ingenieria` la comparten Gestión de Cambios (`GMB`), Herramentales (`HTA`), `AUTOMATA` y otros. El schema evita choques de nombres, y Alembic está configurado para **solo** mirar `PLN` y guardar su versión en `PLN.alembic_version` (la de `dbo` es de Herramentales).

**Router delgado, service gordo.** Los `router.py` solo reciben, revisan permisos y responden. Las reglas (quién edita, cómo se ordena, qué se notifica) están en `service.py`. Así una regla se cambia en un solo sitio.

**Permisos en base de datos.** El código pregunta `usuario.puede("tarjeta.mover")`; qué rol tiene qué permiso se cambia en `PLN.ROLES_PERMISOS` sin desplegar. El backend siempre valida: esconder un botón en el frontend no es seguridad.

**Patrón outbox para correos.** El correo no se manda en la petición: se guarda en `COLA_CORREOS` en la misma transacción del cambio y el *cartero* lo envía después, con reintentos y backoff (1, 2, 4, 8 min). Si Outlook está caído el tablero sigue funcionando y ningún correo se pierde.

**Eventos en vivo después del commit.** Los endpoints solo *anotan* el evento (`anotar_evento`) y un listener de SQLAlchemy lo publica cuando la base confirma el commit. Si hay rollback, el evento se bota. Nadie ve una tarjeta movida que nunca se movió.

**Posiciones con huecos (1024, 2048…).** Meter una tarjeta entre dos es sacar el promedio y actualizar una sola fila. Solo cuando se agota el hueco se renumera la columna.

**Control de concurrencia optimista.** `PEDIDOS.version` sube en cada cambio. Si dos personas editan a la vez, la segunda recibe `409` en vez de pisar al primero sin darse cuenta.

**Fechas en UTC.** La base guarda UTC; la API las manda con `Z` (`FechaUTC`) y el navegador las muestra en hora Colombia.

**Contraseñas en texto plano (decisión del equipo).** Se guardan tal cual en `PLN.USUARIOS.password` para que el admin las pueda consultar. Riesgo aceptado: quien lea esa tabla ve todas las claves. Volver a hash es cambiar `guardar_password` y `verificar_password` en `core/seguridad.py` (el login ya acepta hashes bcrypt viejos).

**Pocas consultas por petición.** Desde un PC en Colombia cada consulta a Azure cuesta 100–300 ms, así que se evita el problema N+1: permisos con JOIN en una consulta, conteos del tablero en una sola consulta agrupada, `selectin` para las relaciones. En producción (backend en Azure junto a la base) la latencia es ~1 ms.

**Caché de configuración y catálogo.** `core/cache.py` guarda en memoria (30 s la configuración, 5 min el catálogo de piezas) lo que casi nunca cambia y se leía en cada petición. Al guardar configuración desde la app se invalida al instante.

**Chat optimista.** El mensaje se pinta al instante con un id temporal y se confirma cuando responde el servidor. El que llega por WebSocket se inserta directo en la caché (`api/cacheLocal.ts`), sin volver a pedir la lista ni el tablero. Los envíos de un mismo chat van en fila (`scope` de React Query) para no llegar en desorden, y los refrescos que sí hacen falta van agrupados (*debounce*).

**Reintentos de conexión.** Azure SQL a veces corta conexiones nuevas (error 10054). `core/db.py` reintenta hasta 4 veces con espera creciente, como recomienda Microsoft para errores transitorios.

## Frontend

- **React Query** guarda los datos del servidor. Cuando llega un evento por WebSocket no se parchan datos a mano: se invalida la consulta y se vuelve a pedir, así la pantalla nunca queda desincronizada.
- **dnd-kit** para arrastrar. Durante el arrastre hay un orden local optimista; al soltar se llama al backend, y si falla (por ejemplo, columna llena) se refresca y la tarjeta vuelve sola.
- **Sistema de diseño "Prisma"** (`estilos/tokens.css`): vidrio sobre aurora, porque AGP hace vidrio. Todos los colores son variables, con tema oscuro y claro.
- **Personajes** (`componentes/personajes/Personaje.tsx`): SVG dibujado a mano, animado con `motion`. Parpadean, siguen el cursor, se tapan los ojos, celebran y se duermen.

## Límites conocidos (para cuando crezca)

- El hub de WebSocket vive en memoria de **un** proceso. Con varios workers/servidores habría que meter Redis o Azure Web PubSub.
- El freno de intentos de login también es en memoria (se limpia al reiniciar).
- "Mis pedidos" filtra sobre los datos del tablero; con miles de pedidos conviene un endpoint paginado propio.
- Los tests corren contra la base real y gastan números del consecutivo; lo ideal es una base de pruebas aparte.
