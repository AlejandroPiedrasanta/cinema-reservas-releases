"""Instalador de Cinema Reservas (PySide6). Todo incluido, sin internet, sin admin.

Payload (junto al exe, en _MEIPASS/payload):
  runtime.zip  -> Python 3.12 embebido + dependencias ya instaladas
  app.zip      -> servidor + frontend (carpeta SISTEMA sin datos)
  launcher.exe -> CinemaProductions.exe (activacion de licencia + arranque)
  version.txt, icono.ico
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import threading
import time
import traceback
import winreg
import zipfile
from pathlib import Path

from PySide6.QtCore import QRectF, Qt, QThread, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QLinearGradient, QPainter, QPainterPath, QPixmap
from PySide6.QtWidgets import (QApplication, QLabel, QPlainTextEdit, QPushButton, QWidget)

from ui_common import (APP_TITLE, Frameless, GradientButton, RoundWinButton, font, paint_bokeh,
                       res_path)

NO_WINDOW = 0x08000000
EXE_NAME = "CinemaProductions.exe"
UNINSTALL_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\CinemaReservas"
DATA_KEEP = ["cinema_data.json", "backups", "uploads", ".env", "themes", "logs",
             "server_log.txt", "error_log.txt"]

STEPS = [
    "Carpetas (en tu usuario, sin admin)",
    "Programa Cinema Reservas",
    "Python y dependencias (motor)",
    "Base de datos local",
    "Acceso directo y desinstalador",
    "Precalentar el motor",
]
W, H = 900, 640
TEAL, BRONZE = "#14808a", "#a97a4c"


def install_dir() -> Path:
    if os.environ.get("CP_INSTALL_DIR"):          # pruebas: sin accesos ni registro
        return Path(os.environ["CP_INSTALL_DIR"])
    return Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "CinemaProductions"


def _version() -> str:
    try:
        return res_path("payload/version.txt").read_text(encoding="utf-8").strip()
    except Exception:
        return "1.0.0"


LAUNCHER_DIR = "_lanzador"          # librerias del lanzador (junto a CinemaProductions.exe)
RELEASES_URL = "https://github.com/AlejandroPiedrasanta/cinema-reservas-releases"


def installed_version(t: Path) -> str:
    """Version ya instalada en esa carpeta ("" si no hay)."""
    try:
        if (t / EXE_NAME).exists():
            return (t / "version.txt").read_text(encoding="utf-8").strip()
    except Exception:
        pass
    return ""


def space_needed_mb() -> int:
    """MB que ocupara lo instalado (tamaño descomprimido de los paquetes + margen)."""
    total = 0
    for name in ("app.zip", "runtime.zip", "launcher.zip"):
        try:
            with zipfile.ZipFile(res_path("payload/" + name)) as z:
                total += sum(i.file_size for i in z.infolist())
        except Exception:
            pass
    return int(total / 1024 / 1024) + 150      # + precompilado y margen


def free_space_mb(t: Path) -> int:
    try:
        p = t if t.exists() else Path(t.anchor or "C:\\")
        return int(shutil.disk_usage(p).free / 1024 / 1024)
    except Exception:
        return 0


def desktop_dir() -> Path:
    try:
        import ctypes
        buf = ctypes.create_unicode_buffer(260)
        ctypes.windll.shell32.SHGetFolderPathW(0, 0x0000, 0, 0, buf)
        if buf.value:
            return Path(buf.value)
    except Exception:
        pass
    return Path(os.environ.get("USERPROFILE", "")) / "Desktop"


def desktop_shortcut_exists() -> bool:
    return (desktop_dir() / "Cinema Reservas.lnk").exists()


def close_splash() -> None:
    """Cierra la imagen que PyInstaller muestra al abrir el instalador (--splash)."""
    try:
        import pyi_splash  # solo existe dentro del .exe
        pyi_splash.close()
    except Exception:
        pass


def _app_env() -> dict:
    """Entorno para abrir la app al terminar: sin variables de prueba heredadas (si el
    instalador lo lanzo una app con CP_TEST_LOCAL_VERSION, la app nueva no debe creerse vieja)."""
    return {k: v for k, v in os.environ.items() if not k.startswith("CP_TEST_")}


def _q(v) -> str:
    """Texto literal de PowerShell (aguanta apostrofes en rutas, p. ej. C:\\Users\\O'Brien)."""
    return "'" + str(v).replace("'", "''") + "'"


def _run(cmd, **kw):
    return subprocess.run(cmd, creationflags=NO_WINDOW, capture_output=True, text=True,
                          errors="ignore", **kw)


class InstallJob:
    """Trabajo de instalacion, independiente de la interfaz (Qt o web).
    Avisa con callbacks: step(i), progress(pct), log(texto), finished_ok(ok, error)."""

    def __init__(self, target: Path, step, progress, log, finished_ok, options=None):
        self.target = target
        self.step, self.progress, self.log, self.finished_ok = step, progress, log, finished_ok
        self.options = {"desktop": True, **(options or {})}
        self._base = 0.0

    # progreso interno: cada paso ocupa un tramo
    def _set(self, frac_in_step: float, span: float):
        self.progress(min(100.0, self._base + span * frac_in_step))

    def _extract(self, zf: Path, dest: Path, span: float, skip_existing=()):
        with zipfile.ZipFile(zf) as z:
            names = z.namelist()
            total = len(names) or 1
            for i, n in enumerate(names):
                top = n.split("/", 1)[0]
                out = dest / n
                if top in skip_existing and out.exists():
                    continue
                if n.endswith("/"):
                    out.mkdir(parents=True, exist_ok=True)
                else:
                    out.parent.mkdir(parents=True, exist_ok=True)
                    with z.open(n) as src, open(out, "wb") as dst:
                        shutil.copyfileobj(src, dst, 1 << 20)
                if i % 40 == 0:
                    self._set(i / total, span)
        self._set(1, span)

    def run(self):
        t = self.target
        pay = res_path("payload")
        try:
            # 1 ─ carpetas
            self.step(0)
            self._base = 0
            self.log("Instalando en %s" % t)
            need, free = space_needed_mb(), free_space_mb(t)
            if free and free < need:
                raise RuntimeError("No hay espacio suficiente en el disco: se necesitan %d MB y quedan "
                                   "%d MB libres. Libera espacio y vuelve a intentarlo." % (need, free))
            # cierra solo los procesos que corren desde la carpeta de instalacion
            _run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                  "$h=%s;Get-Process | Where-Object { $_.Path -and $_.Id -ne %d -and "
                  "$_.Path.StartsWith($h,[StringComparison]::OrdinalIgnoreCase) } "
                  "| Stop-Process -Force -ErrorAction SilentlyContinue" % (_q(str(t) + "\\"), os.getpid())])
            time.sleep(0.6)
            self._migrate_old(t)
            for d in ("", "app", "python"):
                (t / d).mkdir(parents=True, exist_ok=True)
            self.progress(4)

            # 2 ─ programa (conserva datos del cliente)
            self.step(1)
            self._base = 4
            self.log("Copiando el programa (conservando tus datos si ya existian)…")
            self._extract(pay / "app.zip", t / "app", 22, skip_existing=DATA_KEEP)
            if (pay / "launcher.zip").exists():
                # lanzador "carpeta" (exe + _lanzador\): abre al instante, sin descomprimirse
                # en cada arranque como el de un solo archivo
                shutil.rmtree(t / LAUNCHER_DIR, ignore_errors=True)
                with zipfile.ZipFile(pay / "launcher.zip") as z:
                    z.extractall(t)
            else:
                shutil.copy2(pay / "launcher.exe", t / EXE_NAME)
            ico = pay / "icono.ico"
            if ico.exists():
                shutil.copy2(ico, t / "icono.ico")
            (t / "version.txt").write_text(_version(), encoding="utf-8")

            # 3 ─ python + dependencias
            self.step(2)
            self._base = 26
            self.log("Extrayendo Python 3.12 y librerias (FastAPI, uvicorn, motor…)")
            shutil.rmtree(t / "python", ignore_errors=True)
            (t / "python").mkdir(parents=True, exist_ok=True)
            self._extract(pay / "runtime.zip", t / "python", 40)

            # 4 ─ base local
            self.step(3)
            self._base = 66
            env = t / "app" / ".env"
            if not env.exists():
                env.write_text("# Cinema Reservas - base de datos local (sin internet).\n"
                               "# Para usar MongoDB propio: Ajustes > Base de Datos dentro de la app.\n"
                               "MONGO_URL=embedded\nDB_NAME=cinema_productions\n", encoding="utf-8")
                self.log("Base de datos local creada (modo embebido).")
            else:
                self.log("Se conserva tu configuracion de base de datos.")
            for d in ("backups", "uploads", "logs"):
                (t / "app" / d).mkdir(exist_ok=True)
            self.progress(70)

            # 5 ─ accesos directos + desinstalador
            self.step(4)
            self.log("Creando accesos directos y registrando el desinstalador…")
            if not os.environ.get("CP_INSTALL_DIR"):
                self._shortcuts(t)
                self._register(t)
            self.progress(80)

            # 6 ─ precalentar
            self.step(5)
            self._base = 80
            self.log("Verificando el motor y precompilando (primer arranque mas rapido)…")
            py = t / "python" / "python.exe"
            r = _run([str(py), "-c",
                      "import fastapi,uvicorn,motor,pymongo,pydantic,httpx,openpyxl,certifi,cryptography,"
                      "mongomock_motor,resend,pyzipper,multipart,dotenv,ssl_bootstrap;print('motor OK')"],
                     cwd=str(t / "app"))
            if r.returncode != 0:
                raise RuntimeError("El motor no arranco:\n" + (r.stderr or r.stdout)[-800:])
            self.log(r.stdout.strip())
            self.progress(88)
            _run([str(py), "-m", "compileall", "-q", "-j", "0", str(t / "app"),
                  str(t / "python" / "Lib" / "site-packages")], cwd=str(t / "app"))
            self.progress(100)
            self.log("Listo.")
            self.finished_ok(True, "")
        except Exception as e:
            self.log(traceback.format_exc())
            self.finished_ok(False, str(e))

    # ── helpers de Windows ────────────────────────────────────────
    def _migrate_old(self, t: Path):
        """Quita restos del instalador anterior (Inno Setup, build PyInstaller onedir).
        Los datos (reservas, respaldos, ssl) no se tocan."""
        old = [t / "_internal", t / "unins000.exe", t / "unins000.dat", t / "unins000.msg",
               t / "favicon.ico"]
        if os.environ.get("CP_INSTALL_DIR"):
            old = [t / "_internal"]
        gone = []
        for p in old:
            if p.exists():
                shutil.rmtree(p, ignore_errors=True) if p.is_dir() else p.unlink(missing_ok=True)
                gone.append(p.name)
        if os.environ.get("CP_INSTALL_DIR"):
            return
        try:   # entrada de "Aplicaciones" del instalador viejo (misma app, ahora la gestiona este)
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"
                                                      r"\{A1B4C0DE-CINE-4A11-B3E5-CPRO2025APP01}_is1")
            gone.append("registro del instalador anterior")
        except OSError:
            pass
        desk = Path(os.environ.get("USERPROFILE", "")) / "Desktop" / "Cinema Productions.lnk"
        grp = Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs/Cinema Productions"
        if desk.exists():
            desk.unlink(missing_ok=True)
            gone.append(desk.name)
        if grp.exists():
            shutil.rmtree(grp, ignore_errors=True)
            gone.append("grupo del menu Inicio anterior")
        if gone:
            self.log("Se limpio la instalacion anterior: " + ", ".join(gone))

    def _shortcuts(self, t: Path):
        exe, ico = t / EXE_NAME, t / "icono.ico"
        desk = Path(os.environ.get("USERPROFILE", "")) / "Desktop"
        try:
            import ctypes
            buf = ctypes.create_unicode_buffer(260)
            ctypes.windll.shell32.SHGetFolderPathW(0, 0x0000, 0, 0, buf)  # DESKTOPDIRECTORY
            desk = Path(buf.value)
        except Exception:
            pass
        start = Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs/Cinema Reservas"
        start.mkdir(parents=True, exist_ok=True)
        links = [(start / "Cinema Reservas.lnk", "", "Abrir Cinema Reservas"),
                 (start / "Detener Cinema Reservas.lnk", "--stop", "Cerrar el servidor local"),
                 (start / "Desinstalar Cinema Reservas.lnk", "--uninstall", "Desinstalar")]
        if self.options.get("desktop", True):
            links.insert(0, (desk / "Cinema Reservas.lnk", "", "Abrir Cinema Reservas"))
        else:                                   # el cliente no lo quiere: quitar el de antes
            (desk / "Cinema Reservas.lnk").unlink(missing_ok=True)
        ps = ["$s=New-Object -ComObject WScript.Shell"]
        for p, args, desc in links:
            ps.append("$l=$s.CreateShortcut(%s);$l.TargetPath=%s;$l.Arguments=%s;"
                      "$l.WorkingDirectory=%s;$l.IconLocation=%s;$l.Description=%s;$l.Save()"
                      % tuple(_q(v) for v in (p, exe, args, t, ico, desc)))
        r = _run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ";".join(ps)])
        if r.returncode != 0:
            self.log("Aviso: no se pudieron crear todos los accesos (%s)" % r.stderr.strip()[:200])

    def _register(self, t: Path):
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY) as k:
            def s(n, v):
                winreg.SetValueEx(k, n, 0, winreg.REG_SZ, v)
            s("DisplayName", "Cinema Reservas")
            s("DisplayVersion", _version())
            s("Publisher", "Cinema Productions")
            s("InstallLocation", str(t))
            s("DisplayIcon", str(t / "icono.ico"))
            s("UninstallString", '"%s" --uninstall' % (t / EXE_NAME))
            s("QuietUninstallString", '"%s" --uninstall' % (t / EXE_NAME))
            s("Comments", "Gestor de reservas de eventos")
            s("URLInfoAbout", RELEASES_URL)
            s("URLUpdateInfo", RELEASES_URL + "/releases/latest")
            s("HelpLink", RELEASES_URL)
            s("InstallDate", time.strftime("%Y%m%d"))
            winreg.SetValueEx(k, "NoModify", 0, winreg.REG_DWORD, 1)
            winreg.SetValueEx(k, "NoRepair", 0, winreg.REG_DWORD, 1)
            try:   # tamaño que muestra Windows en "Aplicaciones instaladas" (KB)
                kb = sum(f.stat().st_size for f in t.rglob("*") if f.is_file()) // 1024
                winreg.SetValueEx(k, "EstimatedSize", 0, winreg.REG_DWORD, int(min(kb, 0xFFFFFFFF)))
            except Exception:
                pass


