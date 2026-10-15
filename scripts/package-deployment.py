"""Package only the files the built game loads from the public directory."""

from pathlib import Path
import re
import shutil
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
OUTPUT = ROOT / "deployment"
SITE = OUTPUT / "site"
ARCHIVE = OUTPUT / "exorcist-deployment.zip"


def exact_file(relative):
    current = DIST
    for part in relative.parts:
        names = {entry.name for entry in current.iterdir()}
        if part not in names:
            raise FileNotFoundError(f"Missing or mismatched filename: {relative}")
        current /= part
    if not current.is_file():
        raise FileNotFoundError(f"Expected a file: {relative}")
    return current


def runtime_assets():
    paths = {Path("index.html")}
    paths.update(path.relative_to(DIST) for path in (DIST / "assets").rglob("*") if path.is_file())

    for source in (ROOT / "src").rglob("*.js"):
        code = source.read_text(encoding="utf-8")
        for asset in re.findall(r"assetUrl\(\s*['\"](/[^'\"]+)['\"]\s*\)", code):
            paths.add(Path(asset.lstrip("/")))

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    for asset in re.findall(r"url\(['\"]?\./([^'\")]+)", html):
        paths.add(Path(asset))
    return sorted(paths)


def main():
    if not (DIST / "index.html").is_file():
        raise SystemExit("Run npm run build first.")
    if not SITE.resolve().is_relative_to(ROOT) or not ARCHIVE.resolve().is_relative_to(ROOT):
        raise SystemExit("Deployment output must stay inside the project.")

    files = runtime_assets()
    sources = [(relative, exact_file(relative)) for relative in files]
    OUTPUT.mkdir(exist_ok=True)
    if SITE.exists():
        shutil.rmtree(SITE)
    SITE.mkdir()

    for relative, source in sources:
        destination = SITE / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    with ZipFile(ARCHIVE, "w", compression=ZIP_DEFLATED, compresslevel=6) as zipped:
        for relative, _ in sources:
            zipped.write(SITE / relative, relative.as_posix())

    size_mb = ARCHIVE.stat().st_size / (1024 * 1024)
    print(f"Packaged {len(files)} files: {ARCHIVE} ({size_mb:.1f} MiB)")
    print("The archive has index.html at its top level.")


if __name__ == "__main__":
    main()
