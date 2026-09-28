"""
Toda la configuracion del backend sale de aca.

La idea es que ningun otro archivo lea variables de entorno directamente:
si algo se puede configurar, se agrega en esta clase y listo. Asi cuando uno
quiere saber "que se puede cambiar sin tocar codigo" solo mira este archivo.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ_BACKEND = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=RAIZ_BACKEND / ".env",
        env_prefix="PLN_",
        extra="ignore",
    )

    # Base de datos (Azure SQL de Ingenieria, todo lo nuestro vive en el schema PLN)
    db_server: str
    db_name: str
    db_user: str
    db_password: str
    db_driver: str = "ODBC Driver 18 for SQL Server"
    db_schema: str = "PLN"

    # Sesion
    jwt_secret: str
    jwt_horas: int = 12
    login_intentos_max: int = 5
    login_bloqueo_minutos: int = 5

    # Adjuntos en Azure Blob
    azure_storage_connection_string: str = ""
    azure_storage_container: str = "planner-adjuntos"
    adjunto_max_mb: int = 25
    adjunto_link_minutos: int = 30
    adjunto_extensiones: str = (
        "jpg,jpeg,png,gif,webp,bmp,pdf,dwg,dxf,step,stp,igs,iges,3dm,"
        "xlsx,xls,csv,docx,doc,pptx,txt,zip,rar,7z"
    )

    frontend_url: str = "http://localhost:5190"
    cors_origenes: str = "http://localhost:5190"

    # Correos: "simulado" deja un .eml en disco, "graph" lo manda por Microsoft Graph
    correo_modo: str = "simulado"
    correo_remitente: str = "planner@agpglass.com"
    correo_intervalo_segundos: int = 10
    correo_intentos_max: int = 5
    graph_tenant_id: str = ""
    graph_client_id: str = ""
    graph_client_secret: str = ""

    @property
    def odbc(self) -> str:
        return (
            f"DRIVER={{{self.db_driver}}};SERVER={self.db_server};DATABASE={self.db_name};"
            f"UID={self.db_user};PWD={self.db_password};"
            "Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30"
        )

    @property
    def extensiones_permitidas(self) -> set[str]:
        return {e.strip().lower() for e in self.adjunto_extensiones.split(",") if e.strip()}

    @property
    def lista_cors(self) -> list[str]:
        return [o.strip() for o in self.cors_origenes.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
