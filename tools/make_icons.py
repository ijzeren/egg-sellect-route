"""Genereert de app-iconen van Thuis (PNG) zonder externe libraries: een wit huis met een oranje hart op paars.

Gebruik:  python3 tools/make_icons.py
Schrijft icon-180.png, icon-192.png en icon-512.png in de projectmap.
Het icoon vult het hele vierkant (iOS en Android maken zelf de ronde hoeken); het huis blijft binnen de veilige
cirkel van 80%, zodat het ook als 'maskable' icoon op Android goed uitkomt.
"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BG_TOP = (103, 103, 222)     # paars, iets lichter boven
BG_BOTTOM = (77, 77, 198)
HOUSE = (255, 255, 255)
HEART = (232, 134, 42)       # oranje van Egg-sellent: daar begon het

# Huis in eenheden van het vierkant (0..1): dak met overstek, daaronder de muren.
ROOF = [(0.500, 0.200), (0.817, 0.467), (0.183, 0.467)]
WALLS = (0.250, 0.467, 0.750, 0.783)  # links, boven, rechts, onder
# Hart: (x² + y² − 1)³ − x²·y³ ≤ 0, geschaald en met de punt naar beneden.
HEART_CX, HEART_CY, HEART_S = 0.500, 0.612, 0.105


def mix(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))


def in_triangle(x, y, tri):
    (x1, y1), (x2, y2), (x3, y3) = tri
    d1 = (x - x2) * (y1 - y2) - (x1 - x2) * (y - y2)
    d2 = (x - x3) * (y2 - y3) - (x2 - x3) * (y - y3)
    d3 = (x - x1) * (y3 - y1) - (x3 - x1) * (y - y1)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def in_house(x, y):
    l, t, r, b = WALLS
    return (l <= x <= r and t <= y <= b) or in_triangle(x, y, ROOF)


def in_heart(x, y):
    hx = (x - HEART_CX) / HEART_S
    hy = (HEART_CY - y) / HEART_S
    q = hx * hx + hy * hy - 1
    return q * q * q - hx * hx * hy * hy * hy <= 0


def color(x, y):
    if in_heart(x, y):
        return HEART
    if in_house(x, y):
        return HOUSE
    return mix(BG_TOP, BG_BOTTOM, y)


def render(size):
    ss = 4  # 4×4 monsters per pixel voor gladde randen
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0.0, 0.0, 0.0]
            for j in range(ss):
                for i in range(ss):
                    c = color((px + (i + 0.5) / ss) / size, (py + (j + 0.5) / ss) / size)
                    for k in range(3):
                        acc[k] += c[k]
            n = ss * ss
            row += bytes(int(round(acc[k] / n)) for k in range(3))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    for size in (180, 192, 512):
        path = os.path.join(ROOT, f"icon-{size}.png")
        with open(path, "wb") as f:
            f.write(render(size))
        print("geschreven:", path)
