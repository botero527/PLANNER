"""
El HTML de los correos.

Outlook de escritorio pinta el HTML con el motor de Word (si, de Word), asi
que aca nada de flexbox ni CSS moderno: tablas y estilos en linea. Es feo de
escribir pero es lo unico que se ve igual en Outlook, OWA y el celular.
"""
from html import escape

from app.core.config import get_settings
from app.modulos.pedidos.model import Pedido
from app.modulos.usuarios.model import Usuario

settings = get_settings()

# franja de arriba: cielo AGP, salvo que el equipo marque prioridad alta/urgente
COLOR_PRIORIDAD = {"baja": "#7ECEE0", "media": "#7ECEE0", "alta": "#F0A04B", "urgente": "#E5566E"}


def correo_evento(*, pedido: Pedido, actor: Usuario, titulo: str, cuerpo: str | None, para: Usuario) -> tuple[str, str]:
    asunto = f"[{pedido.codigo}] {titulo}"
    link = f"{settings.frontend_url}/tablero?pedido={pedido.id}"
    color = COLOR_PRIORIDAD.get(pedido.prioridad, "#7ECEE0")
    vehiculo = " · ".join(escape(str(x)) for x in (pedido.marca, pedido.modelo, pedido.version_vehiculo, pedido.anio) if x)
    extra = f"Mercado {escape(pedido.mercado)} · Vidrio {'3D' if pedido.tipo_vidrio == '3d' else 'original'}"
    piezas = "".join(
        f'<tr><td style="padding:4px 0;color:#3B4262;font-size:14px;">• '
        f'{"<b>" + escape(p.codigo) + "</b> " if p.codigo else ""}{escape(p.nombre)}</td></tr>'
        for p in pedido.piezas[:8]
    )
    mas_piezas = len(pedido.piezas) - 8
    if mas_piezas > 0:
        piezas += f'<tr><td style="color:#8A90AD;font-size:13px;">y {mas_piezas} más…</td></tr>'
    detalle = f'<p style="margin:0 0 16px;color:#3B4262;font-size:15px;line-height:22px;">{escape(cuerpo)}</p>' if cuerpo else ""

    html = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F1F4F6;font-family:Segoe UI,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F4F6;padding:24px 0;">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;">
    <tr><td style="background:#2B2D31;padding:20px 28px;">
      <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:.3px;">AGP&nbsp;Planner</span>
      <span style="color:#7ECEE0;font-size:13px;float:right;line-height:26px;">{escape(pedido.codigo)}</span>
    </td></tr>
    <tr><td style="height:4px;background:{color};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:28px;">
      <p style="margin:0 0 6px;color:#8A90AD;font-size:13px;">Hola {escape(para.nombre.split()[0])},</p>
      <h1 style="margin:0 0 16px;color:#2B2D31;font-size:22px;line-height:28px;">{escape(titulo)}</h1>
      {detalle}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7F8;border-radius:12px;">
        <tr><td style="padding:16px 18px;">
          <p style="margin:0 0 4px;color:#8A90AD;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Vehículo</p>
          <p style="margin:0 0 12px;color:#2B2D31;font-size:16px;font-weight:600;">{vehiculo}</p>
          <p style="margin:0 0 8px;color:#3B4262;font-size:13px;">{extra}</p>
          {"<p style='margin:0 0 12px;color:#3B4262;font-size:13px;font-family:Consolas,monospace;word-break:break-all;'>VIN " + escape(pedido.vin[:200]) + "</p>" if pedido.vin else ""}
          <table role="presentation" cellpadding="0" cellspacing="0">{piezas}</table>
        </td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
        <tr><td style="background:#3E97B5;border-radius:10px;">
          <a href="{link}" style="display:inline-block;padding:12px 26px;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;">Ver el pedido →</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0;color:#8A90AD;font-size:12px;">Lo hizo {escape(actor.nombre)} en AGP Planner.</p>
    </td></tr>
  </table>
  <p style="color:#A3A8C3;font-size:11px;margin:16px 0 0;">Te llegó porque participas en este pedido. Puedes apagar los correos en tu perfil.</p>
</td></tr>
</table>
</body></html>"""
    return asunto, html
