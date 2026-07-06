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
from urllib.parse import parse_qs, unquote, urlparse
import urllib.request
import scrape_linella


ROOT = Path(__file__).resolve().parent
PRODUCTS_FILE = ROOT / "products.json"
PRODUCTS_TMP_FILE = ROOT / "products.next.json"
CHANGES_FILE = ROOT / "changes.json"
SCRAPER_FILE = ROOT / "scrape_linella.py"
SOURCE_URL = "https://linella.md/ro/catalog"
REFRESH_TIMEOUT_SECONDS = 1800
REFRESH_IDLE_TIMEOUT_SECONDS = 300
REFRESH_STATUS_TICK_SECONDS = 30
REFRESH_STALE_SECONDS = 300

status_lock = threading.Lock()
active_process = None
status = {
    "running": False,
    "success": None,
    "message": "Gata pentru actualizare.",
    "started_at": None,
    "finished_at": None,
    "updated_at": None,
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
    handler.send_header("Cache-Control", "no-store")
    cors_headers(handler)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def cors_headers(handler):
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")


def set_status(**updates):
    with status_lock:
        updates.setdefault("updated_at", now())
        status.update(updates)


def get_status():
    with status_lock:
        return dict(status)


def parse_status_time(value):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def refresh_is_stale(current=None):
    current = current or get_status()
    if not current.get("running"):
        return False
    reference = parse_status_time(current.get("updated_at")) or parse_status_time(current.get("started_at"))
    if not reference:
        return True
    return (datetime.now() - reference).total_seconds() > REFRESH_STALE_SECONDS


def reset_refresh_state(reason="Actualizarea blocata a fost resetata."):
    global active_process
    with status_lock:
        process = active_process
        active_process = None
    if process and process.poll() is None:
        try:
            process.kill()
        except Exception as exc:
            print(f"Eroare cand opresc procesul blocat: {exc}", flush=True)
    set_status(
        running=False,
        success=False,
        message=reason,
        finished_at=now(),
    )
    print(reason, flush=True)


def refresh_products(max_pages, sleep_seconds):
    global active_process
    set_status(
        running=True,
        success=None,
        message="Descarc catalogul Linella...",
        started_at=now(),
        finished_at=None,
    )
    previous = load_products_file()
    try:
        PRODUCTS_TMP_FILE.unlink()
    except FileNotFoundError:
        pass
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
        str(PRODUCTS_TMP_FILE),
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
        with status_lock:
            active_process = process
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
        last_progress_at = time.monotonic()
        last_wait_notice_at = 0

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
                raw_line = line_queue.get(timeout=REFRESH_STATUS_TICK_SECONDS)
            except queue.Empty:
                waiting_for = int(time.monotonic() - last_progress_at)
                if waiting_for >= REFRESH_IDLE_TIMEOUT_SECONDS:
                    process.kill()
                    raise TimeoutError(
                        f"Nu am primit progres de {REFRESH_IDLE_TIMEOUT_SECONDS} secunde. Linella sau conexiunea s-a blocat."
                    )
                if time.monotonic() - last_wait_notice_at >= REFRESH_STATUS_TICK_SECONDS:
                    last_wait_notice_at = time.monotonic()
                    set_status(message=f"Astept raspuns de la Linella... {waiting_for} secunde fara progres nou.")
                continue

            last_line = raw_line.strip()
            if last_line:
                last_progress_at = time.monotonic()

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
        current = load_products_file(PRODUCTS_TMP_FILE)
        if not validate_products_data(current):
            raise ValueError("Baza descarcata nu este valida. Pastrez ultima baza buna.")
        finished_at = now()
        current["generated_at"] = finished_at
        changes = write_changes(previous, current)
        count = count_products()
        changed_count = len(changes.get("upserts", []))
        deleted_count = len(changes.get("deleted", []))
        new_count = changes.get("new_count", 0)
        price_count = changes.get("price_changed_count", 0)
        set_status(
            running=False,
            success=True,
            message=f"Baza de date a fost actualizata. Actualizat: {count} produse. Diferente: {changed_count}, noi: {new_count}, pret schimbat: {price_count}, sterse: {deleted_count}.",
            finished_at=finished_at,
        )
    except subprocess.TimeoutExpired:
        print("Actualizarea a depasit limita de timp.", flush=True)
        minutes = REFRESH_TIMEOUT_SECONDS // 60
        set_status(
            running=False,
            success=False,
            message=f"Actualizarea a durat peste {minutes} minute. Linella se incarca greu; incearca din nou mai tarziu.",
            finished_at=now(),
        )
    except TimeoutError as exc:
        print(f"Actualizarea s-a blocat: {exc}", flush=True)
        set_status(
            running=False,
            success=False,
            message=f"Actualizarea s-a blocat: {exc}",
            finished_at=now(),
        )
    except Exception as exc:
        print(f"Eroare refresh: {exc}", flush=True)
        set_status(running=False, success=False, message=f"Eroare: {exc}", finished_at=now())
    finally:
        with status_lock:
            if active_process is process:
                active_process = None
        try:
            PRODUCTS_TMP_FILE.unlink()
        except FileNotFoundError:
            pass


def count_products():
    if not PRODUCTS_FILE.exists():
        return 0
    with PRODUCTS_FILE.open("r", encoding="utf-8") as file:
        data = json.load(file)
    return len(data.get("products", []))


def write_json_atomic(path, data):
    temp_path = path.with_suffix(path.suffix + ".tmp")
    with temp_path.open("w", encoding="utf-8") as file:
      json.dump(data, file, ensure_ascii=False, indent=2)
      file.flush()
      os.fsync(file.fileno())
    os.replace(temp_path, path)


def load_products_file(path=PRODUCTS_FILE):
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def validate_products_data(data):
    return bool(data and isinstance(data.get("products"), list))


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
    write_json_atomic(CHANGES_FILE, payload)
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
    write_json_atomic(PRODUCTS_FILE, data)


def image_response(handler, image_url):
    parsed = urlparse(image_url)
    if parsed.scheme != "https" or parsed.netloc not in {"linella.md", "www.linella.md"}:
        json_response(handler, 400, {"error": "URL imagine invalid"})
        return
    if not parsed.path.startswith("/public/"):
        json_response(handler, 400, {"error": "Imaginea nu este permisa"})
        return

    request = urllib.request.Request(
        image_url,
        headers={"User-Agent": getattr(scrape_linella, "USER_AGENT", "Mozilla/5.0")},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        max_size = 5 * 1024 * 1024
        content_length = int(response.headers.get("Content-Length") or "0")
        if content_length > max_size:
            json_response(handler, 413, {"error": "Imaginea este prea mare"})
            return
        body = response.read()
        if len(body) > max_size:
            json_response(handler, 413, {"error": "Imaginea este prea mare"})
            return
        content_type = response.headers.get("Content-Type", "image/jpeg")
    if not content_type.startswith("image/"):
        json_response(handler, 400, {"error": "Fisierul nu este imagine"})
        return
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Cache-Control", "no-store")
    cors_headers(handler)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, max_pages=300, sleep_seconds=0.1, **kwargs):
        self.max_pages = max_pages
        self.sleep_seconds = sleep_seconds
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")

    def do_OPTIONS(self):
        self.send_response(204)
        cors_headers(self)
        self.send_header("Content-Length", "0")
        self.end_headers()

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
            cors_headers(self)
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
            cors_headers(self)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/status":
            json_response(self, 200, get_status())
            return
        if path == "/api/image":
            params = parse_qs(urlparse(self.path).query)
            image_url = unquote(params.get("url", [""])[0])
            try:
                image_response(self, image_url)
            except Exception as exc:
                json_response(self, 502, {"error": str(exc)})
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
        if path == "/api/reset-refresh":
            current = get_status()
            if current.get("running") and not refresh_is_stale(current):
                json_response(self, 409, {
                    **current,
                    "message": "Actualizarea este deja pornita. Asteapta finalizarea.",
                    "stale": False,
                })
                return
            reset_refresh_state()
            json_response(self, 200, get_status())
            return

        if path != "/api/refresh":
            json_response(self, 404, {"error": "Not found"})
            return
        current = get_status()
        if current["running"]:
            if refresh_is_stale(current):
                reset_refresh_state("Actualizarea precedenta a ramas blocata si a fost resetata.")
            else:
                json_response(self, 409, {
                    **current,
                    "message": "Actualizarea este deja pornita. Asteapta finalizarea.",
                    "stale": False,
                })
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
