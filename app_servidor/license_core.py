"""Cinema Productions - Licencia (Gumroad) ligada al ID del equipo.

Solo libreria estandar (la usan el launcher, el instalador y app.py).

Flujo (igual que el resto de productos de Cinema Productions en Gumroad):
  1. El cliente compra en Gumroad y recibe la clave por correo.
  2. Pega la clave en la ventana "Activa tu licencia".
  3. Se valida con la API oficial de Gumroad (POST /v2/licenses/verify) y se
     guarda un archivo local firmado y ligado a este equipo.
  4. Despues funciona sin internet; cada RECHECK_DAYS dias revalida en segundo
     plano (si hay reembolso/disputa se revoca) y tolera GRACE_DAYS sin red.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# ── Configuracion del producto (EDITAR al crear el producto en Gumroad) ──
# product_id: Gumroad > Producto > Content > "License key" > ver "product_id"
#             (o en la pestana "Advanced"/API). Fijo en el codigo a proposito: no se
#             puede cambiar con archivos ni variables (evita activar con otro producto).
GUMROAD_PRODUCT_ID = "iHbDhmJuIypLwDTecMEgPQ=="   # CinemaFlow (Gumroad)
BUY_URL = "https://cinemaproductions.gumroad.com/l/Cinemaflow"
MAX_DEVICES = 2          # equipos por licencia (Gumroad cuenta "uses")
RECHECK_DAYS = 7
GRACE_DAYS = 30
APP_NAME = "Cinema Reservas"

_API = "https://api.gumroad.com/v2/licenses/verify"
# Secreto de ofuscacion del archivo local (no es seguridad fuerte: solo evita
# que copiar license.json a otro PC o editarlo a mano funcione).
_SECRET = b"cinema-productions/reservas/lic/v1"
# Licencias maestras (uso interno de Cinema Productions): entran sin Gumroad, sin
# limite de equipos, sin revalidar y no se pueden borrar desde la app. Solo se guarda
# el hash. Se aceptan sin importar mayusculas, espacios ni guiones.
_MASTER_SHA256 = (
    "916a36f6b82f980e30ccba0496fee1cfe3ac4871c07d8e6893100d89b4599896",   # clave larga
    "0cfc0f252156f2e5bfe4a88e7f9266b7e9b22227bc5f00eb80c65bb3508e9b10",   # clave de Cinema Productions
)


def is_master(key: str) -> bool:
    norm = "".join((key or "").split()).upper().replace("-", "").replace("_", "")
    h = hashlib.sha256(b"cinema-master|" + norm.encode()).hexdigest()
    return any(hmac.compare_digest(h, m) for m in _MASTER_SHA256)


def _cfg() -> dict:
    return {"product_id": GUMROAD_PRODUCT_ID, "buy_url": BUY_URL}


def buy_url() -> str:
    return _cfg()["buy_url"]


def license_path() -> Path:
    if sys.platform == "darwin":
        root = Path.home() / "Library" / "Application Support"
    else:
        root = Path(os.environ.get("APPDATA") or Path.home() / ".config")
    base = root / "CinemaProductions"
    base.mkdir(parents=True, exist_ok=True)
    return base / "license.json"


# ── ID del equipo ────────────────────────────────────────────────────────
def machine_id() -> str:
    """XXXX-XXXX-XXXX-XXXX estable por equipo (MachineGuid en Windows, IOPlatformUUID en macOS)."""
    parts = []
    if sys.platform == "darwin":
        try:   # IOPlatformUUID: estable por Mac
            out = subprocess.run(["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                                 capture_output=True, text=True, timeout=8).stdout
            for line in out.splitlines():
                if "IOPlatformUUID" in line:
                    parts.append(line.split('"')[-2])
        except Exception:
            pass
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography",
                            0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as k:
            parts.append(str(winreg.QueryValueEx(k, "MachineGuid")[0]))
    except Exception:
        pass
    if not parts:
        import uuid
        parts.append(str(uuid.getnode()))
    h = hashlib.sha256(("|".join(parts) + "|cinema").encode()).hexdigest().upper()[:16]
    return "-".join(h[i:i + 4] for i in range(0, 16, 4))


def _sign(key: str, mid: str, activated: int) -> str:
    """Firma v1 (solo clave, equipo y fecha de activacion). Se sigue escribiendo por
    compatibilidad, pero ya no basta: ver _sign2."""
    msg = f"{key}|{mid}|{activated}".encode()
    return hmac.new(_SECRET + mid.encode(), msg, hashlib.sha256).hexdigest()


def _sign2(d: dict, mid: str) -> str:
    """Firma v2: cubre TODOS los campos que deciden si la licencia vale
    (fecha de ultima validacion, revocada, maestra), asi editarlos a mano la invalida."""
    msg = "v2|%s|%s|%d|%d|%d|%d" % (d["key"], mid, int(d["activated_at"]), int(d.get("last_check", 0)),
                                    1 if d.get("revoked") else 0, 1 if d.get("master") else 0)
    return hmac.new(_SECRET + mid.encode(), msg.encode(), hashlib.sha256).hexdigest()


def _save(d: dict) -> None:
    d["sig"] = _sign(d["key"], d["machine"], int(d["activated_at"]))
    d["sig2"] = _sign2(d, d["machine"])
    license_path().write_text(json.dumps(d), encoding="utf-8")


# ── Estado local ─────────────────────────────────────────────────────────
class Status:
    def __init__(self, valid: bool, reason: str = "", email: str = "", key: str = ""):
        self.valid, self.reason, self.email, self.key = valid, reason, email, key


def _load() -> dict | None:
    try:
        return json.loads(license_path().read_text(encoding="utf-8"))
    except Exception:
        return None


def check_local() -> Status:
    """Validacion offline: archivo presente, firma correcta, mismo equipo, gracia."""
    d = _load()
    if not d:
        return Status(False, "No hay licencia activada.")
    mid = machine_id()
    try:
        if d.get("machine") != mid:
            ok = False
        elif "sig2" in d:
            ok = hmac.compare_digest(d["sig2"], _sign2(d, mid))
        else:
            # archivo de una version anterior (firma v1): la fecha de ultima validacion
            # no estaba firmada, asi que se cuenta desde la activacion hasta revalidar
            ok = hmac.compare_digest(d.get("sig", ""), _sign(d["key"], mid, int(d["activated_at"])))
            d["last_check"] = d["activated_at"]
            d["master"] = False
    except Exception:
        ok = False
    if not ok:
        return Status(False, "La licencia no corresponde a este equipo.")
    if d.get("revoked"):
        return Status(False, "La licencia fue revocada (reembolso o disputa).")
    if d.get("master") and is_master(d["key"]):
        return Status(True, "", "Licencia maestra", d["key"])
    last = float(d.get("last_check", d["activated_at"]))
    if last > time.time() + 86400:                     # fecha futura: reloj o archivo alterado
        return Status(False, "La fecha del equipo no es correcta. Ajusta el reloj y conectate "
                             "a internet para revalidar la licencia.", d.get("email", ""), d["key"])
    age = (time.time() - last) / 86400
    if age > GRACE_DAYS:
        return Status(False, "Hace mas de %d dias que no se valida la licencia. "
                             "Conectate a internet para revalidarla." % GRACE_DAYS,
                      d.get("email", ""), d["key"])
    return Status(True, "", d.get("email", ""), d["key"])


def needs_recheck() -> bool:
    d = _load()
    if not d or d.get("master"):
        return False
    return (time.time() - float(d.get("last_check", 0))) / 86400 >= RECHECK_DAYS


# ── Gumroad ──────────────────────────────────────────────────────────────
def _ssl_contexts() -> list:
    """Contextos TLS a probar. En un .app de macOS (PyInstaller) Python no trae CAs del
    sistema y urllib falla con CERTIFICATE_VERIFY_FAILED: se usa el bundle de certifi."""
    out = []
    try:
        import certifi
        out.append(ssl.create_default_context(cafile=certifi.where()))
    except Exception:
        pass
    out.append(ssl.create_default_context())
    for cafile in ("/etc/ssl/cert.pem", "/private/etc/ssl/cert.pem"):   # CAs del sistema (macOS)
        if os.path.exists(cafile):
            try:
                out.append(ssl.create_default_context(cafile=cafile))
            except Exception:
                pass
    return out


def _verify(key: str, increment: bool, timeout: float = 12.0) -> tuple[int, dict]:
    cfg = _cfg()
    data = urllib.parse.urlencode({
        "product_id": cfg["product_id"],
        "license_key": key,
        "increment_uses_count": "true" if increment else "false",
    }).encode()
    last: Exception | None = None
    for ctx in _ssl_contexts():
        req = urllib.request.Request(_API, data=data, headers={"User-Agent": "CinemaReservas/1"})
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                return r.status, json.loads(r.read().decode("utf-8", "ignore"))
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read().decode("utf-8", "ignore"))
            except Exception:
                return e.code, {}
        except Exception as e:      # certificado / red: probar el siguiente contexto
            last = e
            if not _is_cert_error(e):
                break
    raise last or OSError("sin conexion")


def _is_cert_error(e: Exception) -> bool:
    r = getattr(e, "reason", e)
    return isinstance(r, ssl.SSLError) or "CERTIFICATE" in str(e).upper()


def _net_reason(e: Exception, retry: bool = False) -> str:
    if _is_cert_error(e):
        return "No se pudo verificar el certificado seguro de Gumroad (%s)." % (getattr(e, "reason", e))
    base = "Sin conexion a internet. Se necesita solo para activar."
    return "Sin conexion a internet. Intentalo de nuevo." if retry else base


def _purchase_problem(p: dict) -> str:
    if p.get("refunded"):
        return "Esta compra fue reembolsada."
    if p.get("chargebacked"):
        return "Esta compra tiene un contracargo."
    if p.get("disputed") and not p.get("dispute_won"):
        return "Esta compra esta en disputa."
    if p.get("subscription_cancelled_at") or p.get("subscription_failed_at"):
        return "La suscripcion de esta licencia no esta activa."
    return ""


def activate(key: str) -> Status:
    """Activa `key` en este equipo. Devuelve Status(valid, reason)."""
    key = (key or "").strip().strip('"\'')
    if is_master(key):
        mid, now = machine_id(), int(time.time())
        rec = {"key": key, "machine": mid, "email": "Licencia maestra", "activated_at": now,
               "last_check": now, "revoked": False, "master": True}
        _save(rec)
        return Status(True, "", rec["email"], key)
    if len(key) < 16:
        return Status(False, "Pega la clave completa que te llego por correo.")
    if _cfg()["product_id"].startswith("REEMPLAZAR"):
        return Status(False, "Licencias aun no configuradas (falta el product_id de Gumroad).")
    try:
        code, res = _verify(key, increment=False)
    except Exception as e:
        return Status(False, _net_reason(e))
    if code != 200 or not res.get("success"):
        return Status(False, "Clave no valida. Revisa que este completa y sea de Cinema Reservas.")
    p = res.get("purchase", {})
    problem = _purchase_problem(p)
    if problem:
        return Status(False, problem)

    mid = machine_id()
    prev = _load()
    same_machine = bool(prev and prev.get("key") == key and prev.get("machine") == mid)
    if not same_machine:
        if int(res.get("uses", 0)) >= MAX_DEVICES:
            return Status(False, "Esta licencia ya se uso en %d equipos. "
                                 "Escribenos para moverla a otro PC." % MAX_DEVICES)
        try:
            _verify(key, increment=True)
        except Exception as e:
            return Status(False, _net_reason(e, retry=True))

    now = int(time.time())
    rec = {"key": key, "machine": mid, "email": p.get("email", ""), "activated_at": now,
           "last_check": now, "revoked": False}
    _save(rec)
    return Status(True, "", rec["email"], key)


def recheck_online() -> None:
    """Revalida en linea (en segundo plano o al abrir si la gracia vencio). Sin red no
    hace nada. Tambien convierte licencias antiguas (firma v1) a la firma v2."""
    d = _load()
    if not d or d.get("master") or _cfg()["product_id"].startswith("REEMPLAZAR"):
        return
    try:
        if d.get("machine") != machine_id():
            return
    except Exception:
        return
    try:
        code, res = _verify(d["key"], increment=False, timeout=8)
    except Exception:
        return
    if code == 404 or (code == 200 and (not res.get("success") or _purchase_problem(res.get("purchase", {})))):
        d["revoked"] = True
    elif code == 200:
        d["last_check"] = int(time.time())
    else:
        return
    try:
        _save(d)
    except Exception:
        pass


def deactivate_local(force: bool = False) -> None:
    """Quita la licencia de este equipo. La licencia maestra NO se borra (solo con
    force=True, que usan las pruebas automaticas)."""
    try:
        d = _load() or {}
        if not force and d.get("master") and is_master(d.get("key", "")):
            return
        license_path().unlink()
    except Exception:
        pass


def require_valid_or_exit() -> None:
    """Para app.py: si no hay licencia valida en este equipo, no arranca."""
    if os.environ.get("CP_DEV_NO_LICENSE") == "1":
        return
    st = check_local()
    if not st.valid:
        sys.stderr.write("[licencia] %s Abre Cinema Reservas desde su acceso directo.\n" % st.reason)
        sys.exit(3)
