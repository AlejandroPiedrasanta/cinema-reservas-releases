"""Genera splash.png: la imagen que el instalador muestra AL INSTANTE mientras se prepara
(PyInstaller --splash). Mismo estilo que la interfaz web. Uso: py gen_splash.py"""
import sys
from pathlib import Path

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import (QColor, QFont, QGuiApplication, QImage, QLinearGradient, QPainter, QPainterPath,
                           QPen, QRadialGradient)

HERE = Path(__file__).resolve().parent
W, H = 560, 320
app = QGuiApplication(sys.argv)
img = QImage(W, H, QImage.Format.Format_RGB32)
p = QPainter(img)
p.setRenderHint(QPainter.RenderHint.Antialiasing)
p.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
p.fillRect(img.rect(), QColor("#0b0a10"))
for cx, cy, r, col in ((470, -40, 260, QColor(124, 58, 237, 110)), (330, -60, 200, QColor(245, 158, 123, 60)),
                       (40, 360, 240, QColor(109, 40, 217, 70))):
    g = QRadialGradient(QPointF(cx, cy), r)
    g.setColorAt(0, col)
    g.setColorAt(1, QColor(0, 0, 0, 0))
    p.fillRect(img.rect(), g)
p.setPen(QPen(QColor(255, 255, 255, 22), 1))
p.drawRect(QRectF(0.5, 0.5, W - 1, H - 1))
logo = QImage(str(HERE / "logo.png"))
if not logo.isNull():
    s = 84
    glow = QRadialGradient(QPointF(W / 2, 108), 80)
    glow.setColorAt(0, QColor(167, 139, 250, 120))
    glow.setColorAt(1, QColor(0, 0, 0, 0))
    p.fillRect(img.rect(), glow)
    path = QPainterPath()
    path.addRoundedRect(QRectF(W / 2 - s / 2, 108 - s / 2, s, s), 22, 22)
    p.setClipPath(path)
    p.drawImage(QRectF(W / 2 - s / 2, 108 - s / 2, s, s), logo)
    p.setClipping(False)
f = QFont("Segoe UI Variable Display", 22)
f.setWeight(QFont.Weight.DemiBold)
p.setFont(f)
p.setPen(QColor("#f5f3fa"))
p.drawText(QRectF(0, 166, W, 40), Qt.AlignmentFlag.AlignCenter, "Cinema Reservas")
f2 = QFont("Segoe UI Variable Text", 10)
p.setFont(f2)
p.setPen(QColor("#a39db3"))
p.drawText(QRectF(0, 206, W, 24), Qt.AlignmentFlag.AlignCenter, "Preparando el instalador…")
# barra decorativa
track = QRectF(W / 2 - 110, 248, 220, 4)
p.setPen(Qt.PenStyle.NoPen)
p.setBrush(QColor(255, 255, 255, 18))
p.drawRoundedRect(track, 2, 2)
g = QLinearGradient(track.topLeft(), track.topRight())
g.setColorAt(0, QColor("#7c3aed"))
g.setColorAt(0.6, QColor("#a78bfa"))
g.setColorAt(1, QColor("#f7c6a8"))
p.setBrush(g)
p.drawRoundedRect(QRectF(track.left(), track.top(), track.width() * 0.45, 4), 2, 2)
p.end()
img.save(str(HERE / "splash.png"))
print("splash.png", W, "x", H)
