"""Package and verify the generated design deliverable without changing image pixels."""
from pathlib import Path
from collections import Counter
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import csv, hashlib, json, shutil, zipfile
from PIL import Image

root = Path(__file__).resolve().parent / "design-frames"
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8-sig"))
rows = json.loads((root / "generation-log.json").read_text(encoding="utf-8-sig"))
assert len(rows) == 60, f"Expected 60 rows, got {len(rows)}"
assert Counter(r["design"] for r in rows) == {d["id"]: 20 for d in manifest["designs"]}
expected = {f'{d["id"]}/{f["n"]:02}-{f["slug"]}.png' for d in manifest["designs"] for f in manifest["frames"]}
assert {r["file"] for r in rows} == expected

inventory = []
for row in rows:
    source, target = Path(row["source"]), root / row["file"]
    assert source.is_file(), source
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    with Image.open(target) as im:
        assert im.format == "PNG"
        im.verify()
    with Image.open(target) as im:
        im.load()
        width, height = im.size
        assert height > width and width >= 800
        mode = im.mode
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    assert digest == hashlib.sha256(source.read_bytes()).hexdigest()
    inventory.append({"file":row["file"],"version":row["design"],"frame":row["frame"],"title":row["title"],"width":width,"height":height,"mode":mode,"bytes":target.stat().st_size,"sha256":digest,"png_decode":"passed","source_pixels_preserved":True})
assert len({r["sha256"] for r in inventory}) == 60, "Duplicate images"
assert {p.relative_to(root).as_posix() for p in root.rglob("*.png")} == expected
(root / "image-inventory.json").write_text(json.dumps({"count":60,"per_version":dict(Counter(r["version"] for r in inventory)),"images":inventory},indent=2)+"\n",encoding="utf-8")
with (root / "FRAME-INDEX.csv").open("w",newline="",encoding="utf-8-sig") as file:
    writer=csv.DictWriter(file,fieldnames=["version","frame","title","file","width","height"])
    writer.writeheader()
    writer.writerows({k:r[k] for k in writer.fieldnames} for r in inventory)

class LinkParser(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]
    def handle_starttag(self, tag, attrs):
        for key,value in attrs:
            if key in ("src","href") and value:
                self.links.append(value)

link_count = 0
for html in root.rglob("*.html"):
    parser=LinkParser(); parser.feed(html.read_text(encoding="utf-8"))
    for link in parser.links:
        parts=urlsplit(link)
        if parts.scheme or parts.netloc or not parts.path: continue
        target=(html.parent / unquote(parts.path)).resolve()
        assert target.is_relative_to(root.resolve()), (html, link)
        assert target.is_file(), (html, link)
        link_count += 1
contrast=json.loads((root / "token-contrast-check.json").read_text(encoding="utf-8-sig"))
summary={"total_pngs":60,"per_version":dict(Counter(r["version"] for r in inventory)),"unique_image_hashes":60,"png_decode":"passed","original_pixels_preserved":True,"local_html_links_checked":link_count,"broken_local_links":0,"width_range":[min(r["width"] for r in inventory),max(r["width"] for r in inventory)],"height_range":[min(r["height"] for r in inventory),max(r["height"] for r in inventory)],"total_png_bytes":sum(r["bytes"] for r in inventory)}
(root / "verification-results.json").write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8")
archive=root.parent / "mobile-ui-frames-60.zip"
files=sorted(p for p in root.rglob("*") if p.is_file())
with zipfile.ZipFile(archive,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for path in files: z.write(path, Path("design-frames") / path.relative_to(root))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len(z.namelist()) == len(files)
    assert sum(name.endswith(".png") for name in z.namelist()) == 60
summary["archive"]={"file":str(archive),"files":len(files),"bytes":archive.stat().st_size,"crc_check":"passed"}
print(json.dumps(summary,indent=2))

