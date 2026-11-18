"""Genereert de app-iconen (PNG) zonder externe libraries.

Gebruik:  python3 tools/make_icons.py
Schrijft icon-180.png, icon-192.png en icon-512.png in de projectmap.
"""
import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BG_TOP = (240, 152, 44)
BG_BOTTOM = (214, 112, 20)
EGG = (255, 247, 232)
EGG_SHADE = (245, 226, 196)
SHADOW = (150, 70, 0)


def mix(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))


def egg_inside(x, y, cx, cy, a, b):
    """Eivorm: onderkant breder dan bovenkant. y loopt naar beneden."""
    ny = (y - cy) / b
    if abs(ny) > 1:
        return False
    w = a * math.sqrt(1 - ny * ny) * (1 + 0.16 * ny)
    return abs(x - cx) <= w


def pixel(px, py, size):
    s = size
    t = py / s
    col = mix(BG_TOP, BG_BOTTOM, t)
    cx, cy = s * 0.5, s * 0.52
    a, b = s * 0.27, s * 0.34
    # zachte schaduw onder het ei
    sx, sy = (px - cx) / (a * 1.05), (py - (cy + b * 0.98)) / (s * 0.045)
    d = sx * sx + sy * sy
    if d < 1:
        col = mix(col, SHADOW, 0.35 * (1 - d))
    return col, egg_inside(px, py, cx, cy, a, b), (cx, cy, a, b)


def render(size):
    ss = 3
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0.0, 0.0, 0.0]
            for j in range(ss):
                for i in range(ss):
                    px = x + (i + 0.5) / ss
                    py = y + (j + 0.5) / ss
                    col, inside, (cx, cy, a, b) = pixel(px, py, size)
                    if inside:
                        # lichte schaduw rechtsonder op het ei
                        dx = (px - cx) / a
                        dy = (py - cy) / b
                        shade = max(0.0, min(1.0, (dx * 0.6 + dy * 0.8) * 0.9))
                        col = mix(EGG, EGG_SHADE, shade)
                        # glimlicht linksboven
                        hx, hy = (px - (cx - a * 0.38)) / (a * 0.16), (py - (cy - b * 0.42)) / (b * 0.2)
                        if hx * hx + hy * hy < 1:
                            col = mix(col, (255, 255, 255), 0.7)
                    for k in range(3):
                        acc[k] += col[k]
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
