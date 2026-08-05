#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Local static server plus a small reports API for the A-share daily platform."""

import argparse
import json
import re
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
REPORTS_DIR = ROOT / "reports"
REPORT_SUFFIXES = {".md", ".txt", ".markdown"}

STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".svg": "image/svg+xml",
}


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


def list_reports():
    items = []
    if not REPORTS_DIR.exists():
        return items
    for path in sorted(REPORTS_DIR.iterdir(), reverse=True):
        if not path.is_file() or path.suffix.lower() not in REPORT_SUFFIXES:
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
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
    return items


def safe_filename(name):
    clean = Path(name or "").name
    if not clean or clean in {".", ".."}:
        return None
    return clean


class PlatformHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        if path == "/api/reports":
            self.send_json({"ok": True, "source": "folder", "reports": list_reports()})
            return
        if path.startswith("/api/"):
            self.send_json({"ok": False, "error": "not found"}, status=404)
            return
        self.serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/reports":
            self.send_json({"ok": False, "error": "not found"}, status=404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or b"{}")
        except (ValueError, UnicodeDecodeError):
            self.send_json({"ok": False, "error": "invalid json"}, status=400)
            return

        filename = safe_filename(payload.get("filename") or "")
        if not filename and payload.get("date"):
            filename = safe_filename(str(payload["date"]) + ".md")
        content = payload.get("content")
        if not filename or not content or not isinstance(content, str):
            self.send_json({"ok": False, "error": "filename and content are required"}, status=400)
            return

        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        target = REPORTS_DIR / filename
        try:
            target.write_text(content, encoding="utf-8")
        except OSError as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=500)
            return
        self.send_json({"ok": True, "filename": filename, "date": extract_date(filename, content)})

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        prefix = "/api/reports/"
        if not path.startswith(prefix):
            self.send_json({"ok": False, "error": "not found"}, status=404)
            return
        filename = safe_filename(path[len(prefix) :])
        target = REPORTS_DIR / filename
        if not target.is_file():
            self.send_json({"ok": False, "error": "report not found"}, status=404)
            return
        try:
            target.unlink()
        except OSError as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=500)
            return
        self.send_json({"ok": True, "filename": filename})

    def serve_static(self, path):
        if path == "/":
            path = "/index.html"
        candidate = (ROOT / path.lstrip("/")).resolve()
        try:
            candidate.relative_to(ROOT)
        except ValueError:
            self.send_json({"ok": False, "error": "forbidden"}, status=403)
            return
        if candidate.is_dir():
            candidate = candidate / "index.html"
        if not candidate.is_file():
            self.send_json({"ok": False, "error": "not found"}, status=404)
            return
        content_type = STATIC_TYPES.get(candidate.suffix.lower(), "application/octet-stream")
        data = candidate.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description="A-share daily report platform")
    parser.add_argument("--port", type=int, default=8765, help="port to listen on")
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), PlatformHandler)
    print("A-share daily report platform: http://127.0.0.1:%d" % args.port)
    print("Reports folder: %s" % REPORTS_DIR)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
