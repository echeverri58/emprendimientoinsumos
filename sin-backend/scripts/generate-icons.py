"""Genera los iconos PWA de la aplicación (sin-backend/public/).

Usa el Pillow incluido. Diseño: escudo esmeralda (#059669) con una palomita blanca
sobre fondo azul oscuro (#0F172A), coherente con la paleta de la app.
"""
from PIL import Image, ImageDraw
import os

BG = (15, 23, 42, 255)        # #0F172A
SHIELD = (5, 150, 105, 255)   # #059669
WHITE = (255, 255, 255, 255)


def draw_icon(size, opaque=False):
    mode = 'RGB' if opaque else 'RGBA'
    bg = BG[:3] if opaque else BG
    shield = SHIELD[:3] if opaque else SHIELD
    img = Image.new(mode, (size, size), bg)
    d = ImageDraw.Draw(img)
    s = size
    # Escudo de 5 puntos (borde superior plano, punta inferior).
    pts = [(-0.50, -0.42), (0.50, -0.42), (0.42, 0.05), (0.0, 0.55), (-0.42, 0.05)]
    poly = [(s * (0.5 + x), s * (0.5 + y)) for x, y in pts]
    d.polygon(poly, fill=shield)
    # Palomita (check).
    c = s / 2
    p1 = (c - 0.20 * s, c + 0.02 * s)
    p2 = (c - 0.04 * s, c + 0.16 * s)
    p3 = (c + 0.24 * s, c - 0.14 * s)
    white = WHITE[:3] if opaque else WHITE
    d.line([p1, p2, p3], fill=white, width=max(2, int(s * 0.09)), joint='curve')
    return img


os.makedirs('public', exist_ok=True)
targets = [
    ('icon-192.png', 192, False),
    ('icon-512.png', 512, False),
    ('apple-touch-icon.png', 180, True),  # iOS: opaco, sin canal alfa
]
for name, size, opaque in targets:
    draw_icon(size, opaque).save(os.path.join('public', name))
    print(f'generado public/{name} ({size}x{size})')
