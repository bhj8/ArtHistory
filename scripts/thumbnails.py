"""Generate checked-in previews; original artwork files are never modified.

Run with Python + Pillow after adding/changing artwork images.
The normal Node build consumes the manifest and needs no imaging dependency.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
artworks = json.loads((root / "data/artworks.json").read_text(encoding="utf-8"))
target = root / "assets/thumbnails"
target.mkdir(exist_ok=True)
manifest = {}
for key, art in artworks.items():
    source = root / art["image"]
    if source.suffix == ".svg":
        continue
    previews = []
    with Image.open(source) as original:
        for width in (320, 640):
            im = ImageOps.exif_transpose(original).convert("RGBA" if "A" in original.getbands() else "RGB")
            im.thumbnail((width, width * 3 // 2), Image.Resampling.LANCZOS)
            path = target / f"{key}-{width}.webp"
            im.save(path, "WEBP", quality=74, method=6)
            previews.append({"image": path.relative_to(root).as_posix(), "width": im.width, "height": im.height})
    manifest[key] = {"sourceHash": hashlib.sha256(source.read_bytes()).hexdigest(), "previews": previews}
(root / "data/thumbnails.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Generated previews for {len(manifest)} artworks")
