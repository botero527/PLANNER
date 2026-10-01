# Correos a Outlook

## Cómo funciona hoy (modo simulado)

Cada evento configurado (pedido nuevo, cambio de columna, asignación, terminado, mención) deja un correo en `PLN.COLA_CORREOS`. El *cartero* (`backend/app/modulos/notificaciones/worker.py`) lo recoge cada 10 s y, en modo `simulado`, lo guarda como `.eml` en `backend/correos_simulados/`. **Doble clic en el `.eml` y Outlook lo abre** tal cual le llegaría a la persona.

Qué eventos mandan correo se escoge en la app: **Configurar → ¿Qué manda correo a Outlook?**

## Opción rápida: Power Automate (sin esperar a TI)

El Planner le pasa cada correo a un flujo de Power Automate de la cuenta `powerapps.ingenieria@agpglass.com`, y el flujo lo envía con su conexión de Outlook.

> El SMTP con usuario y clave de esa cuenta **no sirve**: Office 365 lo rechaza (`535 5.7.3`), porque Microsoft apagó ese tipo de inicio de sesión.

**Requisito:** el disparador *"Cuando se recibe una solicitud HTTP"* es **Premium**. La cuenta necesita licencia Power Automate Premium o Power Apps por usuario.

**El flujo** (*Crear → Flujo de nube instantáneo*, o automatizado en blanco):
1. Disparador **Cuando se recibe una solicitud HTTP**, con este esquema JSON:
   ```json
   { "type": "object", "properties": { "para": { "type": "string" }, "asunto": { "type": "string" }, "html": { "type": "string" } } }
   ```
2. Acción **Office 365 Outlook → Enviar un correo electrónico (V2)**: *Para* = `para`, *Asunto* = `asunto`, *Cuerpo* = `html`.
3. Guardar y copiar la **URL HTTP POST** que aparece en el disparador.

En `backend/.env`:
```env
PLN_CORREO_MODO=powerautomate
PLN_POWER_AUTOMATE_URL=<la URL del disparador>
```
La URL trae una firma (`sig=`) que funciona como contraseña: va **solo** en el `.env`.

Probar: `.venv\Scripts\python -m scripts.probar_correo tu.correo@agpglass.com`

## Opción definitiva: Microsoft Graph (lo que hay que pedirle a TI)

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
