"""Notificaciones nativas del sistema (pop-up) para los recordatorios.

Windows: notificacion "toast" de Windows 10/11 (la del Centro de notificaciones) mostrada con
WinRT a traves de Windows PowerShell 5.1, que viene en todos los Windows. Se registra un
AppUserModelID propio para que aparezca como "Cinema Reservas" con su icono, y el protocolo
cinemareservas:// para que el boton "Abrir" traiga la app al frente.
macOS: osascript "display notification".
"""
import base64
import os
import subprocess
import sys
from pathlib import Path

AUMID = "CinemaProductions.CinemaReservas"
APP_NAME = "Cinema Reservas"
PROTOCOL = "cinemareservas"
# Grupo de las notificaciones: uno por carpeta de datos, para que la app instalada y el modo
# desarrollo no se borren la programacion el uno al otro (lo fija app.py con set_data_dir).
GROUP = "recordatorios"


def set_data_dir(path) -> None:
    import hashlib
    global GROUP
    GROUP = "rec-" + hashlib.sha1(str(path).lower().encode("utf-8")).hexdigest()[:10]
_NO_WINDOW = 0x08000000


def escape(s: str) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))

_registered = {"done": False, "protocol": False}


def supported() -> bool:
    return sys.platform in ("win32", "darwin")


def _app_home() -> Path:
    return Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "CinemaProductions"


def _logo_png() -> str:
    """PNG para el icono dentro de la notificacion (debe ser un archivo local)."""
    here = Path(__file__).resolve().parent
    for p in (here / "build" / "logo.png", here / "build" / "favicon.png",
              here.parent / "frontend" / "public" / "logo.png"):
        if p.is_file():
            return str(p)
    return ""


def _register_windows() -> None:
    """Registra (en HKCU, sin permisos de administrador) el nombre e icono de la app para
    las notificaciones y el protocolo cinemareservas:// que abre/enfoca la app."""
    if _registered["done"]:
        return
    _registered["done"] = True
    try:
        import winreg
        icon = str(_app_home() / "icono.ico")
        if not os.path.isfile(icon):
            icon = _logo_png()
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Classes\AppUserModelId\%s" % AUMID) as k:
            winreg.SetValueEx(k, "DisplayName", 0, winreg.REG_SZ, APP_NAME)
            if icon:
                winreg.SetValueEx(k, "IconUri", 0, winreg.REG_SZ, icon)
            winreg.SetValueEx(k, "IconBackgroundColor", 0, winreg.REG_SZ, "FF4F46E5")
            winreg.SetValueEx(k, "ShowInSettings", 0, winreg.REG_DWORD, 1)
        exe = _app_home() / "CinemaProductions.exe"
        if exe.is_file():
            base = r"Software\Classes\%s" % PROTOCOL
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base) as k:
                winreg.SetValueEx(k, "", 0, winreg.REG_SZ, "URL:%s" % APP_NAME)
                winreg.SetValueEx(k, "URL Protocol", 0, winreg.REG_SZ, "")
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base + r"\DefaultIcon") as k:
                winreg.SetValueEx(k, "", 0, winreg.REG_SZ, '"%s",0' % exe)
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base + r"\shell\open\command") as k:
                winreg.SetValueEx(k, "", 0, winreg.REG_SZ, '"%s" "%%1"' % exe)
            _registered["protocol"] = True
    except Exception:
        pass


def _toast_xml(title: str, lines: list, tag: str, sticky: bool) -> str:
    logo = _logo_png()
    texts = "".join("<text>%s</text>" % escape(str(t)) for t in [title] + [l for l in lines if l][:2])
    img = ('<image placement="appLogoOverride" hint-crop="circle" src="%s"/>'
           % escape(Path(logo).as_uri())) if logo else ""
    open_btn = ('<action content="Abrir Cinema Reservas" activationType="protocol" arguments="%s://abrir"/>'
                % PROTOCOL) if _registered["protocol"] else ""
    launch = (' activationType="protocol" launch="%s://abrir"' % PROTOCOL) if _registered["protocol"] else ""
    scenario = ' scenario="reminder"' if sticky else ""
    audio = "Notification.Reminder" if sticky else "Notification.Default"
    return ('<toast%s%s><visual><binding template="ToastGeneric">%s'
            '<text placement="attribution">%s</text>%s</binding></visual>'
            '<actions>%s<action content="" activationType="system" arguments="dismiss"/></actions>'
            '<audio src="ms-winsoundevent:%s"/></toast>'
            % (scenario, launch, texts, APP_NAME, img, open_btn, audio))


