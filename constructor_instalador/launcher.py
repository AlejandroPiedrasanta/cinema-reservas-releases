"""CinemaProductions.exe (instalado): licencia -> arranque del motor -> ventana de la app
(ventana propia de Windows con WebView2; sin WebView2, en el navegador).

  CinemaProductions.exe              abre la app (pide licencia si falta)
  CinemaProductions.exe --stop       cierra el servidor local
  CinemaProductions.exe --uninstall  desinstala (conserva datos si el cliente quiere)
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
import webbrowser
import winreg
from pathlib import Path

NO_WINDOW = 0x08000000
HOME = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
_prespawned = {"proc": None}


def _spawn_server():
    app_dir, py = HOME / "app", HOME / "python" / "pythonw.exe"
    if not py.exists() or not (app_dir / "app.py").exists():
        return None
    log = open(app_dir / "server_log.txt", "w", encoding="utf-8", errors="ignore")
    return subprocess.Popen([str(py), "app.py"], cwd=str(app_dir), stdout=log, stderr=subprocess.STDOUT,
                            creationflags=NO_WINDOW, env={**os.environ, "CP_NO_BROWSER": "1", "CP_MANAGED_INSTALL": "1"})


def _early_prespawn() -> None:
    """Rapidez: con licencia valida, el servidor arranca en cuanto se abre el programa,
    antes incluso de cargar Qt y la ventana (asi ambas cosas ocurren a la vez)."""
    if len(sys.argv) > 1 and sys.argv[1].lower() in ("--stop", "--uninstall"):
        return
    try:
        with socket.create_connection(("127.0.0.1", 8001), timeout=0.15):
            return                                    # ya esta corriendo
    except OSError:
        pass
    try:
        import license_core
        if not license_core.check_local().valid:
            return
        _prespawned["proc"] = _spawn_server()
    except Exception:
        _prespawned["proc"] = None


_early_prespawn()

from PySide6.QtCore import QRectF, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QLinearGradient, QPainter
from PySide6.QtWidgets import QApplication, QLabel, QMessageBox

import license_core as lic
from license_ui import ask_license
from ui_common import APP_TITLE, PORT, Frameless, GradientButton, font, paint_bokeh

UNINSTALL_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\CinemaReservas"
TEAL, BRONZE = "#14808a", "#a97a4c"


def port_open(timeout=0.4) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=timeout):
            return True
    except OSError:
        return False


def base_url() -> str:
    """El servidor usa HTTPS con certificado local si puede (ssl_bootstrap), si no HTTP."""
    import ssl
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
        return (HOME / "version.txt").read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def ps_quote(p) -> str:
    """Ruta como texto literal de PowerShell (aguanta apostrofes, p. ej. C:\\Users\\O'Brien)."""
    return "'" + str(p).replace("'", "''") + "'"


def _flush_server() -> None:
    """Pide al servidor que guarde todo en disco antes de detenerlo (max. ~3 s)."""
    if not port_open(0.2):
        return
    try:
        import ssl
        import urllib.request
        ctx = ssl._create_unverified_context()      # certificado local autofirmado
        for scheme in ("https", "http"):
            try:
                req = urllib.request.Request("%s://127.0.0.1:%d/api/system/flush" % (scheme, PORT),
                                             data=b"", method="POST")
                urllib.request.urlopen(req, timeout=3, context=ctx if scheme == "https" else None).read()
                return
            except Exception:
                continue
    except Exception:
        pass


def stop_server() -> None:
    _flush_server()
    ps = ("$h=%s;Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($h, "
          "[StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue"
          % ps_quote(str(HOME / "python") + "\\"))
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                   creationflags=NO_WINDOW)


# ── splash de arranque ───────────────────────────────────────────
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
        if detail is not None:
            self.d.setText(detail[:160])

    def _failed(self, title, detail):
        self.bad = True
        self.pct = 100
        self.t.setText(title)
        self.t.setStyleSheet("color:#ff8f8f;background:transparent;")
        self.d.setText(detail)
        self.retry.show()

    def _tick(self):
        self.shown += (self.pct - self.shown) * 0.15
        self.update()


def prespawn_server() -> None:
    """Rapidez: arranca el servidor YA, mientras se dibuja la pantalla de carga (antes se
    esperaba a que la pantalla terminara de cargar: ~1 s perdido en cada apertura)."""
    if _prespawned["proc"] is None and not port_open(0.15):
        try:
            _prespawned["proc"] = _spawn_server()
        except Exception:
            _prespawned["proc"] = None


