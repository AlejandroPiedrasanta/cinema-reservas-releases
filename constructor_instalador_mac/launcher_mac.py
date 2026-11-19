"""Cinema Reservas.app (macOS): licencia -> arranque del servidor -> ventana de la app.

Interfaz: la misma web que en Windows (ui_web + web_launcher.py) sobre WKWebView (Safari),
y la app se abre en su propia ventana de Mac. Si eso falla, vuelve a Qt + navegador.

Un solo ejecutable con cuatro modos:
  CinemaReservas             abre la app (pide licencia si falta)
  CinemaReservas --server    corre el servidor (app.py) dentro de este mismo ejecutable
  CinemaReservas --stop      cierra el servidor local
  CinemaReservas --selftest  comprueba que la interfaz web va incluida (lo usa build_mac.sh)

Los datos del cliente viven FUERA del .app, en
  ~/Library/Application Support/CinemaProductions/app
(reservas, respaldos, .env, certificado), asi que arrastrar una version nueva del
.app a Aplicaciones nunca los pisa.
"""
from __future__ import annotations

import os
import runpy
import shutil
import signal
import socket
import ssl
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

SUPPORT = Path.home() / "Library" / "Application Support" / "CinemaProductions"
APP_DIR = SUPPORT / "app"
PORT = 8001
BUNDLE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))


def port_open(timeout=0.4) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=timeout):
            return True
    except OSError:
        return False


def base_url() -> str:
    """El servidor usa HTTPS con certificado local si puede (ssl_bootstrap), si no HTTP."""
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname, ctx.verify_mode = False, ssl.CERT_NONE
        with socket.create_connection(("127.0.0.1", PORT), timeout=1.5) as s:
            with ctx.wrap_socket(s, server_hostname="localhost"):
                return "https://localhost:%d" % PORT
    except Exception:
        return "http://localhost:%d" % PORT


def version() -> str:
    try:
        return (BUNDLE / "version.txt").read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def ensure_app_files() -> None:
    """Copia app.py a la carpeta de datos (asi ROOT_DIR = esa carpeta) y crea el .env local."""
    APP_DIR.mkdir(parents=True, exist_ok=True)
    src = BUNDLE / "app_src" / "app.py"
    dst = APP_DIR / "app.py"
    if not dst.exists() or dst.read_bytes() != src.read_bytes():
        shutil.copy2(src, dst)
    env = APP_DIR / ".env"
    if not env.exists():
        env.write_text("# Cinema Reservas - base de datos local (sin internet).\n"
                       "# Para usar MongoDB propio: Ajustes > Base de Datos dentro de la app.\n"
                       "MONGO_URL=embedded\nDB_NAME=cinema_productions\n", encoding="utf-8")
    for d in ("backups", "uploads", "logs"):
        (APP_DIR / d).mkdir(exist_ok=True)


def run_server() -> int:
    ensure_app_files()
    os.chdir(APP_DIR)
    sys.path.insert(0, str(APP_DIR))
    sys.argv = [str(APP_DIR / "app.py")]
    runpy.run_path(str(APP_DIR / "app.py"), run_name="__main__")
    return 0


def stop_server() -> None:
    subprocess.run(["pkill", "-f", "CinemaReservas.*--server"], check=False)
    subprocess.run("lsof -ti tcp:%d | xargs kill 2>/dev/null" % PORT, shell=True, check=False)


