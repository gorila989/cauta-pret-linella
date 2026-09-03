#!/usr/bin/env python3
import argparse
import datetime as dt
import html
import json
import re
import time
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed


BASE_URL = "https://linella.md"
DEFAULT_SOURCE_URL = "https://linella.md/ro/catalog"
USER_AGENT = "Mozilla/5.0 (compatible; CautaPret/1.0; +https://linella.md/)"
DEFAULT_CATEGORY_GROUPS = [
    ("Back to School", ["papetarie", "accesorii_pentru_desen_", "rechizite_scolare"]),
    ("Fructe, fructe de padure, Legume, Muraturi", ["fructe", "legume", "salate_i_verdeturi", "muraturi"]),
    ("Culinarie", ["fel_principal", "salate", "fast_food", "placinte"]),
    ("Panificatie", ["paine", "paine_uscata_i_expandata", "colaci", "specialitati_paine", "patiserie", "covrigi", "gogosi"]),
    ("Produse de cofetarie", ["torturi", "prajituri"]),
    ("Mezeluri si crenvursti", ["parizer", "crenvursti_i_safalade", "carnati", "sunca", "salamuri_crud-uscate", "salamuri_fiert-afumate", "specialitati"]),
    ("Produse lactate", ["lapte", "chefir", "iaurturi", "smantana", "branza_proaspata", "alte_produse_proaspete", "frisca_i_lapte_condensat", "lapte_condensat", "deserturi", "unt_i_margarina", "margarina"]),
    ("Cascaval", ["cascaval", "branzeturi", "specialitati_", "crema_de_branza", "branza_topita"]),
    ("Oua", ["oua"]),
    ("Carne", ["carne_de_pui", "carne_tocata", "marinate", "alte_semipreparate_din_carne_carnaciori_mici_perisoare"]),
    ("Peste", ["peste_proaspat", "fructe_de_mare", "peste_afumat", "peste_sarat", "peste_uscat", "icre_de_peste_si_preparate_din_icre"]),
    ("Dulciuri", ["bomboane_i_praline", "ciocolate_in_cutie", "ciocolata_tablete", "batoane_de_ciocolata", "caramele_i_drajeuri", "gume_de_mestecat_i_bomboane_gumate", "biscuiti_i_fursecuri", "turte_dulci_i_covrigi", "_napolitane", "rulade_muffin_i_chec", "blaturi_tort", "alte_dulciuri", "produse_pentru_diabetici", "crema_de_ciocolata"]),
    ("Ceai si cafea", ["ceai_pachetele", "ceai_infuzie", "cafea", "cafea_macinata_", "cafea_boabe_", "cafea_in_capsule", "cappucinno__mixuri", "cacao", "cicoare"]),
    ("Crupe si boboase", ["orez", "hrisca", "bulgur", "arpacas", "mei", "crupe_de_gris", "crupe_de_arnaut", "malai", "couscous", "griu", "crupa_de_orz", "mazare", "linte", "naut_", "fasole", "amestec_pentru_supa"]),
    ("Bacanie", ["_totul_pentru_sushi", "zahar", "sare", "paste", "faina", "cereale_i_fulgi_de_ovaz", "otet_i_ulei", "maioneza__ketchup__sosuri", "sosuri_i_dressing", "bors_acru", "salate_ambalate", "alimente_instant", "condimente_si_mirodenii", "articole_pentru_copt_si_deserturi", "jeleu_kissel"]),
    ("Conserve", ["conserve_din_carne", "conserve_de_peste", "conserve_din_legume", "masline_", "pateuri_vegetale", "ciuperci", "miere_i_gem_i_dulceturi", "_miere"]),
    ("Produse congelate", ["congelate_din_peste", "congelate_din_carne", "legume_congelate", "fructe_congelate", "aluat_congelat", "pizza_i_patiserie_congelate", "pelmeni_i_coltunasi", "inghetata", "alte_produse_congelate"]),
    ("Nuci, fructe uscate si seminte", ["fructe_uscate_532", "nuci", "amestecuri_de_nuci_si_fructe_uscate", "seminte"]),
    ("Snack-uri", ["chipsuri", "sticks__crackers_i_snack_expandat", "pesmeti", "popcorn", "seminte_floarea_soarelui_i_dovleac", "arahide_fistic_i_mix_seminte", "gustari_de_peste_si_carne"]),
    ("Bauturi nealcoolice", ["apa_minerala", "bauturi_racoritoare", "suc_i_nectar", "energizante"]),
    ("Bauturi alcoolice", ["vin", "vin_spumant", "divin", "votca_", "whiskey", "rom_tequila_gin_brandi", "lichior_balsam_vermut_aperol", "bere", "bauturi_slab_alcoolice"]),
    ("Produse chimice de uz casnic", ["detr", "detergenti", "articole_pentru_curatenia_suprafetelor", "produse_pentru_masina_de_spalat_vase", "repelente_pentru_insecte", "odorizanti"]),
    ("Produse cosmetice", ["machiaj", "creme", "masti_cosmetice_si_patches", "produse_de_curatare_si_demachiere", "vopsea_tonice", "seria_solara"]),
    ("Igiena si ingrijire", ["sapun", "ingrijire__corp", "ingrijire_par", "igiena_orala", "igiena_intima", "produse_din_bumbac", "produse_cosmetice_pentru_barbati", "servetele_umede", "trusa_de_prim_ajutor"]),
    ("Lumea copiilor", ["alimentatia_copiilor", "produse_cosmetice_igiena_protectie", "scutece_si_servetele_umede", "produse_chimice_de_uz_casnic", "accesorii_pentru_copii", "produse_pentru_mamici", "jucarii"]),
    ("Hrana & Accesorii animale", ["hrana_pisici", "hrana_caini", "alte_produse_pentru_animale", "asternut_igienic_pentru_pisici"]),
    ("Totul pentru CASA MODERNA", ["depozitarea_si_organizarea_spatiului", "baie", "decoratiune_interioara", "lumanari", "flori_artificiale"]),
    ("Bucatarie", ["vesela_pentru_gatit_", "vesela_de_masa", "vesela_pentru_copii", "accesorii_pentru_bucatarie", "vesela_de_unica_folosinta", "depozitarea_alimentelor", "termosuri__cani_termice"]),
    ("Bunuri gospodaresti", ["produse_din_hartie", "folie__folie_alimentara__hartie_de_copt", "totul_pentru_curatenie_in_casa", "inventar_curatenie", "mese_de_calcat__uscatoare_de_rufe__scari", "unelte", "saci_menajeri"]),
    ("Totul pentru masina", ["curatenie_auto", "odorizante", "accesorii-pentru-masina"]),
    ("Electrocasnice. Iluminat", ["aparate_de_bucatarie", "electrocasnice", "echipamente_de_frumusete", "produse_electrice", "lampi_de_masa_noptiere__decor_iluminat", "_lanterne", "baterii"]),
    ("Tehnica Audio-Video", ["casti", "bluetooth_boxe__radio", "accesorii_pentru_echipamente_audio-video"]),
    ("Plante de casa. Gradina. Livada", ["plante_de_apartament", "substrat_ingrasamant_pentru_flori", "ghivece_si_accesorii", "inventar_"]),
    ("Cartele SIM, Bilete de loterie", ["cartele_sim"]),
]
DEFAULT_CATEGORY_SLUGS = [slug for _, slugs in DEFAULT_CATEGORY_GROUPS for slug in slugs]
DEFAULT_SLUG_GROUP = {slug: group for group, slugs in DEFAULT_CATEGORY_GROUPS for slug in slugs}


