#!/usr/bin/env python3
import argparse
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urljoin, urlparse
import scrape_linella


ROOT = Path(__file__).resolve().parent
PRODUCTS_FILE = ROOT / "products.json"
CHANGES_FILE = ROOT / "changes.json"
BANNERS_FILE = ROOT / "banners.json"
SCRAPER_FILE = ROOT / "scrape_linella.py"
SOURCE_URL = "https://linella.md/ro/catalog"
PROMO_BANNERS_URL = "https://linella.md/ro/promotii/mega_oferta"
REFRESH_TIMEOUT_SECONDS = 1800
REFRESH_IDLE_TIMEOUT_SECONDS = 120

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


def today():
    return datetime.now().strftime("%Y-%m-%d")


def end_of_today():
    return datetime.now().replace(hour=23, minute=59, second=59, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")


def marker_is_today(product):
    marker = product.get("new_on")
    if marker:
        return marker == today()
    value = product.get("new_until")
    if not value:
        return False
    try:
        created_at = datetime.strptime(value, "%Y-%m-%d %H:%M:%S") - timedelta(days=1)
        return created_at.strftime("%Y-%m-%d") == today()
    except ValueError:
        return False


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
    command = [
        sys.executable,
        "-u",
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
    process = None
    try:
        process = subprocess.Popen(
            command,
            cwd=str(ROOT),
            text=True,
            encoding="utf-8",
            errors="replace",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
        )
        started = time.monotonic()
        current_page = 0
        total_pages = 0
        remaining_pages = 0
        current_category = ""
        current_category_index = 0
        total_categories = 0
        current_division = ""
        current_division_index = 0
        total_divisions = 0
        last_line = ""

        line_queue = queue.Queue()

        def read_output():
            for output_line in process.stdout or []:
                line_queue.put(output_line)

        threading.Thread(target=read_output, daemon=True).start()

        while process.poll() is None:
            if time.monotonic() - started > REFRESH_TIMEOUT_SECONDS:
                process.kill()
                raise subprocess.TimeoutExpired(command, REFRESH_TIMEOUT_SECONDS)

            try:
                raw_line = line_queue.get(timeout=REFRESH_IDLE_TIMEOUT_SECONDS)
            except queue.Empty:
                process.kill()
                raise TimeoutError(
                    f"Nu am primit progres de {REFRESH_IDLE_TIMEOUT_SECONDS} secunde. Linella sau conexiunea s-a blocat."
                )

            last_line = raw_line.strip()

            if last_line.startswith("Division progress:"):
                division_match = re.search(r"Division progress:\s*(\d+)/(\d+)\s+(.+)", last_line)
                if division_match:
                    current_division_index = int(division_match.group(1))
                    total_divisions = int(division_match.group(2))
                    current_division = division_match.group(3)
                    current_category = ""
                    current_category_index = 0
                    total_categories = 0
                    divisions_left = max(total_divisions - current_division_index, 0)
                    set_status(message=f"Diviziunea {current_division_index} din {total_divisions}: {current_division}. Au ramas {divisions_left} diviziuni...")
            elif last_line.startswith("Category progress:"):
                category_match = re.search(r"Category progress:\s*(\d+)/(\d+)\s+(.+)", last_line)
                if category_match:
                    current_category_index = int(category_match.group(1))
                    total_categories = int(category_match.group(2))
                    current_category = category_match.group(3)
                    current_page = 0
                    total_pages = 0
                    remaining_pages = 0
                    categories_left = max(total_categories - current_category_index, 0)
                    division_prefix = f"Diviziunea {current_division_index}/{total_divisions}, " if total_divisions else ""
                    set_status(message=f"{division_prefix}subcategoria {current_category_index} din {total_categories}: {current_category}. Au ramas {categories_left} subcategorii...")
            elif last_line.startswith("Downloading "):
                page_match = re.search(r"[?&]page=(\d+)", last_line)
                current_page = int(page_match.group(1)) if page_match else 1
                division_prefix = f"Diviziunea {current_division_index}/{total_divisions}, " if total_divisions else ""
                category_prefix = f"subcategoria {current_category_index}/{total_categories}, " if total_categories else ""
                if total_pages:
                    remaining_pages = max(total_pages - current_page, 0)
                    set_status(message=f"{division_prefix}{category_prefix}descarc pagina {current_page} din {total_pages}. Au ramas {remaining_pages} pagini...")
                else:
                    set_status(message=f"{division_prefix}{category_prefix}descarc pagina {current_page} din catalog...")
            elif last_line.startswith("Total pages:"):
                total_match = re.search(r"Total pages:\s*(\d+)", last_line)
                total_pages = int(total_match.group(1)) if total_match else 0
                remaining_pages = max(total_pages - current_page, 0) if current_page else total_pages
                division_prefix = f"Diviziunea {current_division_index}/{total_divisions}, " if total_divisions else ""
                category_prefix = f"subcategoria {current_category_index}/{total_categories}: " if total_categories else ""
                if total_pages:
                    set_status(message=f"{division_prefix}{category_prefix}are {total_pages} pagini. Au ramas {remaining_pages} pagini...")
            elif last_line.startswith("Page progress:"):
                progress_match = re.search(r"Page progress:\s*(\d+)/(\d+)", last_line)
                if progress_match:
                    current_page = int(progress_match.group(1))
                    total_pages = int(progress_match.group(2))
                    remaining_pages = max(total_pages - current_page, 0)
                    division_prefix = f"Diviziunea {current_division_index}/{total_divisions}, " if total_divisions else ""
                    category_prefix = f"subcategoria {current_category_index}/{total_categories}, " if total_categories else ""
                    set_status(message=f"{division_prefix}{category_prefix}descarc pagina {current_page} din {total_pages}. Au ramas {remaining_pages} pagini...")
            elif "found" in last_line and "products" in last_line:
                found_match = re.search(r"found\s+(\d+)\s+products", last_line)
                found = found_match.group(1) if found_match else "?"
                division_prefix = f"Diviziunea {current_division_index}/{total_divisions}, " if total_divisions else ""
                category_prefix = f"subcategoria {current_category_index}/{total_categories}, " if total_categories else ""
                if total_pages:
                    set_status(message=f"{division_prefix}{category_prefix}pagina {current_page} din {total_pages}: {found} produse. Au ramas {remaining_pages} pagini...")
                else:
                    set_status(message=f"{division_prefix}{category_prefix}pagina {current_page}: {found} produse gasite. Continui...")
            elif last_line.startswith("Wrote "):
                set_status(message="Salvez baza de produse...")

        while not line_queue.empty():
            last_line = line_queue.get().strip() or last_line

        return_code = process.wait()
        if return_code != 0:
            set_status(
                running=False,
                success=False,
                message=last_line or "Actualizarea a esuat.",
                finished_at=now(),
            )
            return
        current = load_products_file() or {"products": []}
        changes = write_changes(previous, current)
        count = count_products()
        changed_count = len(changes.get("upserts", []))
        deleted_count = len(changes.get("deleted", []))
        new_count = changes.get("new_count", 0)
        price_count = changes.get("price_changed_count", 0)
        set_status(
            running=False,
            success=True,
            message=f"Actualizat: {count} produse. Diferente: {changed_count}, noi: {new_count}, pret schimbat: {price_count}, sterse: {deleted_count}.",
            finished_at=now(),
        )
    except subprocess.TimeoutExpired:
        minutes = REFRESH_TIMEOUT_SECONDS // 60
        set_status(
            running=False,
            success=False,
            message=f"Actualizarea a durat peste {minutes} minute. Linella se incarca greu; incearca din nou mai tarziu.",
            finished_at=now(),
        )
    except TimeoutError as exc:
        set_status(
            running=False,
            success=False,
            message=f"Actualizarea s-a blocat: {exc}",
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
    had_previous_catalog = bool(previous.get("generated_at"))
    old_by_key = {product_key(product): product for product in previous.get("products", []) if product_key(product)}
    new_by_key = {product_key(product): product for product in current.get("products", []) if product_key(product)}

    upserts = []
    new_count = 0
    price_changed_count = 0
    for key, product in new_by_key.items():
        old_product = old_by_key.get(key)
        if old_product is None:
            if had_previous_catalog:
                product["new_on"] = today()
                product["new_until"] = end_of_today()
                new_count += 1
        elif marker_is_today(old_product):
            product["new_on"] = old_product.get("new_on") or today()
            product["new_until"] = end_of_today()
        else:
            product.pop("new_on", None)
            product.pop("new_until", None)

        if old_product is not None and (
            old_product.get("price") != product.get("price") or
            old_product.get("old_price") != product.get("old_price") or
            old_product.get("discount") != product.get("discount")
        ):
            price_changed_count += 1

        if old_product != product:
            upserts.append(product)

    deleted = [key for key in old_by_key if key not in new_by_key]
    payload = {
        "base_generated_at": previous.get("generated_at"),
        "generated_at": current.get("generated_at"),
        "source": current.get("source"),
        "full_count": len(current.get("products", [])),
        "new_count": new_count,
        "price_changed_count": price_changed_count,
        "upserts": upserts,
        "deleted": deleted,
    }
    save_products(current)
    CHANGES_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


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


def banner_payload(banners, source=PROMO_BANNERS_URL):
    return {
        "source": source,
        "generated_at": now(),
        "banners": banners,
    }


def extract_promo_banners(html, page_url=PROMO_BANNERS_URL):
    found = []
    seen = set()
    image_pattern = re.compile(
        r"""(?:(?:src|data-src|href|content)=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']|(/public/menu/[^"')\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"')\s]*)?))""",
        re.IGNORECASE,
    )
    for match in image_pattern.finditer(html):
        raw_url = (match.group(1) or match.group(2)).replace("&amp;", "&")
        lower = raw_url.lower()
        if "/public/menu/thumbs/" in lower:
            continue
        if "/public/products/" in lower or "/public/categories/" in lower:
            continue
        if "/public/promotions_pdf/" in lower:
            continue
        if "/assets/img/" in lower or "/assets/images/" in lower:
            continue
        if "/public/menu/" not in lower and "banner" not in lower and "promo" not in lower:
            continue
        image_url = urljoin(page_url, raw_url)
        if image_url in seen:
            continue
        seen.add(image_url)
        found.append({
            "image": image_url,
            "link": page_url,
        })
    return found


def read_cached_banners():
    if not BANNERS_FILE.exists():
        return banner_payload([])
    with BANNERS_FILE.open("r", encoding="utf-8") as file:
        return json.load(file)


def fetch_promo_banners():
    html = scrape_linella.fetch(PROMO_BANNERS_URL)
    banners = extract_promo_banners(html, PROMO_BANNERS_URL)
    data = banner_payload(banners)
    if banners:
        BANNERS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, max_pages=300, sleep_seconds=0.1, **kwargs):
        self.max_pages = max_pages
        self.sleep_seconds = sleep_seconds
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/banners":
            try:
                json_response(self, 200, fetch_promo_banners())
            except Exception as exc:
                data = read_cached_banners()
                data["error"] = str(exc)
                json_response(self, 200 if data.get("banners") else 502, data)
            return
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
