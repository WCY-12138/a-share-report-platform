#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build data/reports.json from the reports folder for static hosting."""

import json
import re
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REPORTS_DIR = ROOT / "reports"
OUTPUT = ROOT / "data" / "reports.json"
REPORT_SUFFIXES = {".md", ".txt", ".markdown"}


def extract_date(filename, content):
    match = re.search(r"(\d{4}-\d{2}-\d{2})", filename)
    if match:
        return match.group(1)
    match = re.search(r"(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})", content)
    if match:
        return "%04d-%02d-%02d" % (
            int(match.group(1)),
            int(match.group(2)),
            int(match.group(3)),
        )
    return datetime.now().strftime("%Y-%m-%d")


def extract_title(content, filename):
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()
    return filename


def build():
    items = []
    if REPORTS_DIR.exists():
        for path in sorted(REPORTS_DIR.iterdir(), reverse=True):
            if not path.is_file() or path.suffix.lower() not in REPORT_SUFFIXES:
                continue
            content = path.read_text(encoding="utf-8", errors="replace")
            items.append(
                {
                    "filename": path.name,
                    "date": extract_date(path.name, content),
                    "title": extract_title(content, path.name),
                    "content": content,
                    "size": path.stat().st_size,
                    "modified": datetime.fromtimestamp(path.stat().st_mtime).strftime(
                        "%Y-%m-%d %H:%M:%S"
                    ),
                }
            )
    items.sort(key=lambda item: item["date"], reverse=True)
    payload = {
        "ok": True,
        "source": "static",
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "reports": items,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print("Generated %s with %d reports" % (OUTPUT, len(items)))


if __name__ == "__main__":
    build()
