from pathlib import Path
from PIL import Image, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]


def prepare(name: str, crop: tuple[float, float, float, float], angle: float, color: float, contrast: float) -> None:
    path = ROOT / "assets" / name
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        width, height = image.size
        left, top, right, bottom = crop
        image = image.crop((int(width * left), int(height * top), int(width * (1 - right)), int(height * (1 - bottom))))
        image = image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False, fillcolor=(242, 240, 232))
        image = ImageEnhance.Color(image).enhance(color)
        image = ImageEnhance.Contrast(image).enhance(contrast)
        image.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
        image.save(path, "JPEG", quality=86, optimize=True, progressive=True)


prepare("apunte-biologia.jpg", (0.025, 0.018, 0.035, 0.025), -0.55, 0.86, 1.04)
prepare("apunte-ingles.jpg", (0.025, 0.025, 0.045, 0.035), 0.65, 0.91, 1.06)
prepare("apunte-mano.jpg", (0.035, 0.025, 0.055, 0.04), -0.45, 0.80, 1.08)
