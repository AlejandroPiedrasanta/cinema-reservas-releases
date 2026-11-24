"""Sincronizacion con «Comprobantes Cinema Productions» (programa de comprobantes del estudio).

Comprobantes guarda sus clientes y pagos en historial.db (SQLite). Este modulo los mantiene
iguales a las reservas, en los dos sentidos:
  · cliente nuevo en Comprobantes  -> reserva nueva (pagos = anticipo, JPG = recibo adjunto)
  · reserva nueva en Reservas      -> cliente nuevo en Comprobantes (anticipo = pago «Reserva»)
  · cambios en un lado             -> se copian al otro (campo por campo)
  · borrar en un lado              -> NO borra en el otro: solo los desliga (no se vuelven a copiar)

El enlace se guarda en los dos lados: columna clientes.reserva_id en historial.db y campo
comprobante_sync = {cliente_id, ultimo} en la reserva («ultimo» = lo sincronizado la ultima
vez, para saber que lado cambio). Si historial.db no existe, no hace nada.
"""
import asyncio
import base64
import json
import logging
import os
import re
import sqlite3
import sys
import time
import unicodedata
import uuid
from contextlib import closing
from datetime import date, datetime, timezone
from pathlib import Path

from bson import ObjectId

logger = logging.getLogger("sync_comprobantes")

APP_COMPROBANTES = "Comprobantes Cinema Productions"
DESLIGADO = "desligado"
CAMPOS = ("nombre", "telefono", "evento", "paquete", "lugar", "fecha", "total", "pagado")
# campo canonico -> campo de la reserva
A_RESERVA = {"nombre": "client_name", "telefono": "client_phone", "evento": "event_type",
             "paquete": "package_type", "lugar": "venue", "fecha": "event_date", "total": "total_amount",
             "pagado": "advance_paid"}
# campo canonico -> columna de clientes (pagado sale de la suma de pagos)
A_CLIENTE = {"nombre": "festejado", "telefono": "telefono", "evento": "evento", "paquete": "paquete",
             "lugar": "lugar", "fecha": "fecha_evento", "total": "total"}
MAX_RECIBO = 10 * 1024 * 1024
INTERVALO = 3           # s entre revisiones de historial.db (solo mira la fecha del archivo)
COMPLETA_CADA = 60      # s: sincronizacion completa aunque nada parezca cambiar

# Interruptor compartido: vive DENTRO de historial.db para que los dos programas lo vean igual
# (Comprobantes > Ajustes > Cinema Reservas  y  Reservas > Base de Datos > Comprobantes).
TABLA_SYNC = "CREATE TABLE IF NOT EXISTS sincronizacion(clave TEXT PRIMARY KEY, valor TEXT)"

_aviso: asyncio.Event | None = None
_candado = asyncio.Lock()
_config: Path | None = None             # comprobantes_sync.json (ruta elegida a mano)
_recibos: Path | None = None            # carpeta de las imagenes de comprobante (uploads/comprobantes)
LATIDO_CADA = 30                        # s entre latidos escritos en historial.db
_ultimo_latido = 0.0
estado = {"activo": False, "conectado": False, "encontrado": False, "ruta": None, "ultima": None,
          "error": None, "cambios": 0, "enlazados": 0, "clientes": 0}

# Las imagenes de comprobante se guardan como ARCHIVOS (no en base64 dentro de cinema_data.json:
# con 4 reservas los datos ya pesaban 12 MB y cada guardado los reescribia enteros).
URL_RECIBOS = "/api/receipt-files/"
_NOMBRE_RECIBO = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png)$")


def configurar(carpeta):
    """Carpeta de datos de Reservas: ahi van comprobantes_sync.json y uploads/comprobantes/."""
    global _config, _recibos
    _config = Path(carpeta) / "comprobantes_sync.json"
    _recibos = Path(carpeta) / "uploads" / "comprobantes"


def archivo_recibo(nombre: str) -> Path | None:
    """Ruta segura de una imagen de comprobante guardada (None si el nombre no es valido)."""
    if _recibos is None or not _NOMBRE_RECIBO.match(nombre or ""):
        return None
    return _recibos / nombre