CATEGORY_NAMES = {
    "picnic": "Picnic. Vacanta",
    "_distractie_de_vara": "Picnic. Vacanta",
    "cadouri": "Cadouri. Totul pentru sarbatori",
    "literatura_pentru_copii": "Carti",
    "literatura_de_dezvoltare_personala": "Carti",
    "romane": "Carti",
    "legume": "Legume",
    "fructe": "Fructe, fructe de padure",
    "salate_i_verdeturi": "Salate & Verdeturi",
    "muraturi": "Muraturi, adjika",
    "fel_principal": "Culinarie",
    "patiserie": "Panificatie",
    "paine": "Panificatie",
    "paine_uscata_i_expandata": "Panificatie",
    "produse_de_cofetarie": "Produse de cofetarie",
    "deserturi": "Produse de cofetarie",
    "biscuiti_i_fursecuri": "Produse de cofetarie",
    "salamuri_fiert-afumate": "Mezeluri si crenvursti",
    "crenvursti": "Mezeluri si crenvursti",
    "lapte": "Produse lactate",
    "iaurturi": "Produse lactate",
    "cascaval": "Cascaval",
    "oua": "Oua",
    "carne": "Carne",
    "congelate_din_carne": "Carne",
    "unt_i_margarina": "UNT",
    "margarina": "Margarina",
    "congelate_din_peste": "Produse congelate",
    "legume_congelate": "Produse congelate",
    "fructe_congelate": "Produse congelate",
    "aluat_congelat": "Produse congelate",
    "pizza_i_patiserie_congelate": "Produse congelate",
    "pelmeni_i_coltunasi": "Produse congelate",
    "inghetata": "Produse congelate",
    "alte_produse_congelate": "Produse congelate",
    "detr": "Detergenti de vase",
    "detergenti": "Detergenti pentru rufe",
    "articole_pentru_curatenia_suprafetelor": "Articole pentru curatenia suprafetelor",
    "produse_pentru_masina_de_spalat_vase": "Produse pentru masina de spalat vase/masina de spalat",
    "repelente_pentru_insecte": "Repelente pentru insecte",
    "odorizanti": "Odorizanti",
    "machiaj": "Machiaj",
    "creme": "Creme, Ser",
    "masti_cosmetice_si_patches": "Masti si plasturi cosmetici etc.",
    "produse_de_curatare_si_demachiere": "Produse de curatare si demachiere",
    "vopsea_tonice": "Vopsea, tonice",
    "seria_solara": "Seria solara",
    "sapun": "Sapun",
    "ingrijire__corp": "Ingrijire corp",
    "ingrijire_par": "Ingrijire par",
    "igiena_orala": "Igiena orala",
    "igiena_intima": "Igiena intima",
    "produse_din_bumbac": "Produse din bumbac",
    "produse_cosmetice_pentru_barbati": "Igiena si cosmetica barbatilor",
    "servetele_umede": "Servetele umede",
    "trusa_de_prim_ajutor": "Trusa de prim ajutor",
    "alimentatia_copiilor": "Alimentatia copiilor",
    "produse_cosmetice_igiena_protectie": "Produse cosmetice. Igiena. Protectie",
    "scutece_si_servetele_umede": "Scutece si servetele umede",
    "produse_chimice_de_uz_casnic": "Produse chimice de uz casnic",
    "accesorii_pentru_copii": "Accesorii pentru copii",
    "produse_pentru_mamici": "Produse pentru mamici",
    "jucarii": "Jucarii",
    "hrana_pisici": "Hrana pisici",
    "hrana_caini": "Hrana caini",
    "alte_produse_pentru_animale": "Alte Produse pentru animale",
    "asternut_igienic_pentru_pisici": "Asternut Igienic. Scutec",
    "papetarie": "Caiete, blocnotes, agende",
    "accesorii_pentru_desen_": "Totul pentru desen, creativitate",
    "rechizite_scolare": "Rechizite scolare",
    "salate_i_verdeturi": "Salate & Verdeturi",
    "fast_food": "ZideZi - To Go",
    "placinte": "Placinde, placinte, paine plate, vertutas",
    "colaci": "Colaci",
    "specialitati_paine": "Lavas, Pita",
    "covrigi": "Covrigi",
    "gogosi": "Gogosi",
    "torturi": "Torturi",
    "prajituri": "Prajituri",
    "parizer": "Parizer",
    "crenvursti_i_safalade": "Crenvursti & Safalade",
    "carnati": "Afumaturi",
    "sunca": "Sunca",
    "salamuri_crud-uscate": "Salamuri crud-uscate",
    "specialitati": "Toba, rulade, slanina",
    "chefir": "Chefir",
    "smantana": "Smantana",
    "branza_proaspata": "Branza de vaci, branza feta",
    "alte_produse_proaspete": "Branza tofu",
    "frisca_i_lapte_condensat": "Frisca",
    "lapte_condensat": "Lapte condensat",
    "deserturi": "Deserturi",
    "branzeturi": "Mozzarella",
    "specialitati_": "Cascaval cu mucegai",
    "crema_de_branza": "Tartina de branza",
    "branza_topita": "Branza, moale, procesata, portionat",
    "carne_de_pui": "Carne proaspata",
    "carne_tocata": "Carne tocata",
    "marinate": "Marinate",
    "alte_semipreparate_din_carne_carnaciori_mici_perisoare": "Carnaciori si mici",
    "peste_proaspat": "Peste proaspat",
    "fructe_de_mare": "Fructe de mare",
    "peste_afumat": "Peste afumat",
    "peste_sarat": "Peste sarat",
    "peste_uscat": "Peste uscat",
    "icre_de_peste_si_preparate_din_icre": "Icre de peste si preparate din icre",
    "ciocolate_in_cutie": "Ciocolate in cutie",
    "caramele_i_drajeuri": "Caramele & drajeuri",
    "rulade_muffin_i_chec": "Rulade, muffin, chec, panettone",
    "blaturi_tort": "Blaturi tort, tartele",
    "produse_pentru_diabetici": "Produse pentru diabetici",
    "cafea_macinata_": "Cafea macinata",
    "cafea_boabe_": "Cafea boabe",
    "cappucinno__mixuri": "Cappucinno, mixuri",
    "cicoare": "Cicoare",
    "orez": "Orez",
    "hrisca": "Hrisca",
    "bulgur": "Bulgur",
    "arpacas": "Arpacas",
    "mei": "Mei",
    "crupe_de_gris": "Crupe de gris",
    "crupe_de_arnaut": "Crupe de arnaut",
    "malai": "Malai",
    "couscous": "Couscous",
    "griu": "Griu",
    "crupa_de_orz": "Crupa de orz",
    "mazare": "Mazare",
    "linte": "Linte",
    "naut_": "Naut",
    "fasole": "Fasole",
    "amestec_pentru_supa": "Alte tipuri",
    "_totul_pentru_sushi": "Bucataria orientala. Sushi",
    "zahar": "Zahar",
    "sare": "Sare",
    "paste": "Paste",
    "faina": "Faina, pesmet",
    "cereale_i_fulgi_de_ovaz": "Fulgi de ovaz, cereale, muesli, granola",
    "otet_i_ulei": "Ulei",
    "maioneza__ketchup__sosuri": "Maioneza, ketchup",
    "sosuri_i_dressing": "Sosuri & Dressing",
    "bors_acru": "Bors acru",
    "salate_ambalate": "Otet",
    "alimente_instant": "Alimente instant",
    "condimente_si_mirodenii": "Condimente si Mirodenii",
    "articole_pentru_copt_si_deserturi": "Articole pentru copt si deserturi",
    "jeleu_kissel": "Jeleu, Kissel",
    "conserve_din_carne": "Conserve din carne",
    "conserve_de_peste": "Conserve de peste",
    "conserve_din_legume": "Conserve din legume",
    "masline_": "Masline",
    "pateuri_vegetale": "Pateuri vegetale",
    "ciuperci": "Ciuperci",
    "miere_i_gem_i_dulceturi": "Conserve din fructe",
    "_miere": "Miere",
    "pesmeti": "Pesmeti",
    "gustari_de_peste_si_carne": "Gustari de peste si carne",
    "depozitarea_si_organizarea_spatiului": "Depozitare si organizarea spatiului",
    "baie": "Accesorii pentru baie",
    "decoratiune_interioara": "Decor si accesorii pentru casa",
    "lumanari": "Lumanari",
    "flori_artificiale": "Flori artificiale",
    "vesela_pentru_gatit_": "Vesela pentru gatit",
    "vesela_de_masa": "Vesela de masa",
    "vesela_pentru_copii": "Vesela pentru copii",
    "accesorii_pentru_bucatarie": "Accesorii pentru bucatarie",
    "vesela_de_unica_folosinta": "Vesela de unica folosinta",
    "depozitarea_alimentelor": "Depozitarea si organizarea spatiului",
    "termosuri__cani_termice": "Termosuri, cani termice",
    "produse_din_hartie": "Produse din hartie",
    "folie__folie_alimentara__hartie_de_copt": "Folie, folie alimentara, hartie de copt",
    "totul_pentru_curatenie_in_casa": "Totul pentru curatenie in casa",
    "inventar_curatenie": "Inventar curatenie",
    "mese_de_calcat__uscatoare_de_rufe__scari": "Mese de calcat, uscatoare de rufe, scari",
    "unelte": "Unelte",
    "saci_menajeri": "Saci menajeri",
    "curatenie_auto": "Curatenie auto",
    "odorizante": "Odorizante auto",
    "accesorii-pentru-masina": "Accesorii pentru masina",
    "aparate_de_bucatarie": "Tehnica de bucatarie",
    "electrocasnice": "Tehnica pentru casa",
    "echipamente_de_frumusete": "Tehnica pentru frumusete",
    "produse_electrice": "Produse Electrice",
    "lampi_de_masa_noptiere__decor_iluminat": "Lampi de masa. Noptiere, decor iluminat",
    "_lanterne": "Lanterne",
    "baterii": "Baterii",
    "casti": "Casti",
    "bluetooth_boxe__radio": "Bluetooth boxe, radio",
    "accesorii_pentru_echipamente_audio-video": "Accesorii pentru echipamente audio-video",
    "plante_de_apartament": "Plante de apartament",
    "substrat_ingrasamant_pentru_flori": "Substrat. Ingrasamant pentru flori",
    "ghivece_si_accesorii": "Ghivece si Accesorii",
    "inventar_": "Inventar",
    "cartele_sim": "Cartele SIM, Bilete de loterie",
}


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def clean_text(value):
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def pretty_category(slug):
    if not slug:
        return "Fara categorie"
    if slug in CATEGORY_NAMES:
        return CATEGORY_NAMES[slug]
    return slug.strip("_").replace("_", " ").capitalize()


