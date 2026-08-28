#!/usr/bin/env python3
"""
Gera os icones e splashes do app a partir das artes em assets/.

  assets/logo-splash.png  -> splashes (logotipo completo)
  assets/logo-icon.png    -> icones, se existir

Sem logo-icon.png, o icone e derivado do proprio logo-splash: o simbolo e
isolado cortando no maior vao de colunas transparentes da arte. Em 48px o
texto de um logotipo vira borrao, por isso o icone nunca usa o lockup inteiro.

As artes devem ter fundo transparente; o roxo da marca (#1A0849) e composto
aqui. Logotipos de texto branco so funcionam sobre esse fundo escuro.

Uso: python3 assets/render.py
"""
import os
import shutil
from PIL import Image, ImageDraw, ImageFont

BG = (0x1A, 0x08, 0x49)          # roxo da marca

# Credito no rodape das splashes.
# Vazio: o app agora e o proprio Captai+, entao creditar a plataforma
# sob o seu proprio logotipo seria redundante. Preencher esta string
# volta a estampar o credito no rodape das splashes.
CREDIT = ""
CREDIT_COLOR = (0xFF, 0xFF, 0xFF)
CREDIT_ALPHA = 150               # discreto: nao compete com o logotipo
CREDIT_FONTS = (
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
SPLASH_SRC = os.path.join(ASSETS, "logo-splash.png")
ICON_SRC = os.path.join(ASSETS, "logo-icon.png")

# Largura minima de um vao de colunas transparentes, em fracao da largura da
# arte, para que ele conte como separador entre simbolo e texto. Espacos
# entre letras sao mais estreitos que isso e nao disparam o corte.
GAP_RATIO = 0.012


def _trim(img):
    """Recorta a moldura transparente."""
    box = img.getchannel("A").getbbox()
    return img.crop(box) if box else img


def _split_symbol(lockup):
    """
    Isola o simbolo a esquerda do logotipo, cortando no vao MAIS LARGO de
    colunas transparentes. Num lockup, o espaco que separa o simbolo do texto
    e sempre maior que os espacos entre letras — e usar o maior vao, em vez do
    primeiro acima de um limiar, mantem o corte correto quando a logo e
    trocada por outra de proporcao diferente.

    Sem vao interno (arte que ja e so o simbolo), devolve a arte inteira.
    """
    alpha = lockup.getchannel("A")
    px = alpha.load()
    w, h = lockup.size
    filled = [any(px[x, y] > 8 for y in range(h)) for x in range(w)]

    # Vaos internos: ignora as margens transparentes das pontas.
    gaps = []
    start = None
    for x in range(w):
        if not filled[x]:
            if start is None:
                start = x
        else:
            if start is not None and start > 0:
                gaps.append((x - start, start))
            start = None

    if not gaps:
        return lockup

    width, cut = max(gaps)
    # Um separador real e bem mais largo que o espacamento entre letras.
    if width < max(4, int(w * GAP_RATIO)):
        return lockup

    return _trim(lockup.crop((0, 0, cut, h)))


def load_art():
    """
    Devolve (icon_art, lockup), ambos recortados e em RGBA.

    lockup   -> logotipo completo, usado nas splashes.
    icon_art -> logo-icon.png quando existir; senao, o simbolo extraido.
    """
    lockup = _trim(Image.open(SPLASH_SRC).convert("RGBA"))

    if os.path.exists(ICON_SRC):
        return _trim(Image.open(ICON_SRC).convert("RGBA")), lockup

    return _split_symbol(lockup), lockup


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


def _credit_font(px):
    """Fonte do credito no tamanho pedido; cai no bitmap padrao se faltar."""
    for path in CREDIT_FONTS:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, px)
            except OSError:
                continue
    return ImageFont.load_default()


