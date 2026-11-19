"""Genera icon.icns y dmg_background.png (se pueden generar en Windows o Mac).

  python gen_assets.py            (requiere PySide6)
Salida en esta misma carpeta. Ya vienen generados; solo corre esto si cambias el icono.
"""
import struct
import sys
from pathlib import Path

from PySide6.QtCore import QBuffer, QIODevice, QPointF, QRectF, Qt
from PySide6.QtGui import (QColor, QFont, QGuiApplication, QImage, QLinearGradient, QPainter,
                           QPainterPath, QPen)

HERE = Path(__file__).resolve().parent
LOGO = HERE.parent / "app_servidor" / "build" / "logo.png"
app = QGuiApplication(sys.argv)


def png_bytes(img: QImage) -> bytes:
    b = QBuffer()
    b.open(QIODevice.OpenModeFlag.WriteOnly)
    img.save(b, "PNG")
    return bytes(b.data())


# ── icon.icns (frames PNG: ic07=128, ic08=256, ic09=512) ──
src = QImage(str(LOGO)).convertToFormat(QImage.Format.Format_ARGB32)
chunks = b""
for tag, size in ((b"ic07", 128), (b"ic08", 256), (b"ic09", 512)):
    data = png_bytes(src.scaled(size, size, Qt.AspectRatioMode.IgnoreAspectRatio,
                                Qt.TransformationMode.SmoothTransformation))
    chunks += tag + struct.pack(">I", len(data) + 8) + data
(HERE / "icon.icns").write_bytes(b"icns" + struct.pack(">I", len(chunks) + 8) + chunks)

# ── fondo del DMG (660x400 @1x y @2x) ──
def background(scale: int) -> QImage:
    W, H = 660 * scale, 400 * scale
    im = QImage(W, H, QImage.Format.Format_ARGB32)
    p = QPainter(im)
    p.setRenderHint(QPainter.RenderHint.Antialiasing)
    p.scale(scale, scale)
    g = QLinearGradient(0, 0, 660, 400)
    g.setColorAt(0, QColor("#06222c"))
    g.setColorAt(0.55, QColor("#12303a"))
    g.setColorAt(1, QColor("#3c2f2a"))
    p.fillRect(QRectF(0, 0, 660, 400), g)
    p.setPen(QColor("#ffffff"))
    f = QFont("Helvetica Neue")
    f.setPixelSize(30)
    f.setWeight(QFont.Weight.Bold)
    p.setFont(f)
    p.drawText(QRectF(0, 26, 660, 44), Qt.AlignmentFlag.AlignCenter, "Instalar Cinema Reservas")
    f.setPixelSize(14)
    f.setWeight(QFont.Weight.Normal)
    p.setFont(f)
    p.setPen(QColor("#a9c3ca"))
    p.drawText(QRectF(0, 72, 660, 24), Qt.AlignmentFlag.AlignCenter,
               "Arrastra el icono a la carpeta Aplicaciones")
    # flecha entre los dos iconos (app en x=180, Aplicaciones en x=480, y=200)
    pen = QPen(QColor("#4de3f2"), 5, Qt.PenStyle.SolidLine, Qt.PenCapStyle.RoundCap, Qt.PenJoinStyle.RoundJoin)
    p.setPen(pen)
    p.drawLine(QPointF(262, 205), QPointF(398, 205))
    path = QPainterPath()
    path.moveTo(382, 188)
    path.lineTo(400, 205)
    path.lineTo(382, 222)
    p.drawPath(path)
    f.setPixelSize(12)
    p.setFont(f)
    p.setPen(QColor("#6f8b93"))
    p.drawText(QRectF(0, 352, 660, 20), Qt.AlignmentFlag.AlignCenter,
               "Al abrirla por primera vez te pedira activar tu licencia (clave de Gumroad)")
    p.end()
    return im


background(1).save(str(HERE / "dmg_background.png"))
background(2).save(str(HERE / "dmg_background@2x.png"))
print("icon.icns, dmg_background.png, dmg_background@2x.png generados")