_PS_TEMPLATE = r"""
$ErrorActionPreference = 'Stop'
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$xml = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__XML__'))
$doc = New-Object Windows.Data.Xml.Dom.XmlDocument
$doc.LoadXml($xml)
$t = New-Object Windows.UI.Notifications.ToastNotification $doc
$t.Tag = '__TAG__'
$t.Group = '__GROUP__'
$n = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('__AUMID__')
$st = ''
try { $st = "$($n.Setting)" } catch { }
if ($st -and $st -ne 'Enabled') { [Console]::Out.WriteLine("BLOCKED:$st"); exit 0 }
$n.Show($t)
[Console]::Out.WriteLine('OK')
"""

_PS_SETTING = r"""
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
try { [Console]::Out.WriteLine("$([Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('__AUMID__').Setting)") } catch { }
"""


def _ps_env() -> dict:
    # Windows PowerShell 5.1 no debe heredar los modulos de PowerShell 7 (PSModulePath),
    # si no, falla al cargar cmdlets basicos.
    env = {k: v for k, v in os.environ.items() if k.upper() != "PSMODULEPATH"}
    return env


def _powershell(script: str, timeout: int = 25, env=None) -> str:
    script = ("$ProgressPreference = 'SilentlyContinue'\ntry {\n" + script +
              "\n} catch { [Console]::Out.WriteLine('ERR:' + $_.Exception.Message) }")
    exe = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"),
                       r"System32\WindowsPowerShell\v1.0\powershell.exe")
    enc = base64.b64encode(script.encode("utf-16-le")).decode("ascii")
    r = subprocess.run([exe, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                        "-EncodedCommand", enc],
                       capture_output=True, text=True, timeout=timeout, creationflags=_NO_WINDOW,
                       env=env or _ps_env(), encoding="utf-8", errors="replace")
    out = (r.stdout or "").strip().splitlines()
    if r.returncode != 0 and not out:
        raise RuntimeError((r.stderr or "PowerShell fallo").strip().splitlines()[-1][:300])
    return out[-1].strip() if out else ""


def windows_setting() -> str:
    """'Enabled' o el motivo por el que Windows bloquea las notificaciones de la app
    (DisabledForApplication, DisabledForUser, DisabledByGroupPolicy, DisabledByManifest)."""
    if sys.platform != "win32":
        return ""
    _register_windows()
    try:
        return _powershell(_PS_SETTING.replace("__AUMID__", AUMID), timeout=20) or "Unknown"
    except Exception:
        return "Unknown"


BLOCKED_TEXT = {
    "DisabledForApplication": "Windows tiene desactivadas las notificaciones de Cinema Reservas. "
                              "Actívalas en Configuración > Sistema > Notificaciones.",
    "DisabledForUser": "Las notificaciones de Windows están desactivadas. "
                       "Actívalas en Configuración > Sistema > Notificaciones.",
    "DisabledByGroupPolicy": "Una directiva del equipo bloquea las notificaciones.",
    "DisabledByManifest": "Windows bloquea las notificaciones de esta app.",
}


