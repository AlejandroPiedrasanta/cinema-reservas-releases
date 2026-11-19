"""Piezas visuales compartidas (instalador, activacion de licencia, launcher)."""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import (QBrush, QColor, QFont, QIcon, QLinearGradient, QPainter, QPainterPath,
                           QPen, QRadialGradient)
from PySide6.QtWidgets import QPushButton, QWidget

APP_TITLE = "Cinema Reservas"
PORT = 8001


def res_path(name: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / name


def app_icon() -> QIcon:
    p = res_path("icono.ico")
    return QIcon(str(p)) if p.exists() else QIcon()


_MAC = sys.platform == "darwin"
_FALLBACK = {"Segoe UI": ["Segoe UI", "SF Pro Text", "Helvetica Neue", "Arial"],
             "Consolas": ["Consolas", "Menlo", "Courier New"]}


def font(size: float, weight=QFont.Weight.Normal, family="Segoe UI") -> QFont:
    f = QFont(family)
    f.setFamilies(_FALLBACK.get(family, [family]))
    # macOS dibuja los puntos a 72 dpi (Windows 96): se escala para que se vea igual
    f.setPointSizeF(size * 1.333 if _MAC else size)
    f.setWeight(weight)
    return f


def paint_bokeh(p: QPainter, rect: QRectF, seed: int, tints: list[str], n: int = 26) -> None:
    """Circulos difusos tipo lente cinematografica."""
    rnd = random.Random(seed)
    for _ in range(n):
        r = rnd.uniform(6, 34)
        x = rnd.uniform(rect.left(), rect.right())
        y = rnd.uniform(rect.top(), rect.bottom())
        c = QColor(rnd.choice(tints))
        g = QRadialGradient(QPointF(x, y), r)
        c.setAlphaF(rnd.uniform(0.10, 0.30))
        g.setColorAt(0.0, c)
        c2 = QColor(c)
        c2.setAlphaF(0.0)
        g.setColorAt(1.0, c2)
        p.setBrush(QBrush(g))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawEllipse(QPointF(x, y), r, r)


class RoundWinButton(QPushButton):
    """Boton circular de ventana (fijar / minimizar / maximizar / cerrar)."""

    def __init__(self, kind: str, color: str, parent=None):
        super().__init__(parent)
        self.kind, self.color = kind, QColor(color)
        self.setFixedSize(44, 44)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self._pinned = False

    def set_pinned(self, v: bool):
        self._pinned = v
        self.update()

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        c = QColor(self.color)
        fill = QColor(c)
        fill.setAlphaF(0.30 if self.underMouse() or self._pinned else 0.14)
        p.setBrush(fill)
        p.setPen(QPen(c, 2))
        p.drawEllipse(QRectF(2, 2, 40, 40))
        p.setPen(QPen(c, 2, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap))
        p.setBrush(Qt.BrushStyle.NoBrush)
        k = self.kind
        if k == "min":
            p.drawLine(15, 22, 29, 22)
        elif k == "max":
            p.drawRoundedRect(QRectF(15, 15, 14, 14), 2, 2)
        elif k == "close":
            p.drawLine(16, 16, 28, 28)
            p.drawLine(28, 16, 16, 28)
        elif k == "pin":
            p.save()
            p.translate(22, 22)
            p.rotate(35)
            p.drawLine(0, -2, 0, 9)
            p.drawRoundedRect(QRectF(-4, -10, 8, 9), 2, 2)
            p.drawLine(-7, -1, 7, -1)
            p.restore()


class GradientButton(QPushButton):
    """Boton grande tipo pastilla con degradado horizontal."""

    def __init__(self, text: str, c1: str, c2: str, parent=None, height: int = 78):
        super().__init__(text, parent)
        self.c1, self.c2 = QColor(c1), QColor(c2)
        self.setFixedHeight(height)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.setFont(font(15, QFont.Weight.Bold))

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        r = QRectF(self.rect()).adjusted(1, 1, -1, -1)
        g = QLinearGradient(r.topLeft(), r.topRight())
        a, b = QColor(self.c1), QColor(self.c2)
        if not self.isEnabled():
            a, b = a.darker(160), b.darker(160)
        elif self.underMouse():
            a, b = a.lighter(112), b.lighter(112)
        g.setColorAt(0, a)
        g.setColorAt(1, b)
        path = QPainterPath()
        path.addRoundedRect(r, r.height() / 2, r.height() / 2)
        p.fillPath(path, g)
        hi = QLinearGradient(r.topLeft(), r.bottomLeft())
        hi.setColorAt(0, QColor(255, 255, 255, 55))
        hi.setColorAt(0.5, QColor(255, 255, 255, 0))
        p.fillPath(path, hi)
        p.setPen(QColor("#ffffff") if self.isEnabled() else QColor(255, 255, 255, 150))
        p.setFont(self.font())
        p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, self.text())


class Frameless(QWidget):
    """Ventana sin marco con esquinas redondeadas, arrastrable."""
    RADIUS = 26

    def __init__(self):
        super().__init__()
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Window)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowIcon(app_icon())
        self.setWindowTitle(APP_TITLE)
        self._drag = None
        self.drag_height = 140

    def paint_bg(self, p: QPainter, rect: QRectF) -> None:  # override
        p.fillRect(rect, QColor("#0a1118"))

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        path = QPainterPath()
        path.addRoundedRect(QRectF(self.rect()), self.RADIUS, self.RADIUS)
        p.setClipPath(path)
        self.paint_bg(p, QRectF(self.rect()))
        p.setClipping(False)
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.setPen(QPen(QColor(255, 255, 255, 28), 1))
        p.drawRoundedRect(QRectF(self.rect()).adjusted(0.5, 0.5, -0.5, -0.5), self.RADIUS, self.RADIUS)

    def mousePressEvent(self, e):
        if e.button() == Qt.MouseButton.LeftButton and e.position().y() < self.drag_height:
            h = self.windowHandle()
            if h is not None and h.startSystemMove():
                return
            self._drag = e.globalPosition().toPoint() - self.frameGeometry().topLeft()

    def mouseMoveEvent(self, e):
        if self._drag is not None and e.buttons() & Qt.MouseButton.LeftButton:
            self.move(e.globalPosition().toPoint() - self._drag)

    def mouseReleaseEvent(self, _):
        self._drag = None

    def center(self):
        scr = self.screen().availableGeometry()
        self.move(scr.center() - self.rect().center())


def lerp_color(a: str, b: str, t: float) -> QColor:
    ca, cb = QColor(a), QColor(b)
    return QColor(int(ca.red() + (cb.red() - ca.red()) * t),
                  int(ca.green() + (cb.green() - ca.green()) * t),
                  int(ca.blue() + (cb.blue() - ca.blue()) * t))


__all__ = ["APP_TITLE", "PORT", "res_path", "app_icon", "font", "paint_bokeh", "RoundWinButton",
           "GradientButton", "Frameless", "lerp_color", "math"]
