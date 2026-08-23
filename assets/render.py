#!/usr/bin/env python3
"""
Gera os icones e splashes do Captai a partir de assets/fundo-transparent.png.

O PNG de origem e o lockup completo (pin + "Captai+") sobre fundo transparente.
Duas artes saem dele:

  pin     -> apenas a marca. Vai para os icones: em 48px o texto seria ilegivel.
  lockup  -> pin + texto. Vai para as splashes, onde ha espaco de sobra.

O texto "Captai" e branco no arquivo de origem, por isso so aparece composto
sobre o roxo da marca (#1A0849) — nunca sobre fundo claro.

Uso: python3 assets/render.py
"""
import os
import shutil
from PIL import Image

BG = (0x1A, 0x08, 0x49)          # roxo da marca
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "fundo-transparent.png")

# Fracao da largura do lockup ocupada pelo simbolo para o icone do app.
# O lockup completo e usado no splash; o icone precisa de um recorte mais
# compacto para nao ficar ilegivel em tamanhos pequenos.
ICON_SPLIT = 460


def _trim(img):
    """Recorta a moldura transparente."""
    box = img.getchannel("A").getbbox()
    return img.crop(box) if box else img


def load_art():
    """Devolve (pin, lockup), ambos ja recortados e em RGBA."""
    lockup = _trim(Image.open(SRC).convert("RGBA"))
    pin = _trim(lockup.crop((0, 0, ICON_SPLIT, lockup.height)))
    return pin, lockup


def fit(art, size, ratio, canvas=None, bg=BG, alpha=False):
    """
    Centraliza `art` num canvas, ocupando `ratio` do lado menor.

    bg=None + alpha=True -> fundo transparente (foreground do adaptive icon).
    """
    W, H = canvas or (size, size)
    limit = min(W, H) * ratio
    scale = min(limit / art.width, limit / art.height)
    w, h = max(1, round(art.width * scale)), max(1, round(art.height * scale))
    art = art.resize((w, h), Image.LANCZOS)

    out = Image.new("RGBA", (W, H), (0, 0, 0, 0) if alpha else bg + (255,))
    out.alpha_composite(art, ((W - w) // 2, (H - h) // 2))
    return out


def save(img, path, rgba=True):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", optimize=True) if rgba else \
        img.convert("RGB").save(path, "PNG", optimize=True)
    return path


def monochrome(art, size, ratio):
    """
    Camada monochrome do adaptive icon (Android 13+): silhueta chapada branca,
    que o sistema recolore conforme o tema do usuario. Usa so o alfa da arte.
    """
    base = fit(art, size, ratio, alpha=True)
    a = base.getchannel("A")
    out = Image.new("RGBA", base.size, (255, 255, 255, 0))
    out.putalpha(a)
    white = Image.new("RGBA", base.size, (255, 255, 255, 255))
    white.putalpha(a)
    return white


def main():
    pin, lockup = load_art()

    # ---------------------------------------------------------- Android
    # Densidades do launcher. ic_launcher/_round sao os icones legados
    # (Android < 8); _foreground/_monochrome compoem o adaptive icon.
    dens = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    res = os.path.join(ROOT, "android", "app", "src", "main", "res")

    for d, px in dens.items():
        mip = os.path.join(res, f"mipmap-{d}")
        # Icone legado: pin sobre o roxo, ocupando 68% do quadro.
        save(fit(pin, px, 0.68), os.path.join(mip, "ic_launcher.png"))
        save(fit(pin, px, 0.68), os.path.join(mip, "ic_launcher_round.png"))
        # Adaptive: a arte vive na safe zone central (~66% de 108dp),
        # por isso o ratio menor — as bordas podem ser mascaradas.
        fg = round(px * 108 / 48)
        save(fit(pin, fg, 0.46, alpha=True),
             os.path.join(mip, "ic_launcher_foreground.png"))
        save(monochrome(pin, fg, 0.46),
             os.path.join(mip, "ic_launcher_monochrome.png"))

    # Splash Android: lockup centralizado. Portrait e landscape por densidade.
    # Em landscape o ratio e menor porque o lado limitante passa a ser a
    # altura — 0.82 ali estouraria a arte para fora da tela.
    splash = {
        "mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280),
        "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920),
    }
    for d, (w, h) in splash.items():
        port = fit(lockup, 0, 0.58, canvas=(w, h))
        land = fit(lockup, 0, 0.48, canvas=(h, w))
        save(port, os.path.join(res, f"drawable-port-{d}", "splash.png"), rgba=False)
        save(land, os.path.join(res, f"drawable-land-{d}", "splash.png"), rgba=False)

    # drawable/splash.png: fallback sem qualificador de densidade.
    save(fit(lockup, 0, 0.58, canvas=(480, 800)),
         os.path.join(res, "drawable", "splash.png"), rgba=False)

    # Android 12+: usa a marca completa como icone do splash para nao cortar
    # o texto no topo da inicializacao do sistema.
    save(fit(lockup, 1024, 0.70, alpha=True),
         os.path.join(res, "drawable", "splash_foreground.png"))

    # ---------------------------------------------------------- iOS
    ios = os.path.join(ROOT, "ios", "App", "App", "Assets.xcassets")
    # A App Store rejeita icone com alfa: gravado como RGB opaco.
    save(fit(pin, 1024, 0.68),
         os.path.join(ios, "AppIcon.appiconset", "AppIcon-512@2x.png"), rgba=False)

    # Splash universal 2732x2732: o iOS recorta esse quadrado para preencher
    # a tela, entao so a regiao central e garantida. O ratio fica abaixo do
    # usado no Android para a logo nao ser cortada em telas alongadas.
    sp = fit(lockup, 2732, 0.60)
    for name in ("splash-2732x2732.png", "splash-2732x2732-1.png",
                 "splash-2732x2732-2.png"):
        save(sp, os.path.join(ios, "Splash.imageset", name), rgba=False)

    # ------------------------------------------------- web (fallback shell)
    www = os.path.join(ROOT, "www")
    save(fit(lockup, 0, 0.86, canvas=(512, 178), alpha=True),
         os.path.join(www, "logo.png"))

    print("Assets gerados a partir de", os.path.relpath(SRC, ROOT))


if __name__ == "__main__":
    main()