class Installer(QThread):
    """Envoltura Qt de InstallJob (interfaz de respaldo)."""
    step = Signal(int)
    progress = Signal(float)
    log = Signal(str)
    finished_ok = Signal(bool, str)

    def __init__(self, target: Path):
        super().__init__()
        self.target = target

    def run(self):
        InstallJob(self.target, self.step.emit, self.progress.emit, self.log.emit,
                   self.finished_ok.emit).run()


# ─────────────────────────── UI web (WebView2) ─────────────────────────
class SetupApi:
    """Funciones que la pagina ui_web llama con window.pywebview.api.<nombre>()."""

    def __init__(self):
        self._win = None
        self._busy = False
        self._target = install_dir()

    def init(self):
        return {"view": "setup", "version": _version(), "path": str(self._target), "steps": STEPS,
                "installed": installed_version(self._target),
                "needMB": space_needed_mb(), "freeMB": free_space_mb(self._target),
                # --auto: lo abre la propia app al actualizarse; empieza sin pedir clic
                "autoStart": "--auto" in sys.argv, "desktopExists": desktop_shortcut_exists()}

    def install(self, options=None):
        if self._busy:
            return False
        self._busy = True
        w = self._win
        opts = dict(options or {})

        def done(ok: bool, err: str):
            self._busy = False
            w.push(phase="done" if ok else "error", error=(err or "")[:400],
                   autoOpen=bool(ok and opts.get("open")))
            if ok and opts.get("open"):
                threading.Timer(1.6, self.open_app).start()   # "Abrir al terminar"

        last = {"t": 0.0, "v": -1.0}

        def progress(v: float):        # limita envios durante la extraccion, sin perder saltos
            now = time.monotonic()
            if now - last["t"] >= 0.05 or abs(v - last["v"]) >= 3 or v >= 100:
                last.update(t=now, v=v)
                w.push(pct=v)

        job = InstallJob(self._target, lambda i: w.push(step=i), progress,
                         lambda s: w.push(log=s), done, options={"desktop": opts.get("desktop", True)})
        threading.Thread(target=job.run, daemon=True).start()
        return True

    def open_app(self):
        subprocess.Popen([str(self._target / EXE_NAME)], cwd=str(self._target), env=_app_env(),
                         creationflags=NO_WINDOW | 0x00000008)
        self._win.close()

    def minimize(self):
        self._win.minimize()

    def close(self):
        if not self._busy:
            self._win.close()