def category_slug_from_url(url):
    parts = [part for part in urlparse(url).path.split("/") if part]
    return parts[2] if len(parts) > 2 else ""


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
    seen_urls = set()
    pattern = re.compile(
        r'<a[^>]+href="(?P<href>/ro/catalog/[^"?]+/[^"?]+[^"]*)"[^>]*>(?P<title>.*?)</a>(?P<tail>.*?)'
        r'(?=<a[^>]+href="/ro/catalog/[^"?]+/[^"?]+|<ul class="pagination"|</body>)',
        re.IGNORECASE | re.DOTALL,
    )

    for match in pattern.finditer(page_html):
        name_match = re.search(r'class="tovar__name"[^>]*>(?P<name>.*?)</h3>', match.group("title"), re.IGNORECASE | re.DOTALL)
        name = clean_text(name_match.group("name")) if name_match else clean_text(match.group("title"))
        if not name or len(name) < 3:
            continue
        item_start = max(0, match.start() - 2500)
        item_end = min(len(page_html), match.end() + 2500)
        item = page_html[item_start:item_end]
        price_data = parse_price_block(match.group("tail"))
        if not price_data:
            continue
        price, old_price, discount, unit = price_data
        product_path = html.unescape(match.group("href")).split("?", 1)[0]
        product_url = urljoin(BASE_URL, product_path)
        if product_url in seen_urls:
            continue
        seen_urls.add(product_url)
        category_slug = category_slug_from_url(product_url)
        image_match = re.search(r'<img[^>]+src="(?P<src>/public/products/[^"]+)"', item, re.IGNORECASE)
        code_match = re.search(r'data-SKU="(?P<code>[^"]*)"', item, re.IGNORECASE)
        products.append(
            {
                "name": name,
                "price": price,
                "old_price": old_price,
                "discount": discount,
                "is_promo": bool(discount or old_price),
                "product_code": clean_text(code_match.group("code")) if code_match else "",
                "category_slug": category_slug,
                "category": pretty_category(category_slug),
                "image_url": urljoin(BASE_URL, html.unescape(image_match.group("src"))) if image_match else "",
                "unit": unit,
                "url": product_url,
            }
        )
    return products