def _guardar_imagen(datos: bytes, ext: str) -> dict:
    """Escribe la imagen en uploads/comprobantes y devuelve los campos del recibo."""
    if _recibos is None:
        raise OSError("carpeta de imagenes sin configurar")
    rid = str(uuid.uuid4())
    ext = ext if ext in (".jpg", ".jpeg", ".png") else ".jpg"
    nombre = rid + ext
    _recibos.mkdir(parents=True, exist_ok=True)
    tmp = _recibos / (nombre + ".tmp")
    tmp.write_bytes(datos)
    tmp.replace(_recibos / nombre)
    return {"id": rid, "archivo": nombre, "url": URL_RECIBOS + nombre, "size": len(datos),
            "content_type": "image/png" if ext == ".png" else "image/jpeg"}


def borrar_imagen(recibo: dict):
    p = archivo_recibo((recibo or {}).get("archivo") or "")
    if p is not None:
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass


async def migrar_recibos(db) -> int:
    """Una vez: pasa a archivos las imagenes de comprobante que estaban en base64 en los datos."""
    if _recibos is None:
        return 0
    movidas = 0
    docs = await db.reservations.find({"receipt_images.comprobante_pago_id": {"$exists": True}}).to_list(None)
    for r in docs:
        nuevos, cambio = [], False
        for img in r.get("receipt_images") or []:
            if img.get("comprobante_pago_id") is not None and img.get("data") and not img.get("archivo"):
                try:
                    datos = base64.b64decode(img["data"])
                    ext = Path(img.get("filename") or "").suffix.lower() or ".jpg"
                    campos = await asyncio.to_thread(_guardar_imagen, datos, ext)
                except Exception as e:
                    logger.error(f"No se pudo pasar a archivo el recibo {img.get('id')}: {e}")
                    nuevos.append(img)
                    continue
                campos["id"] = img.get("id") or campos["id"]
                nuevo = {k: v for k, v in img.items() if k != "data"}
                nuevo.update(campos)
                nuevos.append(nuevo)
                cambio = True
                movidas += 1
            else:
                nuevos.append(img)
        if cambio:
            await db.reservations.update_one({"_id": r["_id"]}, {"$set": {"receipt_images": nuevos}})
    return movidas


def ruta_por_defecto() -> Path:
    if sys.platform.startswith("win"):
        base = Path(os.environ.get("APPDATA", Path.home()))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path.home() / ".config"
    return base / APP_COMPROBANTES / "historial.db"


def ruta_historial() -> Path:
    if os.environ.get("CP_COMPROBANTES_DB"):
        return Path(os.environ["CP_COMPROBANTES_DB"])
    try:
        elegida = json.loads(_config.read_text(encoding="utf-8")).get("ruta") if _config else None
        if elegida:
            return Path(elegida)
    except Exception:
        pass
    return ruta_por_defecto()


def elegir_ruta(ruta: str | None):
    """Guarda la ubicacion de historial.db (None/"" = la normal de Comprobantes)."""
    if _config is None:
        return
    if ruta:
        p = Path(ruta.strip().strip('"'))
        if p.is_dir():
            p = p / "historial.db"
        _config.write_text(json.dumps({"ruta": str(p)}, ensure_ascii=False), encoding="utf-8")
    elif _config.exists():
        _config.unlink()


def _leer_ajuste(con, clave, defecto=None):
    con.execute(TABLA_SYNC)
    f = con.execute("SELECT valor FROM sincronizacion WHERE clave=?", (clave,)).fetchone()
    return f[0] if f else defecto


def _poner_ajuste(con, clave, valor):
    con.execute(TABLA_SYNC)
    con.execute("INSERT INTO sincronizacion(clave, valor) VALUES (?,?)"
                " ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor", (clave, valor))


def avisar():
    """Llamar tras crear/editar/borrar una reserva: sincroniza en seguida."""
    if _aviso is not None:
        _aviso.set()


# ── utilidades ────────────────────────────────────────────

def _txt(v):
    return "" if v is None else str(v).strip()