def start_server(ui) -> None:
    app_dir, py = HOME / "app", HOME / "python" / "pythonw.exe"
    if not py.exists() or not (app_dir / "app.py").exists():
        ui.failed("Instalacion incompleta", "Vuelve a ejecutar el instalador de Cinema Reservas.")
        return
    ui.status(55, "Iniciando servidor…", "app.py")
    proc = _prespawned["proc"]
    _prespawned["proc"] = None                    # "Reintentar" vuelve a lanzarlo de cero
    if proc is None or (proc.poll() is not None and not port_open()):
        proc = _spawn_server()
    for i in range(330):                          # hasta ~35 s, mirando cada 0.1 s
        if port_open(0.25):
            url = base_url()
            opener = getattr(ui, "open", None)       # interfaz web: ventana propia de Windows
            ui.status(100, "Abriendo Cinema Reservas…" if opener else "Abriendo en tu navegador…", url)
            (opener or webbrowser.open)(url)
            ui.status(100, "Cinema Reservas esta corriendo", "Puedes cerrar esta ventana")
            ui.done()
            return
        if proc.poll() is not None:
            tail = ""
            try:
                tail = (app_dir / "server_log.txt").read_text(encoding="utf-8", errors="ignore")[-400:]
            except Exception:
                pass
            if proc.returncode == 3:
                ui.failed("Licencia no valida", "Abre Cinema Reservas de nuevo para activarla.")
            else:
                ui.failed("El servidor se cerro al iniciar", tail or "Revisa app\\server_log.txt")
            return
        ui.status(min(98, 55 + i * 0.15), None, "esperando servidor (%ds)" % (i // 10 + 1))
        time.sleep(0.1)
    ui.failed("El servidor no respondio", "Revisa app\\server_log.txt (¿puerto %d ocupado?)" % PORT)


# ── desinstalar ──────────────────────────────────────────────────
def _desktop() -> Path:
    """Escritorio real (puede estar en OneDrive), el mismo que usa el instalador."""
    try:
        import ctypes
        buf = ctypes.create_unicode_buffer(260)
        ctypes.windll.shell32.SHGetFolderPathW(0, 0x0000, 0, 0, buf)
        if buf.value:
            return Path(buf.value)
    except Exception:
        pass
    return Path(os.environ.get("USERPROFILE", "")) / "Desktop"


def do_uninstall(wipe: bool) -> bool:
    """Detiene el servidor y programa el borrado para cuando este proceso termine
    (el .exe esta en uso mientras corre, igual que el bootloader de PyInstaller)."""
    stop_server()
    start = Path(os.environ.get("APPDATA", "")) / "Microsoft/Windows/Start Menu/Programs/Cinema Reservas"
    paths = [_desktop() / "Cinema Reservas.lnk",
             Path(os.environ.get("USERPROFILE", "")) / "Desktop" / "Cinema Reservas.lnk",
             start, HOME / "python", HOME / Path(sys.executable).name, HOME / "_lanzador",
             HOME / "icono.ico", HOME / "version.txt"]
    paths += [HOME] if wipe else [HOME / "app" / "build", HOME / "ventana.json"]
    q = ps_quote
    me, parent, exe = os.getpid(), os.getppid(), str(Path(sys.executable).resolve())
    home = str(HOME) + "\\"
    # 1) espera a que cierre este proceso (y el bootloader de PyInstaller)
    # 2) cierra lo que siga abierto desde la carpeta: otra ventana de la app, el servidor
    #    y los procesos de WebView2 que usan su perfil (carpeta webview)
    # 3) borra, reintentando unos segundos por si algo tarda en soltar los archivos
    # 0) quita los recordatorios que Windows tenia programados para la app
    toasts = ("try{[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, "
              "ContentType = WindowsRuntime];$tn=[Windows.UI.Notifications.ToastNotificationManager]::"
              "CreateToastNotifier('CinemaProductions.CinemaReservas');"
              "foreach($s in @($tn.GetScheduledToastNotifications())){$tn.RemoveFromSchedule($s)};"
              "[Windows.UI.Notifications.ToastNotificationManager]::History.Clear('CinemaProductions.CinemaReservas')}catch{};")
    ps = toasts + ("$ids=@(%d);$p=Get-Process -Id %d -EA 0;if($p -and $p.Path -eq %s){$ids+=%d};"
          "Wait-Process -Id $ids -Timeout 90 -EA 0;"
          "$h=%s;Get-Process | ? { $_.Path -and $_.Path.StartsWith($h,[StringComparison]::OrdinalIgnoreCase) } "
          "| Stop-Process -Force -EA 0;"
          "Get-CimInstance Win32_Process -Filter \"Name='msedgewebview2.exe'\" -EA 0 | "
          "? { $_.CommandLine -and $_.CommandLine.IndexOf($h,[StringComparison]::OrdinalIgnoreCase) -ge 0 } | "
          "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA 0 };"
          "Start-Sleep -Milliseconds 800;$paths=@(%s);"
          "for($i=0;$i -lt 10;$i++){ $left=@($paths | ? { Test-Path -LiteralPath $_ }); if(-not $left){break};"
          " $left | ForEach-Object { Remove-Item -LiteralPath $_ -Recurse -Force -EA 0 }; Start-Sleep 1 }"
          % (me, parent, q(exe), parent, q(home), ",".join(q(p) for p in paths)))
    cmd = ["powershell", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps]
    # consola oculta (PowerShell no arranca con DETACHED_PROCESS) en su propio grupo
    detached = NO_WINDOW | 0x00000200            # CREATE_NO_WINDOW | NEW_PROCESS_GROUP
    try:    # BREAKAWAY_FROM_JOB: que no muera junto con este proceso si corre dentro de un "job"
        subprocess.Popen(cmd, creationflags=detached | 0x01000000)
    except OSError:
        subprocess.Popen(cmd, creationflags=detached)
    for key in (UNINSTALL_KEY, r"Software\Classes\AppUserModelId\CinemaProductions.CinemaReservas",
                r"Software\Classes\cinemareservas"):
        _delete_reg_tree(key)
    return True


def _delete_reg_tree(key: str) -> None:
    """Borra una clave de HKCU con todas sus subclaves (winreg.DeleteKey no es recursivo)."""
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
            subs = []
            i = 0
            while True:
                try:
                    subs.append(winreg.EnumKey(k, i))
                    i += 1
                except OSError:
                    break
        for sub in subs:
            _delete_reg_tree(key + "\\" + sub)
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, key)
    except OSError:
        pass


def uninstall(app: QApplication) -> int:
    box = QMessageBox(QMessageBox.Icon.Question, "Desinstalar Cinema Reservas",
                      "¿Desinstalar Cinema Reservas?\n\nTus reservas y respaldos (carpeta app) se pueden conservar.")
    keep = box.addButton("Desinstalar y conservar mis datos", QMessageBox.ButtonRole.AcceptRole)
    wipe = box.addButton("Desinstalar todo", QMessageBox.ButtonRole.DestructiveRole)
    box.addButton("Cancelar", QMessageBox.ButtonRole.RejectRole)
    box.exec()
    c = box.clickedButton()
    if c not in (keep, wipe):
        return 0
    do_uninstall(c is wipe)
    QMessageBox.information(None, "Cinema Reservas", "Cinema Reservas se desinstalo correctamente.")
    return 0


# ── interfaz web (WebView2): flujo comun con macOS en web_launcher.py ──
def run_web(view: str, reason: str = "") -> int:
    if view == "splash":
        prespawn_server()
    import web_launcher
    rc = web_launcher.run(view, reason, version=version, start_server=start_server,
                          stop_server=stop_server, do_uninstall=do_uninstall)
    if _prespawned["proc"] is not None:          # se cerro antes de usarlo: no dejarlo solo
        _prespawned["proc"] = None
        stop_server()
    return rc


def main() -> int:
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else ""
    if arg == "--stop":
        stop_server()
        return 0
    try:
        import webui
        web = webui.available()
    except Exception:
        web = False
    if web and arg != "--uninstall" and not webui.single_instance():
        webui.focus_app_window()              # ya hay uno abierto (o arrancando)
        return 0

    st = lic.check_local()
    if not st.valid and st.key and arg != "--uninstall":
        lic.recheck_online()                  # gracia vencida / licencia antigua: revalidar ya
        st = lic.check_local()
    elif st.valid and lic.needs_recheck():
        threading.Thread(target=lic.recheck_online, daemon=True).start()

    if arg != "--uninstall" and st.valid and port_open():   # ya esta corriendo: solo abrir
        if web:
            try:
                import web_launcher
                return web_launcher.open_running(base_url(), stop_server)
            except Exception:
                pass
        webbrowser.open(base_url())
        return 0
    if web:
        try:
            if arg == "--uninstall":
                return run_web("uninstall")
            return run_web("splash" if st.valid else "license", st.reason if st.key else "")
        except Exception:
            import traceback
            traceback.print_exc()          # sin WebView2 / error: interfaz Qt de respaldo
            st = lic.check_local()

    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    if arg == "--uninstall":
        return uninstall(app)

    if not st.valid:
        if not ask_license(app, version(), st.reason if st.key else ""):
            return 0

    from types import SimpleNamespace
    splash = Splash()
    splash.show()
    splash.setWindowOpacity(1.0)
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


if __name__ == "__main__":
    sys.exit(main())