def parse_total_pages(page_html):
    pages = [1]
    for match in re.finditer(r'[?&]page=(\d+)', page_html, re.IGNORECASE):
        pages.append(int(match.group(1)))
    return max(pages)


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


def group_category_slugs(category_slugs):
    grouped = []
    by_name = {}
    for slug in category_slugs:
        group_name = DEFAULT_SLUG_GROUP.get(slug, "Alte categorii")
        if group_name not in by_name:
            by_name[group_name] = []
            grouped.append((group_name, by_name[group_name]))
        by_name[group_name].append(slug)
    return grouped


def scrape(source_url, max_pages, sleep_seconds, with_codes=False, detail_workers=6, category_slugs=None):
    all_products = []
    seen_urls = set()
    slugs = [slug.strip().strip("/") for slug in category_slugs or [] if slug.strip()]
    grouped_sources = group_category_slugs(slugs) if slugs else [("Catalog complet", [""])]

    for group_index, (group_name, group_slugs) in enumerate(grouped_sources, start=1):
        print(f"Division progress: {group_index}/{len(grouped_sources)} {group_name}", flush=True)
        for source_index, source_name in enumerate(group_slugs, start=1):
            current_source_url = source_url if not source_name else f"{source_url.rstrip('/')}/{source_name}"
            print(f"Category progress: {source_index}/{len(group_slugs)} {source_name or 'catalog'}", flush=True)
            total_pages = None
            for page in range(1, max_pages + 1):
                url = current_source_url if page == 1 else f"{current_source_url}?page={page}"
                print(f"Downloading {url}", flush=True)
                try:
                    page_html = fetch(url)
                except Exception as exc:
                    print(f"  category skipped: {exc}", flush=True)
                    break
                if total_pages is None:
                    total_pages = min(parse_total_pages(page_html), max_pages)
                    print(f"Total pages: {total_pages}", flush=True)
                print(f"Page progress: {page}/{total_pages}", flush=True)
                page_products = parse_products(page_html)
                for product in page_products:
                    product["main_category"] = group_name
                print(f"  found {len(page_products)} products", flush=True)
                for product in page_products:
                    if product["url"] not in seen_urls:
                        seen_urls.add(product["url"])
                        all_products.append(product)
                if not page_products:
                    break
                if total_pages and page >= total_pages:
                    break
                time.sleep(sleep_seconds)

    if with_codes and all_products:
        print(f"Downloading product codes for {len(all_products)} products", flush=True)
        enriched = []
        with ThreadPoolExecutor(max_workers=detail_workers) as executor:
            futures = [executor.submit(enrich_product, product) for product in all_products]
            for index, future in enumerate(as_completed(futures), start=1):
                product = future.result()
                enriched.append(product)
                if index % 100 == 0:
                    print(f"  codes checked: {index}/{len(all_products)}", flush=True)
        all_products = enriched
    return all_products


def main():
    parser = argparse.ArgumentParser(description="Scrape Linella prices into products.json.")
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL, help="Linella catalog or promotion URL.")
    parser.add_argument("--max-pages", type=int, default=300, help="How many pages to import. Stops earlier when a page is empty.")
    parser.add_argument("--sleep", type=float, default=0.4, help="Seconds to wait between requests.")
    parser.add_argument("--with-codes", action="store_true", help="Also open each product page and import product codes.")
    parser.add_argument("--detail-workers", type=int, default=6, help="Parallel product detail requests when --with-codes is used.")
    parser.add_argument("--category-slugs", default=",".join(DEFAULT_CATEGORY_SLUGS), help="Comma-separated Linella category slugs to import. Empty means full catalog.")
    parser.add_argument("--out", default="products.json", help="Output JSON file.")
    args = parser.parse_args()

    category_slugs = [slug.strip() for slug in args.category_slugs.split(",") if slug.strip()]
    products = scrape(args.source_url, args.max_pages, args.sleep, args.with_codes, args.detail_workers, category_slugs)
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
