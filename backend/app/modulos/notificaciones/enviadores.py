"""
Quien manda los correos de verdad. Hay dos y se escoge con PLN_CORREO_MODO:

- simulado: guarda cada correo como .eml en backend/correos_simulados/.
  Doble clic en el .eml y Outlook lo abre tal cual como le llegaria a la persona.
- graph: lo manda por Microsoft Graph. Necesita que TI registre la app en
  Azure AD con el permiso Mail.Send y cree el buzon remitente.

Los dos cumplen el mismo "contrato" (la clase Enviador), entonces el worker
no sabe ni le importa cual esta usando.
"""
import logging
import re
from datetime import datetime
from email.message import EmailMessage
from email.utils import formatdate
from pathlib import Path
from typing import Protocol

import httpx
import msal

from app.core.config import RAIZ_BACKEND, get_settings

log = logging.getLogger("planner.correo")
settings = get_settings()


class Enviador(Protocol):
    def enviar(self, para: str, asunto: str, html: str) -> None: ...


class EnviadorSimulado:
    def __init__(self, carpeta: Path = RAIZ_BACKEND / "correos_simulados") -> None:
        self.carpeta = carpeta
        self.carpeta.mkdir(exist_ok=True)

    def enviar(self, para: str, asunto: str, html: str) -> None:
        msg = EmailMessage()
        msg["From"] = settings.correo_remitente
        msg["To"] = para
        msg["Subject"] = asunto
        msg["Date"] = formatdate(localtime=True)
        msg["X-Unsent"] = "1"  # hace que Outlook lo abra como borrador listo para ver
        msg.set_content("Este correo necesita un cliente que muestre HTML.")
        msg.add_alternative(html, subtype="html")

        nombre = re.sub(r"[^\w\-]+", "_", f"{para}_{asunto}")[:120]
        archivo = self.carpeta / f"{datetime.now():%Y%m%d_%H%M%S_%f}_{nombre}.eml"
        archivo.write_bytes(bytes(msg))
        log.info("correo simulado -> %s (%s)", para, archivo.name)


class EnviadorGraph:
    """POST /users/{remitente}/sendMail con credenciales de aplicacion (client credentials).
    No hay usuario logueado: la app se autentica con su propio secreto."""

    ALCANCE = ["https://graph.microsoft.com/.default"]

    def __init__(self) -> None:
        if not (settings.graph_tenant_id and settings.graph_client_id and settings.graph_client_secret):
            raise RuntimeError("PLN_CORREO_MODO=graph pero faltan PLN_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET")
        self._app = msal.ConfidentialClientApplication(
            settings.graph_client_id,
            authority=f"https://login.microsoftonline.com/{settings.graph_tenant_id}",
            client_credential=settings.graph_client_secret,
        )

    def _token(self) -> str:
        # msal guarda el token en cache y solo pide uno nuevo cuando se vence
        resultado = self._app.acquire_token_for_client(scopes=self.ALCANCE)
        if "access_token" not in resultado:
            raise RuntimeError(f"Graph no dio token: {resultado.get('error_description', resultado)}")
        return resultado["access_token"]

    def enviar(self, para: str, asunto: str, html: str) -> None:
        respuesta = httpx.post(
            f"https://graph.microsoft.com/v1.0/users/{settings.correo_remitente}/sendMail",
            headers={"Authorization": f"Bearer {self._token()}"},
            json={
                "message": {
                    "subject": asunto,
                    "body": {"contentType": "HTML", "content": html},
                    "toRecipients": [{"emailAddress": {"address": para}}],
                },
                "saveToSentItems": False,
            },
            timeout=30,
        )
        if respuesta.status_code != 202:
            raise RuntimeError(f"Graph respondio {respuesta.status_code}: {respuesta.text[:300]}")


def crear_enviador() -> Enviador:
    if settings.correo_modo == "graph":
        return EnviadorGraph()
    return EnviadorSimulado()