def add_credit(img, ratio=0.030, margin=0.055):
    """
    Escreve o credito centralizado no rodape.

    `ratio` e `margin` sao fracoes da menor dimensao do canvas, entao o texto
    mantem a mesma proporcao em todas as densidades e nas duas orientacoes.
    """
    if not CREDIT:
        return img

    base = min(img.size)
    font = _credit_font(max(9, round(base * ratio)))
    draw = ImageDraw.Draw(img)

    box = draw.textbbox((0, 0), CREDIT, font=font)
    x = (img.width - (box[2] - box[0])) // 2 - box[0]
    y = img.height - round(base * margin) - (box[3] - box[1]) - box[1]

    draw.text((x, y), CREDIT, font=font,
              fill=CREDIT_COLOR + (CREDIT_ALPHA,))
    return img


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
    icon_art, lockup = load_art()

    # ---------------------------------------------------------- Android
    # Densidades do launcher. ic_launcher/_round sao os icones legados
    # (Android < 8); _foreground/_monochrome compoem o adaptive icon.
    dens = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    res = os.path.join(ROOT, "android", "app", "src", "main", "res")

    for d, px in dens.items():
        mip = os.path.join(res, f"mipmap-{d}")
        # Icone legado: simbolo sobre o roxo, ocupando 68% do quadro.
        save(fit(icon_art, px, 0.68), os.path.join(mip, "ic_launcher.png"))
        save(fit(icon_art, px, 0.68), os.path.join(mip, "ic_launcher_round.png"))
        # Adaptive: a arte vive na safe zone central (~66% de 108dp),
        # por isso o ratio menor — as bordas podem ser mascaradas.
        fg = round(px * 108 / 48)
        save(fit(icon_art, fg, 0.46, alpha=True),
             os.path.join(mip, "ic_launcher_foreground.png"))
        save(monochrome(icon_art, fg, 0.46),
             os.path.join(mip, "ic_launcher_monochrome.png"))

    # Splash Android: lockup centralizado. Portrait e landscape por densidade.
    # Em landscape o ratio e menor porque o lado limitante passa a ser a
    # altura — 0.82 ali estouraria a arte para fora da tela.
    splash = {
        "mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280),
        "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920),
    }
    for d, (w, h) in splash.items():
        port = add_credit(fit(lockup, 0, 0.86, canvas=(w, h)))
        land = add_credit(fit(lockup, 0, 0.62, canvas=(h, w)))
        save(port, os.path.join(res, f"drawable-port-{d}", "splash.png"), rgba=False)
        save(land, os.path.join(res, f"drawable-land-{d}", "splash.png"), rgba=False)

    # drawable/splash.png: fallback sem qualificador de densidade.
    save(add_credit(fit(lockup, 0, 0.86, canvas=(480, 800))),
         os.path.join(res, "drawable", "splash.png"), rgba=False)

    # Android 12+: o sistema mascara windowSplashScreenAnimatedIcon num
    # CIRCULO e descarta tudo que sobra fora dele. Um lockup horizontal nao
    # cabe nesse recorte — as pontas (o "+" e a cauda do pin) somem. Por isso
    # aqui vai so o simbolo, e num ratio que respeita a safe zone: o icone
    # ocupa 240dp de um quadro de 288dp, e a arte precisa caber no circulo
    # inscrito nesses 240dp — dai o 0.58, que deixa margem ate a borda.
    save(fit(icon_art, 1024, 0.58, alpha=True),
         os.path.join(res, "drawable", "splash_foreground.png"))

    # ---------------------------------------------------------- iOS
    ios = os.path.join(ROOT, "ios", "App", "App", "Assets.xcassets")
    # A App Store rejeita icone com alfa: gravado como RGB opaco.
    save(fit(icon_art, 1024, 0.68),
         os.path.join(ios, "AppIcon.appiconset", "AppIcon-512@2x.png"), rgba=False)

    # Splash universal 2732x2732: o iOS faz aspectFill desse quadrado, entao
    # num aparelho retrato so a FAIXA CENTRAL sobrevive — as laterais saem da
    # tela. O caso mais estreito e o iPhone 15 Pro (1179x2556): sobram
    # 1179 / (2556/2732) = 1260px dos 2732, ou seja 46% da largura.
    #
    # `fit` mede o ratio contra o lado do quadrado, nao contra o que fica
    # visivel — por isso o ratio aqui e sobre 2732, mas o teto real e 0.46.
    # 0.40 deixa a logo em ~1093px, com 13% de folga ate a borda do corte.
    # Um lockup mais largo que 2.86:1 exige baixar esse numero de novo.
    #
    # A margem do credito e grande pelo mesmo motivo: o rodape do quadrado
    # fica fora da tela, e um credito colado na borda sumiria.
    sp = add_credit(fit(lockup, 2732, 0.40), ratio=0.019, margin=0.245)
    for name in ("splash-2732x2732.png", "splash-2732x2732-1.png",
                 "splash-2732x2732-2.png"):
        save(sp, os.path.join(ios, "Splash.imageset", name), rgba=False)

    # ------------------------------------------------- web (fallback shell)
    www = os.path.join(ROOT, "www")
    save(fit(lockup, 0, 0.86, canvas=(512, 178), alpha=True),
         os.path.join(www, "logo.png"))

    src = ICON_SRC if os.path.exists(ICON_SRC) else "simbolo extraido do logotipo"
    print("Splashes:", os.path.relpath(SPLASH_SRC, ROOT))
    print("Icones:  ", os.path.relpath(src, ROOT) if os.path.exists(ICON_SRC) else src)


if __name__ == "__main__":
    main()