def run_web() -> None:
    import webui
    api = SetupApi()
    api._win = webui.Window(api, "setup", 920, 640, "Instalar Cinema Reservas")
    api._win.can_close = lambda: not api._busy
    api._win.w.events.shown += lambda *_: close_splash()    # la ventana ya se ve: quitar la imagen
    webui.start()


# ─────────────────────────────── UI ────────────────────────────────
class SetupWindow(Frameless):
    HERO = 262

    def __init__(self):
        super().__init__()
        self.setFixedSize(W, H)
        self.drag_height = self.HERO
        self.version = _version()
        self.target = install_dir()
        self.cur_step = -1
        self.pct = 0.0
        self.shown_pct = 0.0
        self.done = False
        self.worker = None
        self._logo = QPixmap(str(res_path("logo.png"))) if res_path("logo.png").exists() else QPixmap()
        self._build()
        self.center()
        self._tm = QTimer(self)
        self._tm.timeout.connect(self._tick)
        self._tm.start(16)

    # fondo: hero cinematografico + cuerpo oscuro
    def paint_bg(self, p: QPainter, r: QRectF):
        p.fillRect(r, QColor("#081821"))
        hero = QRectF(0, 0, r.width(), self.HERO + 60)
        g = QLinearGradient(hero.topLeft(), hero.bottomRight())
        g.setColorAt(0, QColor("#06222c"))
        g.setColorAt(0.5, QColor("#12303a"))
        g.setColorAt(1, QColor("#3c2f2a"))
        p.fillRect(hero, g)
        paint_bokeh(p, QRectF(380, 0, 520, self.HERO), 11, ["#7fe3ee", "#f1c28a", "#ffffff", "#e8a07a"], 30)
        fade = QLinearGradient(0, self.HERO - 90, 0, self.HERO + 60)
        fade.setColorAt(0, QColor(8, 24, 33, 0))
        fade.setColorAt(1, QColor("#081821"))
        p.fillRect(QRectF(0, self.HERO - 90, r.width(), 150), fade)
        # divisor vertical
        p.setPen(QColor(255, 255, 255, 22))
        p.drawLine(int(W * 0.5) - 28, self.HERO + 30, int(W * 0.5) - 28, H - 40)
        # chip
        chip = QRectF(48, 224, 330, 30)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(8, 70, 85, 190))
        p.drawRoundedRect(chip, 4, 4)
        p.setPen(QColor("#4de3f2"))
        p.setFont(font(10, QFont.Weight.Bold))
        p.drawText(chip, Qt.AlignmentFlag.AlignCenter,
                   "v%s  ·  todo incluido  ·  no necesita internet" % self.version)
        if not self._logo.isNull():
            p.drawPixmap(QRectF(48, 38, 56, 56).toRect(),
                         self._logo.scaled(56, 56, Qt.AspectRatioMode.KeepAspectRatio,
                                           Qt.TransformationMode.SmoothTransformation))

    def _lbl(self, text, size, weight=QFont.Weight.Normal, color="#e8f1f4", geo=None, wrap=False,
             align=None):
        l = QLabel(text, self)
        l.setFont(font(size, weight))
        l.setStyleSheet("color:%s;background:transparent;" % color)
        l.setWordWrap(wrap)
        if geo:
            l.setGeometry(*geo)
        if align:
            l.setAlignment(align)
        return l

    def _build(self):
        self._lbl("CINEMA", 21, QFont.Weight.Black, "#ffffff", (116, 44, 130, 40))
        self._lbl("PRODUCTIONS", 13, QFont.Weight.Black, "#ffffff", (116, 66, 160, 30))
        self._lbl("Instalar Cinema Reservas", 31, QFont.Weight.Bold, "#ffffff", (46, 118, 620, 58))
        self._lbl("Gestor de reservas de eventos, 100% local en tu PC", 13.5, QFont.Weight.Normal,
                  "#d6e4e8", (48, 178, 620, 30))

        pin = RoundWinButton("pin", "#2fb6b2", self)
        mn = RoundWinButton("min", "#6f8bff", self)
        mx = RoundWinButton("max", "#4fd08a", self)
        cl = RoundWinButton("close", "#f26b5e", self)
        for i, b in enumerate((pin, mn, mx, cl)):
            b.move(W - 44 * 4 - 19 * 3 - 36 + i * 63, 28)
        pin.clicked.connect(self._toggle_pin)
        mn.clicked.connect(self.showMinimized)
        mx.setEnabled(False)
        cl.clicked.connect(self._close)
        self._pinbtn = pin

        self._lbl("PASOS", 10.5, QFont.Weight.DemiBold, "#8fa4ab", (52, 296, 200, 22))
        self.step_lbls = []
        for i, s in enumerate(STEPS):
            l = self._lbl("", 11.5, QFont.Weight.Normal, "#8fa4ab", (52, 332 + i * 44, 360, 30))
            self.step_lbls.append(l)
        self._paint_steps()

        rx, rw = int(W * 0.5) + 6, W - int(W * 0.5) - 6 - 48
        self.title = self._lbl("Todo listo para instalar", 17, QFont.Weight.Bold, "#ffffff",
                               (rx, 296, rw, 36))
        self.track = QWidget(self)
        self.track.setGeometry(rx, 372, rw, 20)
        self.track.setStyleSheet("background:#1d3340;border-radius:10px;")
        self.fill = QWidget(self.track)
        self.fill.setGeometry(0, 0, 0, 20)
        self.fill.setStyleSheet("background:qlineargradient(x1:0,y1:0,x2:1,y2:0,stop:0 %s,stop:1 %s);"
                                "border-radius:10px;" % (TEAL, "#4de3f2"))
        self.info = self._lbl("Se instala en tu usuario (AppData\\Local\\CinemaProductions) con Python y todas las "
                              "librerias incluidas. No pide permisos de administrador y tus datos se "
                              "conservan al actualizar.", 11, QFont.Weight.Normal, "#a9b9be", (rx, 410, rw, 74), wrap=True)
        self.info.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        self.btn = GradientButton("INSTALAR", TEAL, BRONZE, self, 74)
        self.btn.setGeometry(rx, 494, rw, 74)
        self.btn.clicked.connect(self._on_button)
        self.det_btn = QPushButton("Ver detalles", self)
        self.det_btn.setGeometry(rx, 580, 140, 28)
        self.det_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.det_btn.setStyleSheet("QPushButton{background:transparent;color:#8fa4ab;border:none;text-align:left;"
                                   "font-size:13px;}QPushButton:hover{color:#fff;}")
        self.det_btn.clicked.connect(self._toggle_details)
        self.details = QPlainTextEdit(self)
        self.details.setReadOnly(True)
        self.details.setGeometry(rx, 296, rw, 270)
        self.details.setFont(font(9, QFont.Weight.Normal, "Consolas"))
        self.details.setStyleSheet("QPlainTextEdit{background:#06141b;color:#9fc3cb;border:1px solid #1d3340;"
                                   "border-radius:10px;padding:8px;}")
        self.details.hide()
        self._lbl("Cinema Productions", 10.5, QFont.Weight.Normal, "#516870", (52, 604, 260, 22))

    # ── interaccion ──────────────────────────────────────────────
    def _toggle_pin(self):
        on = not bool(self.windowFlags() & Qt.WindowType.WindowStaysOnTopHint)
        self.setWindowFlag(Qt.WindowType.WindowStaysOnTopHint, on)
        self.show()
        self._pinbtn.set_pinned(on)

    def _toggle_details(self):
        vis = not self.details.isVisible()
        self.details.setVisible(vis)
        for w in (self.title, self.track, self.info, self.btn):
            w.setVisible(not vis)
        self.det_btn.setText("Ocultar detalles" if vis else "Ver detalles")
        self.det_btn.raise_()

    def _close(self):
        if self.worker is not None and self.worker.isRunning():
            return
        self.close()

    def _paint_steps(self):
        for i, l in enumerate(self.step_lbls):
            if self.done or i < self.cur_step:
                l.setText("✓   " + STEPS[i])
                l.setStyleSheet("color:#4fd08a;background:transparent;")
            elif i == self.cur_step:
                l.setText(">   " + STEPS[i])
                l.setStyleSheet("color:#4de3f2;background:transparent;")
            else:
                l.setText("·   " + STEPS[i])
                l.setStyleSheet("color:#8fa4ab;background:transparent;")

    def _on_button(self):
        if self.done:
            exe = self.target / EXE_NAME
            subprocess.Popen([str(exe)], cwd=str(self.target), env=_app_env(), creationflags=NO_WINDOW | 0x00000008)
            self.close()
            return
        if self.worker is not None:
            return
        self.btn.setEnabled(False)
        self.btn.setText("INSTALANDO...")
        self.title.setText("Preparando la instalacion...")
        self.worker = Installer(self.target)
        self.worker.step.connect(self._on_step)
        self.worker.progress.connect(lambda v: setattr(self, "pct", v))
        self.worker.log.connect(lambda s: self.details.appendPlainText(s))
        self.worker.finished_ok.connect(self._on_done)
        self.worker.start()

    def _on_step(self, i: int):
        self.cur_step = i
        self.title.setText(STEPS[i].split(" (")[0] + "...")
        self._paint_steps()

    def _on_done(self, ok: bool, err: str):
        self.worker = None
        if ok:
            self.done = True
            self.pct = 100
            self._paint_steps()
            self.title.setText("¡Instalacion completa!")
            self.info.setText("Cinema Reservas ya esta en tu escritorio y en el menu Inicio. "
                              "Al abrirlo por primera vez te pedira activar tu licencia "
                              "(la clave llega por correo al comprar en Gumroad).")
            self.btn.setText("ABRIR CINEMA RESERVAS")
            self.btn.setEnabled(True)
            if "--auto" in sys.argv:              # actualizacion automatica: reabrir la app
                QTimer.singleShot(1500, self._on_button)
        else:
            self.title.setText("No se pudo instalar")
            self.info.setText("%s\n\nRevisa «Ver detalles» y vuelve a intentarlo." % err[:300])
            self.info.setStyleSheet("color:#ff8f8f;background:transparent;")
            self.btn.setText("REINTENTAR")
            self.btn.setEnabled(True)

    def _tick(self):
        self.shown_pct += (self.pct - self.shown_pct) * 0.12
        if abs(self.pct - self.shown_pct) < 0.1:
            self.shown_pct = self.pct
        w = int(self.track.width() * self.shown_pct / 100)
        self.fill.setFixedWidth(max(0, w) if w > 0 else 0)
        self.fill.setVisible(w > 4)


def main():
    try:
        import webui
        if webui.available():
            run_web()
            return
    except Exception:
        traceback.print_exc()          # sin WebView2 / error: interfaz Qt de respaldo
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    win = SetupWindow()
    win.show()
    close_splash()
    if "--auto" in sys.argv:                      # actualizacion desde la app: empezar sola
        QTimer.singleShot(800, win._on_button)
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
