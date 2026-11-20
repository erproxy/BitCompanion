#!/usr/bin/env python3
"""Download and verify a pinned BitCraft static-data snapshot (stdlib only)."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
from datetime import datetime, timezone
from urllib.parse import quote
from urllib.request import Request, urlopen


REPOSITORY = "BitCraftToolBox/BitCraft_GameData"
BRANCH = "cereal/cs"
ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {
    "crafting_recipe_desc", "construction_recipe_desc", "extraction_recipe_desc",
    "deconstruction_recipe_desc", "item_conversion_recipe_desc", "item_desc",
    "cargo_desc", "building_desc", "skill_desc", "tool_desc", "item_list_desc",
}


def download(url):
    request = Request(url, headers={
        "User-Agent": "BitCraftCompanion-data-import/1.0",
        "Accept": "application/vnd.github+json" if "api.github.com" in url else "*/*",
    })
    with urlopen(request, timeout=120) as response:
        return response.read()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", help="Exact upstream commit; omit to resolve cereal/cs HEAD")
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "bitcraft")
    args = parser.parse_args()
    destination = args.output.resolve()
    # A refresh replaces only files listed in the previous manifest, never the folder.
    destination.mkdir(parents=True, exist_ok=True)
    api_root = f"https://api.github.com/repos/{REPOSITORY}"
    if args.commit:
        commit = json.loads(download(f"{api_root}/commits/{quote(args.commit, safe='')}"))
    else:
        branch = json.loads(download(f"{api_root}/branches/{quote(BRANCH, safe='')}"))
        commit = branch["commit"]
    sha = commit["sha"]
    if len(sha) != 40 or any(c not in "0123456789abcdef" for c in sha):
        raise ValueError("GitHub returned an invalid commit SHA")
    archive_url = f"https://codeload.github.com/{REPOSITORY}/tar.gz/{sha}"
    print(f"Downloading {REPOSITORY}@{sha}", flush=True)
    archive_bytes = download(archive_url)
    with tempfile.TemporaryDirectory(prefix=".bitcraft-import-", dir=destination.parent) as staging_name:
        staging = Path(staging_name)
        table_info = []
        schema_info = None
        # Read named members manually: no archive paths are passed to extractall.
        with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
            for member in archive.getmembers():
                if not member.isfile():
                    continue
                parts = Path(member.name).parts
                relative = parts[1:]
                is_table = len(relative) == 2 and relative[0] == "static" and relative[1].endswith(".json")
                is_schema = relative == ("region_schema.json",)
                if not (is_table or is_schema):
                    continue
                if any(part in ("..", ".") for part in relative):
                    raise ValueError(f"Unsafe archive entry: {member.name}")
                payload = archive.extractfile(member).read()
                parsed = json.loads(payload)
                path = Path("raw", *relative)
                target = staging / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
                record = {
                    "table": Path(relative[-1]).stem,
                    "path": path.as_posix(),
                    "bytes": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "sourceUrl": f"https://raw.githubusercontent.com/{REPOSITORY}/{sha}/{'/'.join(relative)}",
                }
                if is_table:
                    if not isinstance(parsed, list) or any(not isinstance(row, dict) for row in parsed):
                        raise ValueError(f"Expected an array of objects: {member.name}")
                    record["rows"] = len(parsed)
                    record["fields"] = sorted({key for row in parsed for key in row})
                    ids = [row["id"] for row in parsed if "id" in row]
                    if len(ids) != len(set(ids)):
                        raise ValueError(f"Duplicate id in {member.name}")
                    table_info.append(record)
                else:
                    if not isinstance(parsed, dict):
                        raise ValueError("Expected schema object")
                    schema_info = record
        names = {entry["table"] for entry in table_info}
        if missing := REQUIRED - names:
            raise ValueError(f"Required tables missing: {sorted(missing)}")
        if not schema_info:
            raise ValueError("region_schema.json is missing")
        table_info.sort(key=lambda entry: entry["table"])
        manifest = {
            "formatVersion": 1,
            "source": {
                "repository": REPOSITORY,
                "repositoryUrl": f"https://github.com/{REPOSITORY}",
                "branch": BRANCH,
                "commit": sha,
                "commitUrl": f"https://github.com/{REPOSITORY}/commit/{sha}",
                "committedAt": commit["commit"]["committer"]["date"],
                "commitMessage": commit["commit"]["message"],
                "archiveUrl": archive_url,
                "archiveSha256": hashlib.sha256(archive_bytes).hexdigest(),
            },
            "downloadedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "scope": "All static/*.json files and region_schema.json from one pinned upstream commit; no live player data or image files.",
            "validation": "JSON parsed; table arrays and unique id fields checked; required recipe/reference tables present; per-file SHA-256 recorded. Gameplay parity is not verified.",
            "license": "No license grant is inferred for game data or assets. See upstream terms; BitCraftPublic's code license is separate.",
            "tableCount": len(table_info),
            "totalRows": sum(entry["rows"] for entry in table_info),
            "totalBytes": sum(entry["bytes"] for entry in table_info) + schema_info["bytes"],
            "tables": table_info,
            "schema": schema_info,
        }
        write_json(staging / "manifest.json", manifest)
        # All network/JSON validation finishes before replacing any current data.
        # A failed final disk write is detectable through the manifest/hash check.
        old_manifest_path = destination / "manifest.json"
        old_manifest = json.loads(old_manifest_path.read_text(encoding="utf-8")) if old_manifest_path.exists() else {}
        for entry in [*table_info, schema_info]:
            target = destination / entry["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            os.replace(staging / entry["path"], target)
        if old_manifest:
            new_paths = {entry["path"] for entry in [*table_info, schema_info]}
            for old in [*old_manifest.get("tables", []), old_manifest.get("schema", {})]:
                old_path = old.get("path")
                if old_path and old_path not in new_paths:
                    candidate = (destination / old_path).resolve()
                    if destination in candidate.parents and candidate.is_file():
                        candidate.unlink()
        os.replace(staging / "manifest.json", old_manifest_path)
    print(f"Saved {len(table_info)} tables, {manifest['totalRows']} rows, {manifest['totalBytes']:,} bytes to {destination}")
    print(f"Upstream commit date: {manifest['source']['committedAt']}")


if __name__ == "__main__":
    main()