def _num(v):
    try:
        return round(float(v or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _clave(nombre, fecha):
    n = unicodedata.normalize("NFKD", _txt(nombre).lower())
    n = "".join(ch for ch in n if ch.isalnum())
    return n, _txt(fecha)[:10]


def _canon_reserva(r):
    c = {k: _txt(r.get(campo)) for k, campo in A_RESERVA.items() if k not in ("total", "pagado")}
    c["fecha"] = c["fecha"][:10]
    c["total"] = _num(r.get("total_amount"))
    c["pagado"] = _num(r.get("advance_paid"))
    return c


def _canon_cliente(f):
    c = {k: _txt(f[col]) for k, col in A_CLIENTE.items() if k != "total"}
    c["fecha"] = c["fecha"][:10]
    c["total"] = _num(f["total"])
    c["pagado"] = _num(f["pagado"])
    return c


def _servicios_texto(servicios_json):
    try:
        items = json.loads(servicios_json) if servicios_json else []
    except Exception:
        return ""
    lineas = []
    for it in items or []:
        if isinstance(it, (list, tuple)) and it:
            lineas.append(" ".join(_txt(x) for x in it[:2] if _txt(x)))
        elif isinstance(it, str):
            lineas.append(it.strip())
    lineas = [l for l in lineas if l]
    return ("Servicios (Comprobantes):\n- " + "\n- ".join(lineas)) if lineas else ""


# ── historial.db ──────────────────────────────────────────

def _abrir(ruta: Path):
    con = sqlite3.connect(ruta, timeout=2)     # corto: si Comprobantes escribe, se reintenta luego
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    cols = {f[1] for f in con.execute("PRAGMA table_info(clientes)")}
    if not cols:
        con.close()
        return None                     # base sin tablas todavia (Comprobantes nunca guardo nada)
    if "reserva_id" not in cols:
        con.execute("ALTER TABLE clientes ADD COLUMN reserva_id TEXT")
        con.commit()
    return con


def _leer_clientes(con):
    filas = con.execute(
        "SELECT c.*, COALESCE((SELECT SUM(monto) FROM pagos p WHERE p.cliente_id = c.id), 0) AS pagado"
        " FROM clientes c").fetchall()
    pagos = {}
    for p in con.execute("SELECT id, cliente_id, fecha, monto, concepto, comprobante FROM pagos ORDER BY id"):
        pagos.setdefault(p["cliente_id"], []).append(p)
    return {f["id"]: f for f in filas}, pagos


def _nuevo_cliente(con, r, reserva_id):
    c = _canon_reserva(r)
    try:
        creado = datetime.fromisoformat(_txt(r.get("created_at")).replace("Z", "+00:00"))
        creado = creado.astimezone().replace(tzinfo=None)
    except ValueError:
        creado = datetime.now()
    cur = con.execute(
        "INSERT INTO clientes(festejado, telefono, evento, paquete, lugar, fecha_evento, total, creado,"
        " servicios, reserva_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (c["nombre"], c["telefono"], c["evento"], c["paquete"], c["lugar"], c["fecha"], c["total"],
         creado.isoformat(timespec="seconds"), None, reserva_id))
    if c["pagado"] > 0:
        con.execute("INSERT INTO pagos(cliente_id, fecha, monto, concepto, comprobante) VALUES (?,?,?,?,?)",
                    (cur.lastrowid, creado.date().isoformat(), c["pagado"], "Reserva", ""))
    return cur.lastrowid


def _escribir_cliente(con, cliente_id, nuevo, actual):
    sets = {A_CLIENTE[k]: nuevo[k] for k in A_CLIENTE if nuevo[k] != actual[k]}
    if sets:
        con.execute("UPDATE clientes SET " + ", ".join(f"{k}=?" for k in sets) + " WHERE id=?",
                    (*sets.values(), cliente_id))
    dif = round(nuevo["pagado"] - actual["pagado"], 2)
    if dif:
        concepto = "Abono" if dif > 0 else "Ajuste"
        if dif > 0 and nuevo["pagado"] >= nuevo["total"] > 0:
            concepto = "Pago Final"
        con.execute("INSERT INTO pagos(cliente_id, fecha, monto, concepto, comprobante) VALUES (?,?,?,?,?)",
                    (cliente_id, date.today().isoformat(), dif, concepto, ""))


# ── reservas ──────────────────────────────────────────────

def _doc_reserva(f, c):
    pagado = c["pagado"]
    doc = {
        "client_name": c["nombre"] or "Sin nombre", "client_phone": c["telefono"] or None,
        "client_email": None, "event_type": c["evento"] or "Evento", "event_date": c["fecha"],
        "event_time": None, "venue": c["lugar"] or None, "guests_count": None,
        "total_amount": c["total"], "advance_paid": pagado,
        "status": "Confirmado" if pagado > 0 else "Pendiente",
        "notes": _servicios_texto(f["servicios"]) or None, "package_type": c["paquete"] or None,
        "assigned_partners": [], "receipt_images": [],
    }
    try:
        creado = datetime.fromisoformat(_txt(f["creado"])).astimezone(timezone.utc)
    except ValueError:
        creado = datetime.now(timezone.utc)
    doc["created_at"] = creado.isoformat()
    return doc


def _cambios_reserva(nuevo, actual):
    out = {}
    for k, campo in A_RESERVA.items():
        if nuevo[k] != actual[k]:
            v = nuevo[k]
            out[campo] = v if (v != "" or k in ("nombre", "evento", "fecha")) else None
    return out


def _mezclar(r, c, ultimo):
    """Campo por campo: gana el lado que cambio desde la ultima vez; si cambiaron los dos, Reservas."""
    m = {}
    for k in CAMPOS:
        if r[k] == c[k]:
            m[k] = r[k]
        elif ultimo is None:            # primer enlace: lo que tenga datos; el pago mayor
            m[k] = max(r[k], c[k]) if k in ("total", "pagado") else (c[k] or r[k])
        elif c[k] != ultimo.get(k) and r[k] == ultimo.get(k):
            m[k] = c[k]
        else:
            m[k] = r[k]
    return m


async def _adjuntar_recibos(db, oid, reserva, pagos):
    """Sube como recibos de la reserva los JPG de los comprobantes que aun no estan. Si un
    comprobante se volvio a generar (mismo pago, otro archivo), cambia el recibo viejo por el nuevo."""
    ya = {str(x.get("comprobante_pago_id")): x for x in (reserva.get("receipt_images") or [])
          if x.get("comprobante_pago_id") is not None}
    quitados = {str(x) for x in ((reserva.get("comprobante_sync") or {}).get("recibos_quitados") or [])}
    nuevos, viejos = [], []
    for p in pagos:
        if str(p["id"]) in quitados:
            continue                        # lo quitaste a mano en Reservas: no se vuelve a poner
        ruta = Path(_txt(p["comprobante"])) if _txt(p["comprobante"]) else None
        if not ruta or not ruta.is_file():
            continue
        previo = ya.get(str(p["id"]))
        if previo is not None and previo.get("filename") == ruta.name:
            guardada = archivo_recibo(previo.get("archivo") or "")
            if previo.get("data") or (guardada is not None and guardada.is_file()):
                continue                    # ya esta (y su imagen existe)
        try:
            if ruta.stat().st_size > MAX_RECIBO:
                continue
            datos = await asyncio.to_thread(ruta.read_bytes)
            campos = await asyncio.to_thread(_guardar_imagen, datos, ruta.suffix.lower())
        except OSError:
            continue
        if previo is not None:
            viejos.append(previo)
        nuevos.append({**campos, "filename": ruta.name,
                       "uploaded_at": datetime.now(timezone.utc).isoformat(),
                       "comprobante_pago_id": p["id"]})
    if viejos:
        await db.reservations.update_one(
            {"_id": oid}, {"$pull": {"receipt_images": {"id": {"$in": [v.get("id") for v in viejos]}}}})
        for v in viejos:
            await asyncio.to_thread(borrar_imagen, v)
    if nuevos:
        await db.reservations.update_one({"_id": oid}, {"$push": {"receipt_images": {"$each": nuevos}}})
    return len(nuevos)


# ── sincronizacion ────────────────────────────────────────

async def sincronizar(db) -> int:
    """Una pasada completa (si el interruptor esta encendido). Devuelve cuantos cambios hizo."""
    async with _candado:
        return await _sincronizar(db)


async def _sincronizar(db) -> int:
    ruta = ruta_historial()
    estado["ruta"] = str(ruta)
    estado["encontrado"] = ruta.is_file()
    if not ruta.is_file():
        estado["activo"] = False
        return 0
    con = _abrir(ruta)
    if con is None:
        estado["activo"] = False
        return 0
    global _ultimo_latido
    with closing(con):
        conectado = _leer_ajuste(con, "conectado", "1") == "1"
        estado["conectado"] = conectado
        # latido: Comprobantes muestra «Cinema Reservas conectado» si es reciente (cada 30 s basta;
        # antes se escribia en cada pasada y eso tocaba historial.db sin necesidad)
        if time.monotonic() - _ultimo_latido >= LATIDO_CADA:
            _poner_ajuste(con, "reservas_visto", datetime.now().isoformat(timespec="seconds"))
            con.commit()
            _ultimo_latido = time.monotonic()
        if not conectado:
            estado["activo"] = False
            return 0
        estado["activo"] = True
        cambios = await _pasada(db, con)
        con.commit()
        estado["clientes"] = con.execute("SELECT COUNT(*) FROM clientes").fetchone()[0]
        estado["enlazados"] = con.execute(
            "SELECT COUNT(*) FROM clientes WHERE reserva_id IS NOT NULL AND reserva_id NOT IN ('', ?)",
            (DESLIGADO,)).fetchone()[0]
    return cambios


async def conectar(db, encender: bool) -> dict:
    """Enciende o apaga la sincronizacion (el interruptor lo comparten los dos programas)."""
    ruta = ruta_historial()
    if not ruta.is_file():
        estado.update(encontrado=False, conectado=False, activo=False)
        return estado
    async with _candado:
        con = _abrir(ruta)
        if con is not None:
            with closing(con):
                _poner_ajuste(con, "conectado", "1" if encender else "0")
                con.commit()
    estado.update(conectado=encender, activo=encender)
    n = await sincronizar(db) if encender else 0
    estado["cambios"] += n
    return estado


async def resincronizar(db) -> dict:
    """Vuelve a enlazar TODO: recupera lo desligado (lo borrado de un lado se vuelve a crear),
    vuelve a subir los JPG que falten y deja los dos programas iguales."""
    ruta = ruta_historial()
    if not ruta.is_file():
        estado.update(encontrado=False, activo=False)
        return {**estado, "hechos": 0}
    async with _candado:
        con = _abrir(ruta)
        if con is not None:
            with closing(con):
                _poner_ajuste(con, "conectado", "1")
                con.execute("UPDATE clientes SET reserva_id=NULL WHERE reserva_id=?", (DESLIGADO,))
                con.commit()
        await db.reservations.update_many({"comprobante_sync.desligado": True}, {"$unset": {"comprobante_sync": ""}})
        await db.reservations.update_many({"comprobante_sync.recibos_quitados": {"$exists": True}},
                                          {"$unset": {"comprobante_sync.recibos_quitados": ""}})
    hechos = await sincronizar(db)
    estado["cambios"] += hechos
    return {**estado, "hechos": hechos}


async def _pasada(db, con) -> int:
    cambios = 0
    clientes, pagos = _leer_clientes(con)
    reservas = await db.reservations.find({}, {"receipt_images.data": 0}).to_list(None)
    por_id = {str(r["_id"]): r for r in reservas}
    enlazados = set()

    # 1) reservas ya enlazadas (o reservas cuyo cliente apunta a ellas)
    for f in clientes.values():
        rid = _txt(f["reserva_id"])
        if not rid or rid == DESLIGADO:
            continue
        r = por_id.get(rid)
        if r is None:                                   # reserva borrada: desligar
            con.execute("UPDATE clientes SET reserva_id=? WHERE id=?", (DESLIGADO, f["id"]))
            cambios += 1
            continue
        enlazados.add(rid)
        cs = r.get("comprobante_sync") or {}
        ultimo = cs.get("ultimo") if cs.get("cliente_id") == f["id"] else None
        cr, cc = _canon_reserva(r), _canon_cliente(f)
        m = _mezclar(cr, cc, ultimo)
        upd = _cambios_reserva(m, cr)
        if cr["pagado"] <= 0 < m["pagado"] and r.get("status") == "Pendiente":
            upd["status"] = "Confirmado"            # llego el anticipo desde Comprobantes
        if upd or ultimo != m:
            upd["comprobante_sync"] = {"cliente_id": f["id"], "ultimo": m}
            if cs.get("recibos_quitados"):
                upd["comprobante_sync"]["recibos_quitados"] = cs["recibos_quitados"]
            await db.reservations.update_one({"_id": r["_id"]}, {"$set": upd})
            cambios += 1
        if m != cc:
            _escribir_cliente(con, f["id"], m, cc)
            cambios += 1
        cambios += await _adjuntar_recibos(db, r["_id"], r, pagos.get(f["id"], []))

    # 2) reservas enlazadas cuyo cliente ya no existe: desligar
    religados = set()
    for rid, r in por_id.items():
        cs = r.get("comprobante_sync") or {}
        if rid in enlazados or cs.get(DESLIGADO) or not cs.get("cliente_id"):
            continue
        f = clientes.get(cs["cliente_id"])
        if f is not None and not _txt(f["reserva_id"]):    # el cliente perdio el enlace: rehacerlo
            con.execute("UPDATE clientes SET reserva_id=? WHERE id=?", (rid, f["id"]))
            religados.add(f["id"])
            cambios += 1
        elif f is None or _txt(f["reserva_id"]) != rid:
            await db.reservations.update_one({"_id": r["_id"]}, {"$set": {"comprobante_sync": {DESLIGADO: True}}})
            r["comprobante_sync"] = {DESLIGADO: True}
            cambios += 1

    # 3) clientes nuevos de Comprobantes -> emparejar o crear reserva
    libres = {}
    for rid, r in por_id.items():
        if rid not in enlazados and not (r.get("comprobante_sync") or {}).get(DESLIGADO) \
                and not (r.get("comprobante_sync") or {}).get("cliente_id"):
            libres.setdefault(_clave(r.get("client_name"), r.get("event_date")), []).append(r)
    for f in clientes.values():
        if _txt(f["reserva_id"]) or f["id"] in religados:
            continue
        cc = _canon_cliente(f)
        pareja = libres.get(_clave(cc["nombre"], cc["fecha"]))
        if pareja:
            r = pareja.pop(0)
            cr = _canon_reserva(r)
            m = _mezclar(cr, cc, None)
            upd = _cambios_reserva(m, cr)
            upd["comprobante_sync"] = {"cliente_id": f["id"], "ultimo": m}
            await db.reservations.update_one({"_id": r["_id"]}, {"$set": upd})
            if m != cc:
                _escribir_cliente(con, f["id"], m, cc)
            oid = r["_id"]
            rid = str(oid)
        else:
            doc = _doc_reserva(f, cc)
            doc["comprobante_sync"] = {"cliente_id": f["id"], "ultimo": cc}
            res = await db.reservations.insert_one(doc)
            oid, rid, r = res.inserted_id, str(res.inserted_id), doc
        con.execute("UPDATE clientes SET reserva_id=? WHERE id=?", (rid, f["id"]))
        enlazados.add(rid)
        cambios += 1 + await _adjuntar_recibos(db, oid, r, pagos.get(f["id"], []))

    # 4) reservas nuevas de Reservas -> cliente nuevo en Comprobantes
    for grupo in libres.values():
        for r in grupo:
            if not _txt(r.get("event_date"))[:10]:
                continue
            try:
                date.fromisoformat(_txt(r.get("event_date"))[:10])
            except ValueError:
                continue
            rid = str(r["_id"])
            cid = _nuevo_cliente(con, r, rid)
            await db.reservations.update_one(
                {"_id": r["_id"]}, {"$set": {"comprobante_sync": {"cliente_id": cid, "ultimo": _canon_reserva(r)}}})
            cambios += 1
    return cambios


async def bucle(get_db, guardar=None):
    """Tarea de fondo: revisa historial.db cada INTERVALO s (o en seguida tras avisar())."""
    global _aviso
    _aviso = asyncio.Event()
    _aviso.set()                                    # primera pasada al arrancar
    try:                                            # una vez: imagenes en base64 -> archivos
        movidas = await migrar_recibos(get_db())
        if movidas:
            logger.warning(f"Comprobantes: {movidas} imagen(es) pasadas a archivos")
            if guardar:
                await guardar()
    except Exception as e:
        logger.error(f"No se pudieron pasar las imagenes a archivos: {e}")
    ultima_mtime, ultima_completa = None, 0.0
    bucle_ev = asyncio.get_running_loop()
    while True:
        try:
            await asyncio.wait_for(_aviso.wait(), timeout=INTERVALO)
        except asyncio.TimeoutError:
            pass
        forzada = _aviso.is_set()
        if forzada:
            await asyncio.sleep(0.8)        # junta los avisos seguidos (cliente + su pago = una pasada)
        _aviso.clear()
        try:
            ruta = ruta_historial()
            mtime = ruta.stat().st_mtime if ruta.is_file() else None
            ahora = bucle_ev.time()
            if not forzada and mtime == ultima_mtime and ahora - ultima_completa < COMPLETA_CADA:
                continue
            n = await sincronizar(get_db())
            ultima_mtime = ruta.stat().st_mtime if ruta.is_file() else None
            ultima_completa = ahora
            estado.update(ultima=datetime.now().isoformat(timespec="seconds"), error=None)
            if n:
                estado["cambios"] += n
                logger.warning(f"Comprobantes: {n} cambio(s) sincronizado(s)")
                if guardar:
                    await guardar()
        except asyncio.CancelledError:
            raise
        except Exception as e:                      # nunca tumbar el servidor por la sincronizacion
            estado["error"] = str(e)
            logger.error(f"Sincronizacion con Comprobantes fallo: {e}")
            await asyncio.sleep(INTERVALO)
