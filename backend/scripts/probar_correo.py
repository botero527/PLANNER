"""
Manda UN correo de prueba con el modo configurado en el .env (PLN_CORREO_MODO),
sin pasar por la cola. Sirve para confirmar que Power Automate / Graph quedaron bien.

    cd backend
    .venv\\Scripts\\python -m scripts.probar_correo tu.correo@agpglass.com
"""
import sys
from datetime import datetime

from app.core.config import get_settings
from app.modulos.notificaciones.enviadores import crear_enviador

HTML = """<div style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#F1F4F6">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
    <div style="background:#2B2D31;color:#fff;padding:18px 24px;font-weight:700">AGP Planner</div>
    <div style="height:4px;background:#7ECEE0"></div>
    <div style="padding:24px;color:#2B2D31">
      <h2 style="margin:0 0 8px">¡Los correos funcionan! ✅</h2>
      <p style="margin:0;color:#4f555b">Si te llegó esto, el Planner ya puede avisarle al equipo por Outlook.</p>
      <p style="margin:16px 0 0;color:#7d858c;font-size:12px">Enviado en modo <b>{modo}</b> · {hora}</p>
    </div>
  </div>
</div>"""


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Uso: python -m scripts.probar_correo destino@agpglass.com")
    modo = get_settings().correo_modo
    enviador = crear_enviador()
    enviador.enviar(sys.argv[1], "Prueba de correo · AGP Planner", HTML.format(modo=modo, hora=f"{datetime.now():%d/%m/%Y %H:%M}"))
    print(f"Listo: correo de prueba enviado a {sys.argv[1]} (modo {modo}). Revisa la bandeja (y la de no deseados).")


if __name__ == "__main__":
    main()