def start_server(ui) -> None:
    """Arranca el servidor y avisa a la interfaz: ui.status(pct, titulo, detalle),
    ui.failed(titulo, detalle), ui.done() y, si existe, ui.open(url) (ventana propia)."""
    try:
        ensure_app_files()
    except Exception as e:
        ui.failed("No se pudo preparar la app", str(e))
        return
    ui.status(55, "Iniciando servidor…", "app.py")
    log = open(APP_DIR / "server_log.txt", "w", encoding="utf-8", errors="ignore")
    proc = subprocess.Popen([sys.executable, "--server"], cwd=str(APP_DIR), stdout=log,
                            stderr=subprocess.STDOUT, start_new_session=True,
                            env={**os.environ, "CP_NO_BROWSER": "1", "CP_MANAGED_INSTALL": "1"})
    for i in range(120):
        if port_open():
            url = base_url()
            opener = getattr(ui, "open", None)
            ui.status(100, "Abriendo Cinema Reservas…" if opener else "Abriendo en tu navegador…", url)
            time.sleep(0.2)
            (opener or webbrowser.open)(url)
            ui.status(100, "Cinema Reservas esta corriendo", "Puedes cerrar esta ventana")
            ui.done()
            return
        if proc.poll() is not None:
            tail = ""
            try:
                tail = (APP_DIR / "server_log.txt").read_text(encoding="utf-8", errors="ignore")[-400:]
            except Exception:
                pass
            if proc.returncode == 3:
                ui.failed("Licencia no valida", "Abre Cinema Reservas de nuevo para activarla.")
            else:
                ui.failed("El servidor se cerro al iniciar", tail or "Revisa server_log.txt")
            return
        ui.status(55 + i * 0.35, "", "esperando servidor (%ds)" % (i // 3 + 1))
        time.sleep(0.33)
    ui.failed("El servidor no respondio", "Revisa server_log.txt (¿puerto %d ocupado?)" % PORT)


# ── interfaz web (WKWebView) ─────────────────────────────────────────
def web_gui() -> int | None:
    """Flujo web comun con Windows. Devuelve None si no se puede usar (-> Qt)."""
    sys.path.insert(0, str(BUNDLE))
    try:
        import webui
        if not webui.available():
            return None
        import license_core as lic
        import web_launcher
    except Exception:
        return None
    if port_open():                                   # ya esta corriendo: abrir ventana
        return web_launcher.open_running(base_url(), stop_server)
    st = lic.check_local()
    if st.valid and lic.needs_recheck():
        threading.Thread(target=lic.recheck_online, daemon=True).start()
    return web_launcher.run("splash" if st.valid else "license", st.reason if st.key else "",
                            version=version, start_server=start_server, stop_server=stop_server)


def selftest() -> int:
    sys.path.insert(0, str(BUNDLE))
    import license_core  # noqa: F401
    import webui
    import webview  # noqa: F401
    import webview.platforms.cocoa  # noqa: F401
    ok = webui.available() and (BUNDLE / "ui_web" / "app.css").exists()
    print("interfaz web:", "OK" if ok else "FALTA")
    return 0 if ok else 1


# ── GUI Qt (respaldo) ────────────────────────────────────────────────
def gui() -> int:
    sys.path.insert(0, str(BUNDLE))
    from PySide6.QtCore import QRectF, Qt, QTimer, Signal
    from PySide6.QtGui import QColor, QFont, QLinearGradient, QPainter
    from PySide6.QtWidgets import QApplication, QLabel

    import license_core as lic
    from license_ui import ask_license
    from ui_common import Frameless, GradientButton, font, paint_bokeh

    TEAL, BRONZE = "#14808a", "#a97a4c"

    class Splash(Frameless):
        status = Signal(float, str, str)
        failed = Signal(str, str)
        done = Signal()

        def __init__(self):
            super().__init__()
            self.setFixedSize(600, 330)
            self.drag_height = 330
            self.pct = self.shown = 0.0
            self.bad = False
            self.t = QLabel("Iniciando…", self)
            self.t.setGeometry(0, 168, 600, 34)
            self.t.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.t.setFont(font(14, QFont.Weight.DemiBold))
            self.t.setStyleSheet("color:#fff;background:transparent;")
            self.d = QLabel("", self)
            self.d.setGeometry(40, 244, 520, 40)
            self.d.setWordWrap(True)
            self.d.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.d.setFont(font(9.5, QFont.Weight.Normal, "Consolas"))
            self.d.setStyleSheet("color:#8fa4ab;background:transparent;")
            self.retry = GradientButton("Reintentar", TEAL, BRONZE, self, 44)
            self.retry.setGeometry(220, 276, 160, 44)
            self.retry.hide()
            self.status.connect(self._status)
            self.failed.connect(self._failed)
            tm = QTimer(self)
            tm.timeout.connect(self._tick)
            tm.start(16)
            self.center()

        def paint_bg(self, p: QPainter, r: QRectF):
            g = QLinearGradient(r.topLeft(), r.bottomRight())
            g.setColorAt(0, QColor("#06222c"))
            g.setColorAt(1, QColor("#2c2926"))
            p.fillRect(r, g)
            paint_bokeh(p, r, 5, ["#7fe3ee", "#f1c28a", "#ffffff"], 18)
            p.setPen(QColor("#ffffff"))
            p.setFont(font(24, QFont.Weight.Black))
            p.drawText(QRectF(0, 40, r.width(), 44), Qt.AlignmentFlag.AlignCenter, "CINEMA RESERVAS")
            p.setPen(QColor("#8fa4ab"))
            p.setFont(font(9, QFont.Weight.DemiBold))
            p.drawText(QRectF(0, 86, r.width(), 22), Qt.AlignmentFlag.AlignCenter,
                       "G E S T O R   D E   R E S E R V A S")
            tr = QRectF(100, 218, 400, 10)
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QColor("#1d3340"))
            p.drawRoundedRect(tr, 5, 5)
            w = max(10.0, tr.width() * self.shown / 100)
            p.setBrush(QColor("#ff6b6b") if self.bad else QColor("#2bb9c4"))
            p.drawRoundedRect(QRectF(tr.left(), tr.top(), w, tr.height()), 5, 5)

        def _status(self, pct, title, detail):
            if pct >= 0:
                self.pct = pct
            if title:
                self.t.setText(title)
                self.t.setStyleSheet("color:#fff;background:transparent;")
            self.d.setText(detail[:160])

        def _failed(self, title, detail):
            self.bad, self.pct = True, 100
            self.t.setText(title)
            self.t.setStyleSheet("color:#ff8f8f;background:transparent;")
            self.d.setText(detail)
            self.retry.show()

        def _tick(self):
            self.shown += (self.pct - self.shown) * 0.15
            self.update()

    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    if port_open():                                   # ya esta corriendo: solo abrir
        webbrowser.open(base_url())
        return 0

    st = lic.check_local()
    if not st.valid:
        if not ask_license(app, version(), st.reason if st.key else ""):
            return 0
    elif lic.needs_recheck():
        threading.Thread(target=lic.recheck_online, daemon=True).start()

    from types import SimpleNamespace
    splash = Splash()
    splash.show()
    ui = SimpleNamespace(status=splash.status.emit, failed=splash.failed.emit, done=splash.done.emit)

    def go():
        splash.retry.hide()
        splash.bad = False
        splash.pct = splash.shown = 0
        ui.status(20, "Preparando…", "")
        threading.Thread(target=start_server, args=(ui,), daemon=True).start()

    splash.retry.clicked.connect(go)
    splash.done.connect(lambda: QTimer.singleShot(1500, app.quit))
    QTimer.singleShot(250, go)
    return app.exec()


def main() -> int:
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else ""
    if arg == "--server":
        return run_server()
    if arg == "--stop":
        stop_server()
        return 0
    if arg == "--selftest":
        return selftest()
    try:
        r = web_gui()
        if r is not None:
            return r
    except Exception:
        import traceback
        traceback.print_exc()                         # error en la interfaz web: Qt de respaldo
    return gui()


if __name__ == "__main__":
    sys.exit(main())
