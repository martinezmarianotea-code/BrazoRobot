"""Genera los íconos de la app (silueta de brazo robótico) en app/assets/.

    python scripts/make_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent.parent / "app" / "assets"
BG = (13, 15, 20, 255)        # #0D0F14
ACCENT = (0, 229, 255, 255)   # #00E5FF
WHITE = (255, 255, 255, 255)


def arm(size: int, color, bg=None, scale: float = 1.0) -> Image.Image:
    """Dibuja el brazo sobre un lienzo de 1000x1000 y lo reduce con antialias."""
    S = 1000
    img = Image.new("RGBA", (S, S), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def p(x, y):  # centra el dibujo (que ocupa x 240-780) y escala alrededor del centro
        return (500 + (x - 510) * scale, 500 + (y - 550) * scale)

    w = int(70 * scale)
    shoulder, elbow, wrist = p(390, 680), p(460, 400), p(680, 370)

    d.rounded_rectangle([*p(240, 750), *p(540, 810)], radius=int(20 * scale), fill=color)   # base
    d.pieslice([*p(300, 640), *p(480, 860)], 180, 360, fill=color)                          # torreta
    d.line([shoulder, elbow], fill=color, width=w)
    d.line([elbow, wrist], fill=color, width=w)
    for c, r in ((shoulder, 55), (elbow, 50), (wrist, 42)):
        d.ellipse([c[0] - r * scale, c[1] - r * scale, c[0] + r * scale, c[1] + r * scale], fill=color)
    # garra
    d.line([wrist, p(760, 290)], fill=color, width=int(w * 0.6))
    d.line([wrist, p(780, 430)], fill=color, width=int(w * 0.6))
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    arm(1024, ACCENT, BG).save(ASSETS / "icon.png")
    arm(1024, ACCENT).save(ASSETS / "splash-icon.png")
    arm(512, ACCENT, scale=0.62).save(ASSETS / "android-icon-foreground.png")
    Image.new("RGBA", (512, 512), BG).save(ASSETS / "android-icon-background.png")
    arm(432, WHITE, scale=0.62).save(ASSETS / "android-icon-monochrome.png")
    arm(48, ACCENT, BG).save(ASSETS / "favicon.png")
    print(f"Íconos escritos en {ASSETS}")


if __name__ == "__main__":
    main()
