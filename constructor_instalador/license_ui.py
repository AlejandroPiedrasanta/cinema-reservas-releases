"""Ventana 'Activa tu licencia' (misma estetica que CineSlide)."""
from __future__ import annotations

import webbrowser

from PySide6.QtCore import QPointF, QRectF, Qt, QThread, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QLinearGradient, QPainter, QPen, QRadialGradient
from PySide6.QtWidgets import (QApplication, QHBoxLayout, QLabel, QLineEdit, QPushButton,
                               QVBoxLayout, QWidget)

import license_core as lic
from ui_common import (APP_TITLE, Frameless, GradientButton, RoundWinButton, font, paint_bokeh)

W, H = 940, 600
LEFT_W = 350
PINK, GOLD = "#e0289f", "#e3b95a"


class _Worker(QThread):
    done = Signal(object)

    def __init__(self, key: str):
        super().__init__()
        self.key = key

    def run(self):
        try:
            self.done.emit(lic.activate(self.key))
        except Exception as e:  # red/JSON inesperado
            self.done.emit(lic.Status(False, "Error inesperado: %s" % e))


class LicenseDialog(Frameless):
    activated = Signal()
    exited = Signal()

    def __init__(self, version: str = "", reason: str = ""):
        super().__init__()
        self.version = version
        self.setFixedSize(W, H)
        self.drag_height = 90
        self._worker = None
        self._ok = False
        self._build(reason)
        self.center()

    # ── fondo ────────────────────────────────────────────────────
    def paint_bg(self, p: QPainter, r: QRectF):
        p.fillRect(r, QColor("#090c14"))
        left = QRectF(0, 0, LEFT_W, r.height())
        g = QLinearGradient(left.topLeft(), left.bottomRight())
        g.setColorAt(0.0, QColor("#7c1b6c"))
        g.setColorAt(0.55, QColor("#3a1238"))
        g.setColorAt(1.0, QColor("#5a2a62"))
        p.fillRect(left, g)
        paint_bokeh(p, left, 7, ["#ff63c4", "#f2c36b", "#b46cff"], 16)
        # halo y llave
        cx, cy = LEFT_W / 2, 210
        halo = QRadialGradient(QPointF(cx, cy), 120)
        halo.setColorAt(0, QColor(230, 40, 159, 90))
        halo.setColorAt(1, QColor(230, 40, 159, 0))
        p.setBrush(halo)
        p.setPen(Qt.PenStyle.NoPen)
        p.drawEllipse(QPointF(cx, cy), 120, 120)
        p.setPen(QPen(QColor(230, 60, 170, 200), 3))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawEllipse(QPointF(cx, cy), 98, 98)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor("#0b0d16"))
        p.drawEllipse(QPointF(cx, cy), 84, 84)
        # llave
        p.setPen(QPen(QColor("#ffd978"), 7, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap, Qt.PenJoinStyle.RoundJoin))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawEllipse(QPointF(cx + 14, cy - 18), 22, 22)
        p.drawLine(QPointF(cx - 2, cy - 2), QPointF(cx - 40, cy + 38))
        p.drawLine(QPointF(cx - 24, cy + 22), QPointF(cx - 12, cy + 34))
        p.drawLine(QPointF(cx - 36, cy + 34), QPointF(cx - 26, cy + 44))
        # separador sutil
        p.setPen(QPen(QColor(200, 80, 180, 90), 1))
        p.drawLine(LEFT_W, 0, LEFT_W, int(r.height()))

    # ── UI ───────────────────────────────────────────────────────
    def _lbl(self, parent, text, size, weight=QFont.Weight.Normal, color="#f2f2fa", wrap=False):
        l = QLabel(text, parent)
        l.setFont(font(size, weight))
        l.setStyleSheet("color:%s; background:transparent;" % color)
        l.setWordWrap(wrap)
        return l

    def _build(self, reason: str):
        # --- panel izquierdo
        t = self._lbl(self, APP_TITLE, 24, QFont.Weight.Bold)
        t.setGeometry(0, 318, LEFT_W, 40)
        t.setAlignment(Qt.AlignmentFlag.AlignCenter)
        sub = self._lbl(self, "L I C E N C I A   ·   v%s" % (self.version or "1.0"), 8.5,
                        QFont.Weight.DemiBold, "#d654ae")
        sub.setGeometry(0, 362, LEFT_W, 22)
        sub.setAlignment(Qt.AlignmentFlag.AlignCenter)
        feats = ["Reservas de eventos ilimitadas", "Licencia perpetua, sin mensualidades",
                 "Datos 100% locales con respaldos"]
        for i, txt in enumerate(feats):
            y = 458 + i * 44
            dot = QLabel("✓", self)
            dot.setGeometry(32, y, 30, 30)
            dot.setAlignment(Qt.AlignmentFlag.AlignCenter)
            dot.setFont(font(11, QFont.Weight.Bold))
            dot.setStyleSheet("color:#ff6fcd; background:rgba(230,40,159,.22); border-radius:15px;")
            l = self._lbl(self, txt, 11, QFont.Weight.Medium if hasattr(QFont.Weight, "Medium") else QFont.Weight.Normal,
                          "#ece6f4")
            l.setGeometry(74, y - 2, LEFT_W - 90, 34)

        # --- cerrar
        close = RoundWinButton("close", "#f26b5e", self)
        close.setFixedSize(44, 44)
        close.move(W - 66, 28)
        close.clicked.connect(self._exit)

        x0, wR = LEFT_W + 52, W - LEFT_W - 52 - 52
        title = self._lbl(self, "Activa tu licencia", 27, QFont.Weight.Bold)
        title.setGeometry(x0, 56, wR - 60, 48)
        info = self._lbl(self, "Pega la clave que te llegó por correo al comprar. "
                               "Se activa en esta computadora en segundos.", 11, QFont.Weight.Normal,
                         "#a7acc2", wrap=True)
        info.setGeometry(x0, 108, wR, 52)

        k = self._lbl(self, "C L A V E   D E   L I C E N C I A", 8.5, QFont.Weight.DemiBold, "#7a8099")
        k.setGeometry(x0, 190, wR, 20)
        self.edit = QLineEdit(self)
        self.edit.setGeometry(x0, 218, wR, 62)
        self.edit.setPlaceholderText("XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX")
        self.edit.setFont(font(12.5, QFont.Weight.Normal, "Consolas"))
        self.edit.setStyleSheet(
            "QLineEdit{background:#0c1019;color:#eef;border:1px solid #232a3b;border-radius:12px;padding:0 20px;"
            "selection-background-color:#b22b8d;}QLineEdit:focus{border:1px solid #c33a9e;}")
        self.edit.returnPressed.connect(self._go)

        self.btn = GradientButton("   Activar licencia", PINK, GOLD, self, 64)
        self.btn.setFont(font(13, QFont.Weight.Bold))
        self.btn.setGeometry(x0, 306, wR, 64)
        self.btn.clicked.connect(self._go)

        self.msg = self._lbl(self, reason, 10.5, QFont.Weight.Normal, "#ff8f8f", wrap=True)
        self.msg.setGeometry(x0, 384, wR, 70)
        self.msg.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)

        line = QWidget(self)
        line.setGeometry(x0, 470, wR, 1)
        line.setStyleSheet("background:#1b2131;")

        q = self._lbl(self, "¿Aún no tienes licencia?", 11.5, QFont.Weight.DemiBold)
        q.setGeometry(x0, 492, 300, 30)
        buy = QPushButton("🛒  Comprar licencia", self)
        buy.setGeometry(W - 52 - 240, 484, 240, 46)
        buy.setCursor(Qt.CursorShape.PointingHandCursor)
        buy.setFont(font(11, QFont.Weight.DemiBold))
        buy.setStyleSheet("QPushButton{background:#0e131d;color:#f1f1f8;border:1px solid #2a3145;border-radius:10px;}"
                          "QPushButton:hover{border-color:#c33a9e;background:#141a28;}")
        buy.clicked.connect(lambda: webbrowser.open(lic.buy_url()))
        n = self._lbl(self, "Tu clave de licencia te llega por correo al comprar en Gumroad.", 9.5,
                      QFont.Weight.Normal, "#5f667e")
        n.setGeometry(x0, 530, wR, 22)

        mid = self._lbl(self, "ID del equipo   ·   %s" % lic.machine_id(), 10, QFont.Weight.Medium
                        if hasattr(QFont.Weight, "Medium") else QFont.Weight.Normal, "#9aa0b8")
        mid.setGeometry(x0, 556, 330, 30)
        mid.setStyleSheet("color:#9aa0b8;background:#0c1019;border:1px solid #1d2435;border-radius:10px;padding-left:14px;")
        self._mid_text = lic.machine_id()
        cp = QPushButton("⧉", self)
        cp.setGeometry(x0 + 342, 556, 40, 30)
        cp.setCursor(Qt.CursorShape.PointingHandCursor)
        cp.setToolTip("Copiar ID del equipo")
        cp.setStyleSheet("QPushButton{background:#0c1019;color:#cfd3e6;border:1px solid #1d2435;border-radius:10px;font-size:14px;}"
                         "QPushButton:hover{border-color:#c33a9e;}")
        cp.clicked.connect(lambda: (QApplication.clipboard().setText(self._mid_text),
                                    self._flash("ID copiado al portapapeles", "#7be3b0")))
        out = QPushButton("Salir", self)
        out.setGeometry(W - 52 - 80, 556, 80, 30)
        out.setCursor(Qt.CursorShape.PointingHandCursor)
        out.setStyleSheet("QPushButton{background:transparent;color:#8a90a8;border:none;font-size:13px;}"
                          "QPushButton:hover{color:#fff;}")
        out.clicked.connect(self._exit)
        self.edit.setFocus()

    # ── acciones ─────────────────────────────────────────────────
    def _flash(self, text, color="#ff8f8f"):
        self.msg.setStyleSheet("color:%s; background:transparent;" % color)
        self.msg.setText(text)

    def _go(self):
        if self._worker is not None:
            return
        if not self.edit.text().strip():
            self._flash("Escribe o pega tu clave de licencia.")
            self.edit.setFocus()
            return
        self.edit.setEnabled(False)
        self.btn.setEnabled(False)
        self.btn.setText("   Verificando…")
        self._flash("Verificando licencia…", "#a7acc2")
        self._worker = _Worker(self.edit.text())
        self._worker.done.connect(self._finished)
        self._worker.start()

    def _finished(self, st):
        self._worker = None
        self.btn.setEnabled(True)
        self.edit.setEnabled(True)
        self.btn.setText("   Activar licencia")
        if st.valid:
            self._ok = True
            self.btn.setEnabled(False)
            self.edit.setEnabled(False)
            done = ("✓  Licencia maestra activada. Bienvenido." if st.email == "Licencia maestra"
                    else "✓  Licencia activada. ¡Gracias por tu compra!")
            self._flash(done, "#7be3b0")
            QTimer.singleShot(900, self._accept)
        else:
            self._flash(st.reason or "No se pudo activar.")
            self.edit.setFocus()
            self.edit.selectAll()

    def _accept(self):
        self.activated.emit()
        self.close()

    def _exit(self):
        if not self._ok:
            self.exited.emit()
        self.close()


def ask_license(app: QApplication, version: str = "", reason: str = "") -> bool:
    """Muestra el dialogo y bloquea hasta activar (True) o salir (False)."""
    from PySide6.QtCore import QEventLoop
    dlg = LicenseDialog(version, reason)
    loop = QEventLoop()
    result = {"ok": False}
    dlg.activated.connect(lambda: result.update(ok=True))
    dlg.destroyed.connect(loop.quit)
    dlg.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
    dlg.show()
    loop.exec()
    return result["ok"]
