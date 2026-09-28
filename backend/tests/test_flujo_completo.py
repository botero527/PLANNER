"""
Prueba de punta a punta contra la base real (AGP_Ingenieria, schema PLN) y el Blob real.

Crea usuarios temporales zz_test_*, hace el flujo completo y al final borra
TODO lo que creo (pedidos, correos, notificaciones, archivos en el Blob y usuarios).

    cd backend
    .venv\\Scripts\\python -m pytest -v
"""
import io
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import app.modelos  # noqa: F401
from app.core.db import SesionLocal
from app.core.seguridad import hashear_password
from app.main import app
from app.modulos.notificaciones.model import CorreoCola
from app.modulos.notificaciones.worker import procesar_lote
from app.modulos.tablero.model import Columna
from app.modulos.usuarios.model import Rol, Usuario
from scripts.limpiar_pruebas import limpiar

CLAVE = "Prueba12345"
PREFIJO = "zz_test_"


class EnviadorDePrueba:
    def __init__(self):
        self.enviados: list[tuple[str, str]] = []

    def enviar(self, para, asunto, html):
        self.enviados.append((para, asunto))


@pytest.fixture(scope="module")
def usuarios():
    # limpiamos ANTES tambien: si una corrida anterior se corto, no deja basura que rompa esta
    limpiar(PREFIJO)
    with SesionLocal() as db:
        roles = {r.codigo: r.id for r in db.scalars(select(Rol))}
        creados = {}
        for rol in ("comercial", "dibujante", "tecnico"):
            u = Usuario(usuario=f"{PREFIJO}{rol}", nombre=f"Test {rol.title()}", rol_id=roles[rol],
                        correo=f"{PREFIJO}{rol}@demo.agp.local", password_hash=hashear_password(CLAVE),
                        debe_cambiar_password=False, personaje="vidrito")
            db.add(u)
            creados[rol] = u
        db.commit()
        ids = {k: v.id for k, v in creados.items()}
    yield ids
    limpiar(PREFIJO)


@pytest.fixture(scope="module")
def cliente():
    with TestClient(app) as c:
        yield c


def entrar(cliente, rol) -> dict:
    r = cliente.post("/api/auth/login", json={"usuario": f"{PREFIJO}{rol}", "password": CLAVE})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_login_malo_no_dice_si_el_usuario_existe(cliente, usuarios):
    r1 = cliente.post("/api/auth/login", json={"usuario": f"{PREFIJO}comercial", "password": "mala"})
    r2 = cliente.post("/api/auth/login", json={"usuario": "no_existe_nadie", "password": "mala"})
    assert r1.status_code == r2.status_code == 401
    assert r1.json()["detail"] == r2.json()["detail"]


def test_sin_token_no_entra(cliente):
    assert cliente.get("/api/tablero").status_code == 401


