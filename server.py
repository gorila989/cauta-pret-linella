#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import threading
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
import scrape_linella


ROOT = Path(__file__).resolve().parent
PRODUCTS_FILE = ROOT / "products.json"
CHANGES_FILE = ROOT / "changes.json"
SCRAPER_FILE = ROOT / "scrape_linella.py"
SOURCE_URL = "https://linella.md/ro/catalog"

status_lock = threading.Lock()
status = {
    "running": False,
    "success": None,
    "message": "Gata pentru actualizare.",
    "started_at": None,
    "finished_at": None,
}


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def json_response(handler, code, payload):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def set_status(**updates):
    with status_lock:
        status.update(updates)


def get_status():
    with status_lock:
        return dict(status)


def refresh_products(max_pages, sleep_seconds):
    set_status(
        running=True,
        success=None,
        message="Descarc catalogul Linella...",
        started_at=now(),
        finished_at=None,
    )
    previous = load_products_file()
    previous_products = previous.get("products", []) if previous else []
    command = [
        sys.executable,
        str(SCRAPER_FILE),
        "--source-url",
        SOURCE_URL,
        "--max-pages",
        str(max_pages),
        "--sleep",
        str(sleep_seconds),
        "--out",
        str(PRODUCTS_FILE),
    ]
    try:
        completed = subprocess.run(
            command,
            cwd=str(ROOT),
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            timeout=600,
        )
        if completed.returncode != 0:
            message = completed.stderr.strip().splitlines()[-1:] or ["Actualizarea a esuat."]
            set_status(running=False, success=False, message=message[0], finished_at=now())
            return
        current = load_products_file() or {"products": []}
        write_changes(previous, current)
        count = count_products()
        set_status(
            running=False,
            success=True,
            message=f"Actualizat cu succes: {count} produse.",
            finished_at=now(),
        )
    except Exception as exc:
        set_status(running=False, success=False, message=f"Eroare: {exc}", finished_at=now())


def count_products():
    if not PRODUCTS_FILE.exists():
        return 0
    with PRODUCTS_FILE.open("r", encoding="utf-8") as file:
        data = json.load(file)
    return len(data.get("products", []))


def load_products_file():
    if not PRODUCTS_FILE.exists():
        return None
    with PRODUCTS_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def product_key(product):
    return product.get("url") or product.get("product_code") or product.get("name")


def write_changes(previous, current):
    previous = previous or {"generated_at": None, "products": []}
    old_by_key = {product_key(product): product for product in previous.get("products", []) if product_key(product)}
    new_by_key = {product_key(product): product for product in current.get("products", []) if product_key(product)}

    upserts = []
    for key, product in new_by_key.items():
        if old_by_key.get(key) != product:
            upserts.append(product)

    deleted = [key for key in old_by_key if key not in new_by_key]
    payload = {
        "base_generated_at": previous.get("generated_at"),
        "generated_at": current.get("generated_at"),
        "source": current.get("source"),
        "full_count": len(current.get("products", [])),
        "upserts": upserts,
        "deleted": deleted,
    }
    CHANGES_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def manifest_payload():
    data = load_products_file()
    if not data:
        return {"generated_at": None, "count": 0, "source": SOURCE_URL}
    return {
        "generated_at": data.get("generated_at"),
        "count": len(data.get("products", [])),
        "source": data.get("source"),
    }


def find_product_by_url(product_url):
    if not PRODUCTS_FILE.exists():
        return None, None
    with PRODUCTS_FILE.open("r", encoding="utf-8") as file:
        data = json.load(file)
    for product in data.get("products", []):
        if product.get("url") == product_url:
            return data, product
    return data, None


def save_products(data):
    PRODUCTS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, max_pages=300, sleep_seconds=0.1, **kwargs):
        self.max_pages = max_pages
        self.sleep_seconds = sleep_seconds
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/products":
            if not PRODUCTS_FILE.exists():
                json_response(self, 404, {"error": "products.json nu exista"})
                return
            body = PRODUCTS_FILE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/manifest":
            json_response(self, 200, manifest_payload())
            return
        if path == "/api/changes":
            if not CHANGES_FILE.exists():
                json_response(self, 404, {"error": "changes.json nu exista"})
                return
            body = CHANGES_FILE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/status":
            json_response(self, 200, get_status())
            return
        if path == "/api/code":
            params = parse_qs(urlparse(self.path).query)
            product_url = unquote(params.get("url", [""])[0])
            if not product_url.startswith("https://linella.md/ro/catalog/"):
                json_response(self, 400, {"error": "URL produs invalid"})
                return
            data, product = find_product_by_url(product_url)
            if not product:
                json_response(self, 404, {"error": "Produsul nu exista in baza"})
                return
            if not product.get("product_code"):
                try:
                    details = scrape_linella.parse_detail(scrape_linella.fetch(product_url))
                    product.update(details)
                    save_products(data)
                except Exception as exc:
                    json_response(self, 500, {"error": str(exc)})
                    return
            json_response(self, 200, {"product_code": product.get("product_code", "")})
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/refresh":
            json_response(self, 404, {"error": "Not found"})
            return
        current = get_status()
        if current["running"]:
            json_response(self, 409, current)
            return
        thread = threading.Thread(
            target=refresh_products,
            args=(self.max_pages, self.sleep_seconds),
            daemon=True,
        )
        thread.start()
        json_response(self, 202, get_status())


def main():
    parser = argparse.ArgumentParser(description="Cauta Pret backend server.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    parser.add_argument("--max-pages", type=int, default=300)
    parser.add_argument("--sleep", type=float, default=0.1)
    args = parser.parse_args()

    def handler(*handler_args, **handler_kwargs):
        return Handler(
            *handler_args,
            max_pages=args.max_pages,
            sleep_seconds=args.sleep,
            **handler_kwargs,
        )

    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Cauta Pret ruleaza pe http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
