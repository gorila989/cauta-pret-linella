#!/usr/bin/env python3
import argparse
import datetime as dt
import html
import json
import re
import time
import urllib.request
from pathlib import Path
from urllib.parse import urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed


BASE_URL = "https://linella.md"
DEFAULT_SOURCE_URL = "https://linella.md/ro/catalog"
USER_AGENT = "Mozilla/5.0 (compatible; CautaPret/1.0; +https://linella.md/)"


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def clean_text(value):
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def parse_price_block(block):
    block_text = clean_text(block)
    discount_match = re.search(r"-(\d+)%", block_text)
    discount = f"-{discount_match.group(1)}%" if discount_match else ""

    unit_match = re.search(r"/\s*([0-9.]+kg|kg|buc|l)\b", block_text, re.IGNORECASE)
    unit = f"/{unit_match.group(1)}" if unit_match else ""

    values = [float(match.group(1).replace(",", ".")) for match in re.finditer(r"(?<!\d)(\d{1,5}[.,]\d{2})(?!\d)", block_text)]
    if not values:
        return None

    price = values[-1]
    old_price = values[0] if len(values) > 1 and values[0] != price else None
    return price, old_price, discount, unit


def parse_products(page_html):
    products = []
    seen_names = set()
    pattern = re.compile(
        r'<a[^>]+href="(?P<href>/ro/catalog/[^"?]+/[^"?]+[^"]*)"[^>]*>(?P<title>.*?)</a>(?P<tail>.*?)'
        r'(?=<a[^>]+href="/ro/catalog/[^"?]+/[^"?]+|<ul class="pagination"|</body>)',
        re.IGNORECASE | re.DOTALL,
    )

    for match in pattern.finditer(page_html):
        name = clean_text(match.group("title"))
        if not name or len(name) < 3:
            continue
        price_data = parse_price_block(match.group("tail"))
        if not price_data:
            continue
        price, old_price, discount, unit = price_data
        key = name.lower()
        if key in seen_names:
            continue
        seen_names.add(key)
        product_path = html.unescape(match.group("href")).split("?", 1)[0]
        products.append(
            {
                "name": name,
                "price": price,
                "old_price": old_price,
                "discount": discount,
                "is_promo": bool(discount or old_price),
                "product_code": "",
                "unit": unit,
                "url": urljoin(BASE_URL, product_path),
            }
        )
    return products


def parse_detail(page_html):
    code_match = re.search(r"Cod produs:\s*<span>\s*([^<]+)\s*</span>", page_html, re.IGNORECASE)
    code = clean_text(code_match.group(1)) if code_match else ""
    return {"product_code": code}


def enrich_product(product):
    try:
        details = parse_detail(fetch(product["url"]))
        return {**product, **details}
    except Exception as exc:
        return {**product, "detail_error": str(exc)}


def scrape(source_url, max_pages, sleep_seconds, with_codes=False, detail_workers=6):
    all_products = []
    seen_urls = set()
    for page in range(1, max_pages + 1):
        url = source_url if page == 1 else f"{source_url}?page={page}"
        print(f"Downloading {url}")
        page_products = parse_products(fetch(url))
        print(f"  found {len(page_products)} products")
        for product in page_products:
            if product["url"] not in seen_urls:
                seen_urls.add(product["url"])
                all_products.append(product)
        if not page_products:
            break
        time.sleep(sleep_seconds)

    if with_codes and all_products:
        print(f"Downloading product codes for {len(all_products)} products")
        enriched = []
        with ThreadPoolExecutor(max_workers=detail_workers) as executor:
            futures = [executor.submit(enrich_product, product) for product in all_products]
            for index, future in enumerate(as_completed(futures), start=1):
                product = future.result()
                enriched.append(product)
                if index % 100 == 0:
                    print(f"  codes checked: {index}/{len(all_products)}")
        all_products = enriched
    return all_products


def main():
    parser = argparse.ArgumentParser(description="Scrape Linella prices into products.json.")
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL, help="Linella catalog or promotion URL.")
    parser.add_argument("--max-pages", type=int, default=300, help="How many pages to import. Stops earlier when a page is empty.")
    parser.add_argument("--sleep", type=float, default=0.4, help="Seconds to wait between requests.")
    parser.add_argument("--with-codes", action="store_true", help="Also open each product page and import product codes.")
    parser.add_argument("--detail-workers", type=int, default=6, help="Parallel product detail requests when --with-codes is used.")
    parser.add_argument("--out", default="products.json", help="Output JSON file.")
    args = parser.parse_args()

    products = scrape(args.source_url, args.max_pages, args.sleep, args.with_codes, args.detail_workers)
    payload = {
        "source": args.source_url,
        "generated_at": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "products": sorted(products, key=lambda item: item["name"].lower()),
    }
    output = Path(args.out)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(products)} products to {output}")


if __name__ == "__main__":
    main()