def test_flujo_completo(cliente, usuarios):
    com, dib, tec = (entrar(cliente, r) for r in ("comercial", "dibujante", "tecnico"))

    # 1. el comercial crea el pedido
    r = cliente.post("/api/pedidos", headers=com, json={
        "vehiculo": "  Toyota   Hilux ", "modelo": "SRV", "anio": 2025, "vin": "8ajba3fs0r0123456",
        "prioridad": "alta", "piezas": [{"nombre": "Parabrisas", "cantidad": 1}, {"nombre": "Puerta DI", "cantidad": 2}],
        "asignados": [usuarios["dibujante"]],
    })
    assert r.status_code == 201, r.text
    pedido = r.json()
    assert pedido["codigo"].startswith("PED-")
    assert pedido["vehiculo"] == "Toyota Hilux"          # limpia espacios de mas
    assert pedido["vin"] == "8AJBA3FS0R0123456"           # VIN en mayuscula
    assert pedido["total_piezas"] == 3
    assert pedido["creado_en"].endswith("Z")              # fecha sale en UTC
    pid = pedido["id"]

    # VIN invalido (tiene O) se rechaza
    malo = cliente.post("/api/pedidos", headers=com, json={"vehiculo": "X", "vin": "8AJBA3FS0R012345O", "piezas": [{"nombre": "a"}]})
    assert malo.status_code == 422

    # 2. el comercial NO puede mover tarjetas
    with SesionLocal() as db:
        columnas = list(db.scalars(select(Columna).where(Columna.activa).order_by(Columna.orden)))
    assert cliente.post(f"/api/pedidos/{pid}/mover", headers=com, json={"columna_id": columnas[1].id, "indice": 0}).status_code == 403

    # 3. el dibujante lo ve en el tablero y lo mueve, escuchando el websocket
    token_tec = tec["Authorization"].split()[1]
    with cliente.websocket_connect(f"/ws?token={token_tec}") as ws:
        tablero = cliente.get("/api/tablero", headers=dib).json()
        assert any(p["id"] == pid for p in tablero["pedidos"])

        r = cliente.post(f"/api/pedidos/{pid}/mover", headers=dib, json={"columna_id": columnas[1].id, "indice": 0})
        assert r.status_code == 200, r.text
        assert r.json()["columna_id"] == columnas[1].id

        evento = _esperar_evento(ws, "tablero.movido")
        assert evento["pedido_id"] == pid

    # 4. mover NO cuenta como "modificar": la version sigue igual
    actual = cliente.get(f"/api/pedidos/{pid}", headers=dib).json()
    assert actual["version"] == pedido["version"]

    # 5. el comercial ya no puede editar (salio de la primera columna), el dibujante si
    assert cliente.patch(f"/api/pedidos/{pid}", headers=com, json={"version": actual["version"], "descripcion": "x"}).status_code == 403
    r = cliente.patch(f"/api/pedidos/{pid}", headers=dib, json={"version": actual["version"], "descripcion": "Lleva serigrafia"})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == actual["version"] + 1

    # y si alguien guarda con la version de antes de esa edicion, choca (nadie pisa a nadie)
    r = cliente.patch(f"/api/pedidos/{pid}", headers=dib, json={"version": actual["version"], "descripcion": "otra cosa"})
    assert r.status_code == 409

    # 6. chat con mencion al tecnico
    r = cliente.post(f"/api/pedidos/{pid}/mensajes", headers=dib, json={"texto": f"@{PREFIJO}tecnico revisa la puerta porfa"})
    assert r.status_code == 201, r.text
    mensajes = cliente.get(f"/api/pedidos/{pid}/mensajes", headers=com).json()
    assert len(mensajes) == 1 and mensajes[0]["autor"]["usuario"] == f"{PREFIJO}dibujante"

    # 7. adjuntar una imagen de verdad al Blob y que salga de portada
    png = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
           b"\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82")
    r = cliente.post(f"/api/pedidos/{pid}/adjuntos", headers=com, files=[("archivos", ("foto hilux.png", io.BytesIO(png), "image/png"))])
    assert r.status_code == 201, r.text
    adj = r.json()[0]
    assert adj["es_imagen"] and "sig=" in adj["url"]
    descarga = cliente.get(f"/api/adjuntos/{adj['id']}/descargar", headers=com, follow_redirects=False)
    assert descarga.status_code == 307
    import httpx
    assert httpx.get(adj["url"], timeout=30).content == png  # el archivo esta de verdad en Azure

    # extension prohibida
    r = cliente.post(f"/api/pedidos/{pid}/adjuntos", headers=com, files=[("archivos", ("virus.exe", io.BytesIO(b"MZ"), "application/octet-stream"))])
    assert r.status_code == 400

    tarjeta = next(p for p in cliente.get("/api/tablero", headers=dib).json()["pedidos"] if p["id"] == pid)
    assert tarjeta["portada_url"] and tarjeta["total_adjuntos"] == 1 and tarjeta["total_mensajes"] == 1

    # 8. notificaciones: al tecnico le llego la mencion
    bandeja = cliente.get("/api/notificaciones", headers=tec).json()
    tipos = {n["tipo"] for n in bandeja["items"] if n["pedido_id"] == pid}
    assert "chat.mencion" in tipos and "pedido.creado" in tipos

    # 9. correos en cola y el cartero los manda (con un enviador falso para la prueba)
    with SesionLocal() as db:
        cola = list(db.scalars(select(CorreoCola).where(CorreoCola.pedido_id == pid)))
    eventos = {c.evento for c in cola}
    assert {"pedido.creado", "pedido.movido", "chat.mencion"} <= eventos
    assert "chat.mensaje" not in eventos  # el chat normal no manda correo, solo menciones

    falso = EnviadorDePrueba()
    procesar_lote(falso)
    with SesionLocal() as db:
        estados = set(db.scalars(select(CorreoCola.estado).where(CorreoCola.pedido_id == pid)))
    assert estados == {"enviado"}

    # 10. historial registra lo importante
    acciones = [h["accion"] for h in cliente.get(f"/api/pedidos/{pid}/historial", headers=com).json()]
    assert {"pedido.creado", "pedido.movido", "pedido.editado", "adjunto.subido"} <= set(acciones)


def test_mover_muchas_veces_renumera_bien(cliente, usuarios):
    """Mete tarjetas siempre en el mismo hueco hasta agotarlo y revisa que el orden no se dañe."""
    com, dib = entrar(cliente, "comercial"), entrar(cliente, "dibujante")
    with SesionLocal() as db:
        destino = list(db.scalars(select(Columna).where(Columna.activa).order_by(Columna.orden)))[3].id

    ids = []
    for i in range(3):
        r = cliente.post("/api/pedidos", headers=com, json={"vehiculo": f"Orden {i}", "piezas": [{"nombre": "p"}]})
        ids.append(r.json()["id"])
    for pid in ids:
        cliente.post(f"/api/pedidos/{pid}/mover", headers=dib, json={"columna_id": destino, "indice": 999})
    versiones = {p["id"]: p["version"] for p in cliente.get("/api/tablero", headers=dib).json()["pedidos"] if p["id"] in ids}

    # 12 veces el ultimo al puesto 1: los huecos (1024) se agotan en ~10 y toca renumerar
    for _ in range(12):
        tablero = cliente.get("/api/tablero", headers=dib).json()["pedidos"]
        columna = [p["id"] for p in tablero if p["columna_id"] == destino and p["id"] in ids]
        r = cliente.post(f"/api/pedidos/{columna[-1]}/mover", headers=dib, json={"columna_id": destino, "indice": 1})
        assert r.status_code == 200
        esperado = [columna[0], columna[-1], *columna[1:-1]]
        tablero = cliente.get("/api/tablero", headers=dib).json()["pedidos"]
        assert [p["id"] for p in tablero if p["columna_id"] == destino and p["id"] in ids] == esperado

    # reordenar (incluso renumerando la columna) no le cambia la version a nadie
    tablero = cliente.get("/api/tablero", headers=dib).json()["pedidos"]
    assert {p["id"]: p["version"] for p in tablero if p["id"] in ids} == versiones


def _esperar_evento(ws, tipo: str, segundos: float = 5) -> dict:
    fin = time.monotonic() + segundos
    while time.monotonic() < fin:
        evento = ws.receive_json()
        if evento.get("tipo") == tipo:
            return evento
    raise AssertionError(f"no llego el evento {tipo}")