def notify(title: str, lines: list, tag: str = "cinema", sticky: bool = True) -> dict:
    """Muestra una notificacion emergente del sistema. Devuelve {ok, error}."""
    try:
        if sys.platform == "win32":
            _register_windows()
            xml = _toast_xml(title, lines, tag, sticky)
            script = (_PS_TEMPLATE.replace("__XML__", base64.b64encode(xml.encode("utf-8")).decode("ascii"))
                      .replace("__TAG__", "".join(c for c in tag if c.isalnum() or c in "-_")[:60] or "cinema")
                      .replace("__AUMID__", AUMID).replace("__GROUP__", GROUP))
            res = _powershell(script)
            if res == "OK":
                return {"ok": True, "error": ""}
            if res.startswith("BLOCKED:"):
                why = res.split(":", 1)[1]
                return {"ok": False, "blocked": why, "error": BLOCKED_TEXT.get(why, "Windows bloquea las notificaciones (%s)." % why)}
            return {"ok": False, "error": res or "No se pudo mostrar la notificación"}
        if sys.platform == "darwin":
            def q(s):
                return '"%s"' % str(s).replace("\\", "\\\\").replace('"', '\\"')
            body = " · ".join(l for l in lines if l)
            subprocess.run(["osascript", "-e", "display notification %s with title %s subtitle %s sound name \"Glass\""
                            % (q(body), q(APP_NAME), q(title))], capture_output=True, timeout=15)
            return {"ok": True, "error": ""}
        return {"ok": False, "error": "Este sistema no admite notificaciones emergentes"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}


_PS_SCHEDULE = r"""
$ErrorActionPreference = 'Stop'
[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
$lines = [IO.File]::ReadAllLines($env:CP_SCHED_FILE, [Text.Encoding]::UTF8)
$n = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('__AUMID__')
foreach ($old in @($n.GetScheduledToastNotifications())) {
  if ($old.Group -eq '__GROUP__') { $n.RemoveFromSchedule($old) }
}
$c = 0
$limit = [DateTimeOffset]::Now.AddSeconds(20)
foreach ($ln in $lines) {
  $f = $ln.Split("`t")
  if ($f.Length -lt 3) { continue }
  $when = [DateTimeOffset]::Parse($f[1], [Globalization.CultureInfo]::InvariantCulture)
  if ($when -le $limit) { continue }
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $doc.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($f[2])))
  $s = New-Object Windows.UI.Notifications.ScheduledToastNotification $doc, $when
  $s.Id = $f[0]; $s.Tag = $f[0]; $s.Group = '__GROUP__'
  $n.AddToSchedule($s)
  $c++
}
[Console]::Out.WriteLine("OK:$c")
"""


def short_id(key: str) -> str:
    import hashlib
    return "r" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:14]


def schedule(items: list) -> dict:
    """Deja programados en Windows los avisos futuros: Windows los muestra a su hora aunque
    Cinema Reservas este cerrada. items: [{key, when (ISO con zona), title, lines}].
    Reemplaza la programacion anterior. Devuelve {ok, count, error}."""
    if sys.platform != "win32":
        return {"ok": False, "count": 0, "error": "solo Windows"}
    import tempfile
    _register_windows()
    data = [{"id": short_id(it["key"]), "when": it["when"],
             "xml": _toast_xml(it["title"], it["lines"], short_id(it["key"]), True)} for it in items[:200]]
    fd, path = tempfile.mkstemp(prefix="cp_avisos_", suffix=".txt")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            for d in data:
                f.write("%s\t%s\t%s\n" % (d["id"], d["when"],
                                          base64.b64encode(d["xml"].encode("utf-8")).decode("ascii")))
        res = _powershell(_PS_SCHEDULE.replace("__AUMID__", AUMID).replace("__GROUP__", GROUP), timeout=90,
                          env={**_ps_env(), "CP_SCHED_FILE": path})
        if res.startswith("OK:"):
            return {"ok": True, "count": int(res[3:] or 0), "error": ""}
        return {"ok": False, "count": 0, "error": res[:300]}
    except Exception as e:
        return {"ok": False, "count": 0, "error": str(e)[:300]}
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def open_settings() -> bool:
    """Abre la pantalla de notificaciones del sistema."""
    try:
        if sys.platform == "win32":
            os.startfile("ms-settings:notifications")
            return True
        if sys.platform == "darwin":
            subprocess.Popen(["open", "x-apple.systempreferences:com.apple.preference.notifications"])
            return True
    except Exception:
        pass
    return False
