#!/usr/bin/env python3
"""Download local WebP icons referenced by the pinned BitCraft tables (stdlib only)."""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import struct
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
CDN = "https://cdn.brico.app/sprites"
ICON_FIELDS = {"icon_asset_name", "icon_address", "icon_path", "icon_asset_path", "icon_unicode"}
PRIMARY_KEYS = {
    "biome_desc": "biome_type", "building_map_icon_desc": "building_id",
    "enemy_desc": "enemy_type", "npc_desc": "npc_type",
}
ALIASES = {
    "item_desc": "item", "cargo_desc": "cargo", "resource_desc": "resource",
    "building_desc": "building", "collectible_desc": "collectible",
    "placeable_desc": "placeable", "enemy_desc": "enemy", "npc_desc": "npc",
    "skill_desc": "skill", "buff_desc": "buff", "biome_desc": "biome",
    "ability_custom_desc": "ability", "combat_action_desc": "combatAction",
    "paving_tile_desc": "paving", "pillar_shaping_desc": "pillar",
    "prospecting_desc": "prospecting", "empire_icon_desc": "empireIcon",
    "building_map_icon_desc": "buildingMapIcon",
    "deployable_appearance_override_desc": "appearance",
}


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def sha256(payload):
    return hashlib.sha256(payload).hexdigest()


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def webp_size(payload):
    """Validate RIFF boundaries and read WebP dimensions without image libraries."""
    if len(payload) < 20 or payload[:4] != b"RIFF" or payload[8:12] != b"WEBP":
        raise ValueError("Response is not a WebP image")
    if struct.unpack_from("<I", payload, 4)[0] + 8 != len(payload):
        raise ValueError("Truncated or invalid WebP RIFF length")
    offset, dimensions = 12, None
    while offset < len(payload):
        if offset + 8 > len(payload):
            raise ValueError("Truncated WebP chunk header")
        kind = payload[offset:offset + 4]
        size = struct.unpack_from("<I", payload, offset + 4)[0]
        start, end = offset + 8, offset + 8 + size
        if end > len(payload):
            raise ValueError("Truncated WebP chunk")
        chunk = payload[start:end]
        if kind == b"VP8X" and len(chunk) >= 10:
            dimensions = (int.from_bytes(chunk[4:7], "little") + 1, int.from_bytes(chunk[7:10], "little") + 1)
        elif kind == b"VP8L" and len(chunk) >= 5 and chunk[0] == 0x2F:
            bits = int.from_bytes(chunk[1:5], "little")
            dimensions = dimensions or ((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
        elif kind == b"VP8 " and len(chunk) >= 10 and chunk[3:6] == b"\x9d\x01\x2a":
            dimensions = dimensions or (int.from_bytes(chunk[6:8], "little") & 0x3FFF, int.from_bytes(chunk[8:10], "little") & 0x3FFF)
        offset = end + (size % 2)
    if offset != len(payload) or not dimensions or min(dimensions) < 1:
        raise ValueError("Invalid WebP dimensions or padding")
    return dimensions


def asset_file(key):
    # Preserve case-sensitive CDN identities on case-insensitive Windows drives.
    digest = sha256(key.encode("utf-8"))
    return f"files/{digest[:2]}/{digest}.webp"


def sprite_path(value):
    if not isinstance(value, str) or not value:
        return {"kind": "empty", "assetKey": None, "variants": []}
    # Font codepoints (literal \\uXXXX or actual characters) are not file paths.
    if "/" not in value:
        return {"kind": "glyph", "assetKey": None, "variants": []}
    match = re.fullmatch(r"([\w/]+)\[((?:,\d+)+)\]", value)
    base = match[1] if match else value
    variants = []
    if match:
        variants = [{"minQuantity": quantity, "assetKey": f"{base}{quantity}"}
                    for quantity in sorted({int(q) for q in match[2].split(",") if q})]
    for key in [base, *(variant["assetKey"] for variant in variants)]:
        parts = PurePosixPath(key).parts
        if key.startswith("/") or any(part in (".", "..") for part in parts) or "\\" in key or ":" in key or "[" in key:
            raise ValueError(f"Unsupported/unsafe sprite path: {key!r}")
    return {"kind": "image", "assetKey": base, "variants": variants}


def collect(data_root):
    manifest_bytes = (data_root / "manifest.json").read_bytes()
    source = json.loads(manifest_bytes)
    records, by_entity, paths = {}, {}, set()
    for meta in source["tables"]:
        fields = sorted(ICON_FIELDS.intersection(meta["fields"]))
        if not fields:
            continue
        if len(fields) != 1:
            raise ValueError(f"Review multiple icon fields in {meta['table']}")
        payload = (data_root / meta["path"]).read_bytes()
        if sha256(payload) != meta["sha256"]:
            raise ValueError(f"Source table hash differs: {meta['path']}")
        field, table = fields[0], meta["table"]
        id_field = PRIMARY_KEYS.get(table, "id")
        for row in json.loads(payload):
            identifier = row[id_field]
            key = f"{table}:{identifier}"
            if key in records:
                raise ValueError(f"Duplicate icon binding: {key}")
            value = row.get(field, "")
            icon = sprite_path(value)
            records[key] = {
                "table": table, "idField": id_field, "id": identifier,
                "name": row.get("name", row.get("title", "")),
                "field": field, "sourceValue": value, **icon,
            }
            if icon["kind"] == "image":
                paths.add(icon["assetKey"])
                paths.update(variant["assetKey"] for variant in icon["variants"])
            if table in ALIASES:
                by_entity[f"{ALIASES[table]}:{identifier}"] = key
    return source, sha256(manifest_bytes), records, by_entity, sorted(paths)


def fetch(key, output, old, retry_missing, refresh):
    relative = asset_file(key)
    target = output / relative
    url = f"{CDN}/{quote(key, safe='/')}.webp"
    cached = old.get(key, {})
    if not refresh and target.is_file():
        try:
            payload = target.read_bytes()
            width, height = webp_size(payload)
            digest = sha256(payload)
            if cached.get("sha256") and cached["sha256"] != digest:
                raise ValueError("Cached file SHA-256 differs")
            return {"status": "downloaded", "file": relative, "url": url,
                    "sha256": digest, "bytes": len(payload), "width": width, "height": height,
                    "downloadedAt": cached.get("downloadedAt", now()), "httpStatus": 200}
        except ValueError:
            pass
    if not refresh and not retry_missing and cached.get("status") == "missing":
        return cached
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "BitCraftCompanion-local-icons/1.0", "Accept": "image/webp"})
            with urlopen(request, timeout=30) as response:
                payload = response.read(25 * 1024 * 1024 + 1)
                if len(payload) > 25 * 1024 * 1024:
                    raise ValueError("Image exceeds 25 MiB download limit")
                width, height = webp_size(payload)
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(".webp.part")
            temporary.write_bytes(payload)
            os.replace(temporary, target)
            return {"status": "downloaded", "file": relative, "url": url,
                    "sha256": sha256(payload), "bytes": len(payload), "width": width, "height": height,
                    "downloadedAt": now(), "httpStatus": 200}
        except HTTPError as error:
            if error.code in (404, 410):
                return {"status": "missing", "file": None, "url": url, "httpStatus": error.code,
                        "checkedAt": now(), "error": f"HTTP {error.code}"}
            if error.code not in (408, 425, 429, 500, 502, 503, 504) or attempt == 2:
                return {"status": "failed", "file": None, "url": url, "httpStatus": error.code,
                        "checkedAt": now(), "error": f"HTTP {error.code}"}
            retry_after = error.headers.get("Retry-After", "")
            time.sleep(min(30, int(retry_after)) if retry_after.isdigit() else 2 ** (attempt + 1))
        except (URLError, TimeoutError, OSError, ValueError) as error:
            if attempt == 2:
                return {"status": "failed", "file": None, "url": url, "httpStatus": None,
                        "checkedAt": now(), "error": str(error)}
            time.sleep(2 ** (attempt + 1))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=ROOT / "data" / "bitcraft")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "bitcraft" / "icons")
    parser.add_argument("--workers", type=int, default=6, choices=range(1, 9), metavar="1..8")
    parser.add_argument("--retry-missing", action="store_true", help="Recheck cached 404/410 responses")
    parser.add_argument("--refresh", action="store_true", help="Redownload all images instead of using valid local files")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    source, source_hash, records, by_entity, paths = collect(args.data.resolve())
    old_path = output / "manifest.json"
    old = json.loads(old_path.read_text(encoding="utf-8")).get("assets", {}) if old_path.exists() else {}
    print(f"Icon inventory: {len(records)} records; {len(paths)} unique WebP paths; source {source['source']['commit']}", flush=True)
    assets = {}
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(fetch, key, output, old, args.retry_missing, args.refresh): key for key in paths}
        for future in as_completed(futures):
            key = futures[future]
            assets[key] = future.result()
            if len(assets) % 100 == 0 or len(assets) == len(paths):
                downloaded = sum(asset["status"] == "downloaded" for asset in assets.values())
                missing = sum(asset["status"] == "missing" for asset in assets.values())
                print(f"{len(assets)}/{len(paths)} checked: {downloaded} downloaded, {missing} missing, {len(assets) - downloaded - missing} failed", flush=True)
    assets = dict(sorted(assets.items()))
    by_table = {}
    for record in records.values():
        kind = record["kind"]
        asset = assets.get(record["assetKey"], {})
        record["status"] = ("available" if asset.get("status") == "downloaded" else asset.get("status", "failed")) if kind == "image" else kind
        record["file"] = asset.get("file")
        counts = by_table.setdefault(record["table"], {"records": 0, "available": 0, "missing": 0, "failed": 0, "glyph": 0, "empty": 0})
        counts["records"] += 1
        counts[record["status"]] += 1
    downloaded = [asset for asset in assets.values() if asset["status"] == "downloaded"]
    counts = {
        "records": len(records), "imageRecords": sum(record["kind"] == "image" for record in records.values()),
        "glyphRecords": sum(record["kind"] == "glyph" for record in records.values()),
        "emptyRecords": sum(record["kind"] == "empty" for record in records.values()),
        "assetRequests": len(assets), "downloadedAssets": len(downloaded),
        "missingAssets": sum(asset["status"] == "missing" for asset in assets.values()),
        "failedAssets": sum(asset["status"] == "failed" for asset in assets.values()),
        "totalBytes": sum(asset["bytes"] for asset in downloaded), "byTable": by_table,
    }
    manifest = {
        "formatVersion": 1, "downloadedAt": now(),
        "source": {"baseUrl": CDN, "addressingReferences": [
            "https://github.com/BitCraftToolBox/cereal/blob/main/src/components/SpriteImage.tsx",
            "https://github.com/BitCraftToolBox/brico/blob/main/frontend/src/lib/bitcraft-utils.ts",
        ]},
        "dataSnapshot": {"commit": source["source"]["commit"], "committedAt": source["source"]["committedAt"], "manifestSha256": source_hash},
        "scope": {"iconFields": sorted(ICON_FIELDS), "glyphsAreNotImages": True,
                  "fileNaming": "files/<first 2 hex>/<sha256 of case-sensitive asset key UTF-8>.webp",
                  "imagesAreOriginalDownloads": True, "liveGameParityVerified": False},
        "counts": counts, "assets": assets,
    }
    bindings = {"formatVersion": 1, "dataCommit": source["source"]["commit"], "pathBase": ".",
                "byEntity": dict(sorted(by_entity.items())), "records": dict(sorted(records.items()))}
    missing = {"formatVersion": 1, "dataCommit": source["source"]["commit"], "generatedAt": now(),
               "assets": [{"assetKey": key, **asset} for key, asset in assets.items() if asset["status"] != "downloaded"],
               "records": [{"recordKey": key, **record} for key, record in records.items() if record["status"] != "available"]}
    write_json(output / "bindings.json", bindings)
    write_json(output / "missing.json", missing)
    write_json(output / "manifest.json", manifest)
    print(json.dumps({key: value for key, value in counts.items() if key != "byTable"}, indent=2), flush=True)
    print(f"Saved local icon package to {output}", flush=True)
    if counts["failedAssets"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
