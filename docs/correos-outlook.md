# Correos a Outlook

## Cómo funciona hoy (modo simulado)

Cada evento configurado (pedido nuevo, cambio de columna, asignación, terminado, mención) deja un correo en `PLN.COLA_CORREOS`. El *cartero* (`backend/app/modulos/notificaciones/worker.py`) lo recoge cada 10 s y, en modo `simulado`, lo guarda como `.eml` en `backend/correos_simulados/`. **Doble clic en el `.eml` y Outlook lo abre** tal cual le llegaría a la persona.

Qué eventos mandan correo se escoge en la app: **Configurar → ¿Qué manda correo a Outlook?**

## Activar los correos reales (lo que hay que pedirle a TI)

Se usa **Microsoft Graph** (`POST /users/{remitente}/sendMail`). No se usa SMTP con usuario y clave porque Microsoft está apagando esa autenticación básica en Exchange Online.

Pedido para TI:

1. **Buzón remitente**: crear un buzón compartido, p. ej. `planner@agpglass.com` (los compartidos no necesitan licencia).
2. **App Registration** en Azure AD (tenant `agpglass.com`), nombre sugerido "AGP Planner - Correos":
   - Permiso de **aplicación** (no delegado): `Microsoft Graph → Mail.Send`, con *consentimiento de administrador*.
   - Crear un **client secret** y pasarnos: Tenant ID, Client ID y el secreto.
3. **Restringir la app a ese buzón** (importante: sin esto, `Mail.Send` de aplicación puede enviar como *cualquier* buzón de la empresa). En Exchange Online, con una *Application Access Policy* o RBAC para aplicaciones, limitada a `planner@agpglass.com`.

Con eso, en `backend/.env`:

```env
PLN_CORREO_MODO=graph
PLN_CORREO_REMITENTE=planner@agpglass.com
PLN_GRAPH_TENANT_ID=...
PLN_GRAPH_CLIENT_ID=...
PLN_GRAPH_CLIENT_SECRET=...
```

y reiniciar el backend. No hay que cambiar código: `enviadores.py` escoge el enviador según `PLN_CORREO_MODO`.

## Si un correo falla

Se reintenta a los 1, 2, 4 y 8 minutos. Después del 5º intento queda en `estado = 'error'` con el motivo en `ultimo_error`:

```sql
SELECT id, para, asunto, intentos, ultimo_error FROM PLN.COLA_CORREOS WHERE estado = 'error';
-- para reintentarlos:
UPDATE PLN.COLA_CORREOS SET estado = 'pendiente', intentos = 0, proximo_intento_en = SYSUTCDATETIME() WHERE estado = 'error';
```
