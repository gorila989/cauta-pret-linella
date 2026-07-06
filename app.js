const state = {
  products: [],
  query: "",
  sort: "name",
  category: "all",
  subcategory: "all",
  onlyPromo: false,
  discountPercent: "all",
  listMode: "all",
  visibleLimit: 30,
  hasUserFilter: false,
  collectedCodes: new Set(),
  priceHistory: {},
  barcodeExcelMap: {},
  promoSnapshot: {},
  expiredPromos: []
};

const DB_NAME = "cauta-pret-offline";
const DB_STORE = "cache";
const PRODUCTS_CACHE_KEY = "products";
const NEW_SUBCATEGORY = "__new_products__";

const els = {
  meta: document.getElementById("meta"),
  form: document.getElementById("searchForm"),
  input: document.getElementById("searchInput"),
  clear: document.getElementById("clearButton"),
  results: document.getElementById("results"),
  empty: document.getElementById("emptyState"),
  count: document.getElementById("resultCount"),
  category: document.getElementById("categoryFilter"),
  subcategory: document.getElementById("subcategoryFilter"),
  discount: document.getElementById("discountFilter"),
  sortName: document.getElementById("sortName"),
  sortPrice: document.getElementById("sortPrice"),
  onlyPromo: document.getElementById("onlyPromo"),
  codes: document.getElementById("codesButton"),
  expiredPromos: document.getElementById("expiredPromosButton"),
  clearExpiredPromos: document.getElementById("clearExpiredPromosButton"),
  exportCodes: document.getElementById("exportCodesButton"),
  importExcel: document.getElementById("importExcelButton"),
  excelInput: document.getElementById("excelInput"),
  scanBarcode: document.getElementById("scanBarcodeButton"),
  scannerInput: document.getElementById("scannerCodeInput"),
  refresh: document.getElementById("refreshButton"),
  refreshStatus: document.getElementById("refreshStatus"),
  loadMore: document.getElementById("loadMoreButton"),
  codesTotal: document.getElementById("codesTotal"),
  theme: document.getElementById("themeToggle"),
  imageModal: document.getElementById("imageModal"),
  imageModalImg: document.getElementById("imageModalImg"),
  imageModalTitle: document.getElementById("imageModalTitle"),
  imageModalClose: document.getElementById("imageModalClose"),
  scrollTop: document.getElementById("scrollTopButton")
};

const THEME_KEY = "cauta-pret-theme";
const COLLECTED_CODES_KEY = "cauta-pret-collected-codes";
const PRICE_HISTORY_KEY = "cauta-pret-price-history";
const BARCODE_EXCEL_MAP_KEY = "cauta-pret-barcode-excel-map";
const PROMO_SNAPSHOT_KEY = "cauta-pret-promo-snapshot";
const EXPIRED_PROMOS_KEY = "cauta-pret-expired-promos";
const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

const SITE_CATEGORY_GROUPS = [
  ["Fructe, fructe de padure, Legume, Muraturi", ["fructe, legume, muraturi", "fructe", "fructe de padure", "legume", "salate verde", "verdeturi", "muraturi"]],
  ["Produse lactate", ["produse lactate", "lapte", "chefir", "iaurturi", "smantana", "branza de vaci", "branza feta", "tofu", "frisca", "lapte condensat"]],
  ["Dulciuri", ["dulciuri", "bomboane", "ciocolate", "ciocolata", "batoane", "caramele", "drajeuri", "gume", "biscuiti", "turte", "napolitane", "muffin", "chec", "panettone", "blaturi", "diabetici", "crema de ciocolata"]],
  ["Ceai si cafea", ["ceai", "cafea", "cacao", "cappucinno", "cicoare"]],
  ["Nuci, fructe uscate si seminte", ["fructe uscate", "nuci", "seminte", "amestecuri de nuci"]],
  ["Snack-uri", ["snack", "chipsuri", "nachos", "sticks", "crackers", "pesmeti", "popcorn", "arahide", "fistic", "gustari"]],
  ["Bauturi nealcoolice", ["apa minerala", "bauturi racoritoare", "suc", "nectar", "energizante"]],
  ["Bauturi alcoolice", ["vin", "divin", "votca", "vodca", "whiskey", "rom", "tequila", "gin", "brandy", "lichior", "balsam", "vermut", "aperol", "bere", "alcoolice"]],
  ["Produse congelate", ["unt", "margarina", "unt i margarina", "congelate", "peste congelat", "carne congelata", "legume congelate", "fructe congelate", "aluat congelat", "pizza", "patiserie congelata", "pelmeni", "coltunasi", "inghetata", "gheata"]]
];

const VISIBLE_MAIN_CATEGORIES = SITE_CATEGORY_GROUPS.map(([name]) => name);
const VISIBLE_MAIN_CATEGORY_SET = new Set(VISIBLE_MAIN_CATEGORIES);
const SUBCATEGORY_LABELS = {
  "unt_i_margarina": "UNT",
  "margarina": "Margarina"
};

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function productKey(product) {
  return product.url || product.product_code || product.name;
}

function loadJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function saveJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Local storage is best effort.
  }
}

function loadUserLists() {
  state.collectedCodes = new Set(loadJsonStorage(COLLECTED_CODES_KEY, []));
  state.priceHistory = loadJsonStorage(PRICE_HISTORY_KEY, {});
  state.barcodeExcelMap = loadJsonStorage(BARCODE_EXCEL_MAP_KEY, {});
  state.promoSnapshot = loadJsonStorage(PROMO_SNAPSHOT_KEY, {});
  state.expiredPromos = loadJsonStorage(EXPIRED_PROMOS_KEY, []);
}

function saveCollectedCodes() {
  saveJsonStorage(COLLECTED_CODES_KEY, [...state.collectedCodes]);
}

function savePriceHistory() {
  saveJsonStorage(PRICE_HISTORY_KEY, state.priceHistory);
}

function saveBarcodeExcelMap() {
  saveJsonStorage(BARCODE_EXCEL_MAP_KEY, state.barcodeExcelMap);
}

function savePromoHistory() {
  saveJsonStorage(PROMO_SNAPSHOT_KEY, state.promoSnapshot);
  saveJsonStorage(EXPIRED_PROMOS_KEY, state.expiredPromos);
}

function priceChangeForProduct(product) {
  const history = state.priceHistory[productKey(product)] || [];
  if (history.length < 2) return null;
  const previous = history[history.length - 2];
  const current = history[history.length - 1];
  if (!Number.isFinite(previous.price) || !Number.isFinite(current.price) || previous.price === current.price) return null;
  return {
    diff: current.price - previous.price,
    previous: previous.price,
    current: current.price
  };
}

function updatePriceHistory(products, generatedAt) {
  const stamp = generatedAt || localDateValue(new Date());
  let changed = false;
  for (const product of products) {
    if (!Number.isFinite(product.price)) continue;
    const key = productKey(product);
    const history = state.priceHistory[key] || [];
    const last = history[history.length - 1];
    if (!last || last.price !== product.price || last.generated_at !== stamp) {
      history.push({ price: product.price, generated_at: stamp });
      state.priceHistory[key] = history.slice(-6);
      changed = true;
    }
  }
  if (changed) savePriceHistory();
}

function updateCodesSummary() {
  els.codesTotal.textContent = String(state.collectedCodes.size);
}

function setListMode(mode) {
  state.listMode = state.listMode === mode ? "all" : mode;
  state.visibleLimit = 30;
  els.codes.classList.toggle("active", state.listMode === "codes");
  els.expiredPromos.classList.toggle("active", state.listMode === "expired");
  render();
}

function clearExpiredPromos() {
  state.expiredPromos = [];
  savePromoHistory();
  els.refreshStatus.textContent = "Istoricul promoțiilor expirate a fost șters.";
  if (state.listMode === "expired") render();
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function cleanExcelCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return String(value).trim().replace(/\.0$/, "");
}

function normalizeBarcodeValue(value) {
  return cleanExcelCell(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeProductCodeValue(value) {
  return cleanExcelCell(value).replace(/\s+/g, "");
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.XLSX) resolve();
      else existing.addEventListener("load", resolve, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Nu pot incarca citirea Excel."));
    document.head.appendChild(script);
  });
}

async function importBarcodeExcel(file) {
  if (!file) return;
  els.refreshStatus.textContent = "Citesc Excelul...";
  try {
    await loadScriptOnce(XLSX_URL);
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const headers = (rows[0] || []).map((name) => normalize(String(name)));
    const barcodeIndex = headers.indexOf("cod de bare");
    const productCodeIndex = headers.indexOf("cod produs");

    if (barcodeIndex < 0 || productCodeIndex < 0) {
      els.refreshStatus.textContent = "Excelul trebuie sa aiba coloanele: Cod de bare, Cod produs.";
      return;
    }

    const map = {};
    for (const row of rows.slice(1)) {
      const barcode = normalizeBarcodeValue(row[barcodeIndex]);
      const productCode = normalizeProductCodeValue(row[productCodeIndex]);
      if (barcode && productCode) {
        map[barcode] = productCode;
        const barcodeWithoutLeadingZeros = barcode.replace(/^0+/, "");
        if (barcodeWithoutLeadingZeros && !map[barcodeWithoutLeadingZeros]) {
          map[barcodeWithoutLeadingZeros] = productCode;
        }
      }
    }
    state.barcodeExcelMap = map;
    saveBarcodeExcelMap();
    els.refreshStatus.textContent = `Excel incarcat: ${Object.keys(map).length} coduri de bare.`;
  } catch (error) {
    els.refreshStatus.textContent = "Nu am putut citi fisierul Excel.";
  } finally {
    els.excelInput.value = "";
  }
}

function exportCollectedCodes() {
  const rows = state.products
    .filter((product) => product.product_code && state.collectedCodes.has(product.product_code))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));

  if (!rows.length) {
    els.refreshStatus.textContent = "Nu ai coduri colectate pentru export.";
    return;
  }

  const header = ["Cod produs", "Cod de bare", "Produs", "Pret", "Categorie", "Diviziune", "Link"];
  const lines = [
    header.map(csvCell).join(";"),
    ...rows.map((product) => [
      product.product_code,
      barcodeForProduct(product),
      product.name,
      Number.isFinite(product.price) ? product.price.toFixed(2) : "",
      mainCategoryFromProduct(product),
      subcategoryFromProduct(product),
      product.url || ""
    ].map(csvCell).join(";"))
  ];

  const date = localDateValue(new Date());
  const blob = new Blob([`\ufeff${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `coduri-produse-${date}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  els.refreshStatus.textContent = `Am descarcat ${rows.length} coduri.`;
}

function barcodeForProduct(product) {
  return barcodeForProductCode(product.product_code);
}

function barcodeForProductCode(productCode) {
  const code = normalizeProductCodeValue(productCode);
  if (!code) return "";
  const match = Object.entries(state.barcodeExcelMap).find(([, productCode]) =>
    normalizeProductCodeValue(productCode) === code
  );
  return match ? match[0] : "";
}

function isPromoProduct(product) {
  return Boolean(product.is_promo || product.discount || product.old_price);
}

function promoSnapshotRecord(product, generatedAt) {
  const key = productKey(product);
  const productCode = normalizeProductCodeValue(product.product_code);
  return {
    key,
    name: product.name || "",
    product_code: productCode,
    barcode: barcodeForProductCode(productCode),
    promo_price: Number.isFinite(product.price) ? product.price : null,
    old_price: Number.isFinite(product.old_price) ? product.old_price : null,
    discount: product.discount || "",
    url: product.url || "",
    last_seen_promo_at: generatedAt || localDateValue(new Date())
  };
}

function updateExpiredPromos(products, generatedAt) {
  const previous = state.promoSnapshot || {};
  const current = {};
  for (const product of products) {
    if (!isPromoProduct(product)) continue;
    current[productKey(product)] = promoSnapshotRecord(product, generatedAt);
  }

  const expiredByKey = new Map((state.expiredPromos || []).map((item) => [item.key, item]));
  for (const key of Object.keys(current)) {
    expiredByKey.delete(key);
  }
  for (const [key, record] of Object.entries(previous)) {
    if (current[key]) continue;
    expiredByKey.set(key, {
      ...record,
      key,
      expired_at: generatedAt || localDateValue(new Date()),
      status: "Promoție expirată"
    });
  }
  state.promoSnapshot = current;
  state.expiredPromos = [...expiredByKey.values()].sort((a, b) =>
    catalogTimeValue(b.expired_at) - catalogTimeValue(a.expired_at)
  );
  savePromoHistory();
}

function showProductFromProductCode(productCode, barcode) {
  const normalizedProductCode = normalizeProductCodeValue(productCode);
  const product = state.products.find((item) => normalizeProductCodeValue(item.product_code) === normalizedProductCode);
  if (!product) return false;
  els.input.value = normalizedProductCode;
  state.query = normalizedProductCode;
  state.category = "all";
  state.subcategory = "all";
  state.onlyPromo = false;
  state.discountPercent = "all";
  state.listMode = "all";
  state.visibleLimit = 30;
  els.onlyPromo.classList.remove("active");
  els.codes.classList.remove("active");
  renderCategories();
  renderSubcategories();
  renderDiscountOptions();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  els.refreshStatus.textContent = `Gasit dupa cod de bare: ${barcode}`;
  return true;
}

function startBarcodeScan() {
  const returnUrl = `${window.location.origin}${window.location.pathname}${window.location.search}#barcode={CODE}&format={FORMAT}`;
  const zxingUrl = `zxing://scan/?ret=${encodeURIComponent(returnUrl)}`;
  els.scannerInput.focus();
  els.scannerInput.select();
  els.refreshStatus.textContent = "Deschid ZXing. Daca nu se deschide, scaneaza in campul de jos.";
  window.location.href = zxingUrl;
}

function showProductFromBarcode(barcode) {
  if (!barcode) {
    els.refreshStatus.textContent = "Scaneaza sau scrie codul de bare.";
    return;
  }

  const normalizedBarcode = normalizeBarcodeValue(barcode);
  const barcodeWithoutLeadingZeros = normalizedBarcode.replace(/^0+/, "");
  const productCode = normalizeProductCodeValue(
    state.barcodeExcelMap[normalizedBarcode] || state.barcodeExcelMap[barcodeWithoutLeadingZeros]
  );
  if (!productCode) {
    els.refreshStatus.textContent = "Produsul nu a fost găsit.";
    return;
  }

  if (!showProductFromProductCode(productCode, barcode)) {
    els.refreshStatus.textContent = "Produsul nu a fost găsit.";
    return;
  }
}

function handleScannerCode() {
  const barcode = els.scannerInput.value.trim();
  showProductFromBarcode(barcode);
  els.scannerInput.select();
}

function barcodeFromLocation() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const hashBarcode = hashParams.get("barcode");
  if (hashBarcode) return hashBarcode;
  const params = new URLSearchParams(window.location.search);
  return params.get("barcode") || "";
}

function handleBarcodeFromUrl() {
  const barcode = barcodeFromLocation();
  if (!barcode) return;
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  els.scannerInput.value = barcode;
  showProductFromBarcode(barcode);
  params.delete("barcode");
  params.delete("format");
  hashParams.delete("barcode");
  hashParams.delete("format");
  const cleanUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${hashParams.toString() ? `#${hashParams}` : ""}`;
  window.history.replaceState({}, "", cleanUrl);
}

function categoryFromProduct(product) {
  if (product.category) return product.category;
  if (!product.category_slug) return "Fara categorie";
  return product.category_slug
    .replace(/^_+/, "")
    .replace(/_+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function categorySlugFromUrl(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    return parts[2] || "";
  } catch (error) {
    return "";
  }
}

function labelFromSlug(slug) {
  return String(slug || "")
    .replace(/^_+/, "")
    .replace(/_+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Fara diviziune";
}

function subcategoryFromProduct(product) {
  return product.subcategory_name || categoryFromProduct(product);
}

function mainCategoryFromName(name) {
  const key = normalize(name || "");
  for (const [groupName, terms] of SITE_CATEGORY_GROUPS) {
    if (terms.some((term) => {
      const termKey = normalize(term);
      return key === termKey || key.includes(termKey) || termKey.includes(key);
    })) {
      return groupName;
    }
  }
  return "Altele";
}

function mainCategoryFromProduct(product) {
  return product.main_category || mainCategoryFromName(categoryFromProduct(product));
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(2)} lei`;
}

function normalizePercentNumber(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Number(value.toFixed(Number.isInteger(value) ? 0 : 1));
}

function discountPercentFromProduct(product) {
  const match = String(product.discount || "").match(/([0-9]+(?:[.,][0-9]+)?)\s*%/);
  if (match) {
    return normalizePercentNumber(Number(match[1].replace(",", ".")));
  }
  return null;
}

function formatPercent(value) {
  return `${String(value).replace(".", ",")}%`;
}

function parseKgUnit(unit) {
  const match = String(unit || "").match(/^\/\s*([0-9]+(?:[.,][0-9]+)?)\s*kg$/i);
  if (!match) return null;
  const kg = Number(match[1].replace(",", "."));
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}

function isWeightedProduce(product) {
  const kg = parseKgUnit(product.unit);
  return kg && kg !== 1;
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isNewProduct(product) {
  const today = localDateValue(new Date());
  if (product.new_on) return product.new_on === today;
  if (!product.new_until) return false;
  const expires = Date.parse(String(product.new_until).replace(" ", "T"));
  if (!Number.isFinite(expires)) return false;
  const created = new Date(expires - 24 * 60 * 60 * 1000);
  return localDateValue(created) === today;
}

function productCard(product) {
  const key = productKey(product);
  const kgUnit = parseKgUnit(product.unit);
  const weightedProduce = isWeightedProduce(product);
  const productIsNew = isNewProduct(product);
  const collectedCode = product.product_code && state.collectedCodes.has(product.product_code);
  const barcode = barcodeForProduct(product);
  const priceChange = priceChangeForProduct(product);
  const pricePerKg = weightedProduce ? product.price / kgUnit : product.price;
  const oldPrice = product.old_price
    ? `<span>${formatPrice(weightedProduce ? product.old_price / kgUnit : product.old_price)}</span>`
    : "";
  const promo = product.discount
    ? `<span class="chip promo">${product.discount}</span>`
    : "";
  const newChip = productIsNew ? `<span class="chip new-chip">Produs nou</span>` : "";
  const priceChangeChip = priceChange
    ? `<span class="chip ${priceChange.diff > 0 ? "price-up" : "price-down"}">
        ${priceChange.diff > 0 ? "Scumpit" : "Ieftinit"}: ${formatPrice(Math.abs(priceChange.diff))}. Era ${formatPrice(priceChange.previous)}
      </span>`
    : "";
  const mainCategory = mainCategoryFromProduct(product);
  const subcategoryName = subcategoryFromProduct(product);
  const category = `<span class="chip category-chip">${escapeHtml(mainCategory)}</span>`;
  const subcategory = mainCategory !== subcategoryName
    ? `<span class="chip subcategory-chip">${escapeHtml(subcategoryName)}</span>`
    : "";
  const code = product.product_code
    ? `<span class="chip">Cod: ${escapeHtml(product.product_code)}</span>`
    : product.url
      ? `<span class="chip code-chip" data-url="${escapeHtml(product.url)}">Cod: se incarca</span>`
      : "";
  const barcodeChip = barcode ? `<span class="chip">Bare: ${escapeHtml(barcode)}</span>` : "";
  const unit = product.unit ? `<span class="chip">${weightedProduce ? "Pret calculat / kg" : product.unit}</span>` : "";
  const original = weightedProduce ? `<span class="chip">Pret site: ${formatPrice(product.price)} pentru ${kgUnit}kg</span>` : "";
  const calculator = weightedProduce
    ? `
      <div class="kg-calculator">
        <label>
          kg
          <input class="kg-input" type="number" min="0" step="0.01" inputmode="decimal" data-price-per-kg="${pricePerKg.toFixed(4)}" placeholder="0.00">
        </label>
        <strong class="kg-total">0.00 lei</strong>
      </div>
    `
    : "";
  const source = product.url
    ? `<a href="${product.url}" target="_blank" rel="noopener">${escapeHtml(product.name)}</a>`
    : escapeHtml(product.name);
  const image = product.image_url
    ? `<button class="image-button" type="button" data-image-url="${escapeHtml(product.image_url)}" data-image-title="${escapeHtml(product.name)}">
        <img class="product-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async" fetchpriority="low">
      </button>`
    : `<div class="product-image product-image-empty" aria-hidden="true"></div>`;

  return `
    <article class="product${productIsNew ? " new-product" : ""}" data-key="${escapeHtml(key)}">
      ${image}
      <div>
        <h2>${source}</h2>
        <div class="details">
          ${newChip}
          ${priceChangeChip}
          ${unit}
          ${category}
          ${subcategory}
          ${promo}
          ${code}
          ${barcodeChip}
          ${original}
        </div>
        ${calculator}
        <div class="product-actions">
          <button class="mini-action code-action${collectedCode ? " active" : ""}" type="button" data-action="code">
            ${collectedCode ? "Cod salvat" : "Adauga cod"}
          </button>
        </div>
      </div>
      <div class="price">
        <strong>${formatPrice(pricePerKg)}</strong>
        ${oldPrice}
      </div>
    </article>
  `;
}

function expiredPromoCard(item) {
  const barcode = item.barcode || barcodeForProductCode(item.product_code);
  const promoPrice = Number.isFinite(item.promo_price) ? formatPrice(item.promo_price) : "-";
  const source = item.url
    ? `<a href="${item.url}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>`
    : escapeHtml(item.name);
  return `
    <article class="product expired-product">
      <div class="product-image product-image-empty" aria-hidden="true"></div>
      <div>
        <h2>${source}</h2>
        <div class="details">
          <span class="chip expired-chip">Promoție expirată</span>
          <span class="chip">Cod: ${escapeHtml(item.product_code || "-")}</span>
          <span class="chip">Bare: ${escapeHtml(barcode || "-")}</span>
          <span class="chip">Pret promo vechi: ${escapeHtml(promoPrice)}</span>
          <span class="chip">Ultima promoție: ${escapeHtml(item.last_seen_promo_at || "-")}</span>
          <span class="chip">Expirat: ${escapeHtml(item.expired_at || "-")}</span>
        </div>
      </div>
      <div class="price">
        <strong>${escapeHtml(promoPrice)}</strong>
        <span>expirat</span>
      </div>
    </article>
  `;
}

function expiredPromoMatches(item, words) {
  if (!words.length) return true;
  const barcode = item.barcode || barcodeForProductCode(item.product_code);
  const haystack = normalize(`${item.name || ""} ${item.product_code || ""} ${barcode || ""}`);
  return words.every((word) => haystack.includes(word));
}

function renderExpiredPromos(words) {
  const items = [...(state.expiredPromos || [])]
    .filter((item) => expiredPromoMatches(item, words))
    .sort((a, b) => catalogTimeValue(b.expired_at) - catalogTimeValue(a.expired_at));
  const visible = items.slice(0, state.visibleLimit);
  els.count.textContent = String(items.length);
  els.results.innerHTML = visible.map(expiredPromoCard).join("");
  els.empty.hidden = items.length > 0;
  els.empty.textContent = "Nu există promoții expirate.";
  els.loadMore.hidden = items.length <= visible.length;
  els.loadMore.textContent = `Mai multe (${visible.length}/${items.length})`;
  updateCodesSummary();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function render() {
  const words = normalize(state.query).split(" ").filter(Boolean);
  const codeQuery = normalizeProductCodeValue(state.query);
  const strictCodeSearch = /^[0-9]+$/.test(codeQuery);
  state.hasUserFilter =
    words.length > 0 ||
    state.category !== "all" ||
    state.subcategory !== "all" ||
    state.onlyPromo ||
    state.discountPercent !== "all" ||
    state.listMode !== "all";
  if (!state.hasUserFilter) {
    els.count.textContent = String(state.products.length);
    els.results.innerHTML = "";
    els.loadMore.hidden = true;
    els.empty.hidden = false;
    els.empty.textContent = "Scrie numele produsului sau alege o categorie.";
    updateCodesSummary();
    return;
  }

  if (state.listMode === "expired") {
    renderExpiredPromos(words);
    return;
  }

  let products = state.products.filter((product) => {
    if (state.listMode === "codes" && !state.collectedCodes.has(product.product_code)) return false;
    if (state.onlyPromo && !product.discount && !product.old_price) return false;
    if (state.discountPercent !== "all" && String(discountPercentFromProduct(product)) !== state.discountPercent) return false;
    if (state.category !== "all" && mainCategoryFromProduct(product) !== state.category) return false;
    if (state.subcategory === NEW_SUBCATEGORY && !isNewProduct(product)) return false;
    if (state.subcategory !== "all" && state.subcategory !== NEW_SUBCATEGORY && product.subcategory_key !== state.subcategory) return false;
    if (!words.length) return true;
    if (strictCodeSearch) {
      return normalizeProductCodeValue(product.product_code) === codeQuery;
    }
    const haystack = product.search || normalize(`${product.name} ${product.product_code || ""}`);
    return words.every((word) => haystack.includes(word));
  });

  if (state.sort === "price") {
    products = products.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, "ro"));
  } else {
    products = products.sort((a, b) => a.name.localeCompare(b.name, "ro"));
  }

  const visible = products.slice(0, state.visibleLimit);
  els.count.textContent = String(products.length);
  els.results.innerHTML = visible.map(productCard).join("");
  els.empty.hidden = products.length > 0;
  els.empty.textContent = state.listMode === "codes"
    ? "Nu ai coduri colectate."
    : "Nu am gasit produsul. Incearca un nume mai scurt sau actualizeaza baza de date.";
  els.loadMore.hidden = products.length <= visible.length;
  els.loadMore.textContent = `Mai multe (${visible.length}/${products.length})`;
  updateCodesSummary();
  loadVisibleCodes();
}

async function loadProducts() {
  const offlineData = await loadOfflineProducts();
  if (offlineData) {
    applyProducts(offlineData, true);
    if (barcodeFromLocation()) return;
  }

  try {
    const data = await syncProducts(offlineData);
    if (data) {
      await saveOfflineProducts(data);
      applyProducts(data, false);
    }
  } catch (error) {
    if (!offlineData) {
      els.meta.textContent = "Nu pot incarca baza de produse.";
      els.empty.hidden = false;
      els.empty.textContent = "Deschide aplicatia o data cand serverul merge, ca sa salveze baza pentru offline.";
    }
  }
}

async function syncProducts(offlineData) {
  const manifestResponse = await fetch("api/manifest", { cache: "no-store" }).catch(() => null);
  if (manifestResponse && manifestResponse.ok) {
    const manifest = await manifestResponse.json();
    if (offlineData) {
      const serverTime = catalogTimeValue(manifest.generated_at);
      const offlineTime = catalogTimeValue(offlineData.generated_at);
      if (manifest.generated_at === offlineData.generated_at || (serverTime && offlineTime && serverTime < offlineTime)) {
        return null;
      }
    }

    const changesResponse = await fetch("api/changes", { cache: "no-store" }).catch(() => null);
    if (offlineData && changesResponse && changesResponse.ok) {
      const changes = await changesResponse.json();
      if (changes.base_generated_at === offlineData.generated_at) {
        return applyChanges(offlineData, changes);
      }
    }
  }

  const response = await fetchProducts();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function catalogTimeValue(value) {
  const time = Date.parse(String(value || "").replace(" ", "T"));
  return Number.isFinite(time) ? time : 0;
}

function applyChanges(baseData, changes) {
  const byKey = new Map(baseData.products.map((product) => [product.url || product.product_code || product.name, product]));
  for (const key of changes.deleted || []) {
    byKey.delete(key);
  }
  for (const product of changes.upserts || []) {
    byKey.set(product.url || product.product_code || product.name, product);
  }
  return {
    source: changes.source || baseData.source,
    generated_at: changes.generated_at,
    products: [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "ro"))
  };
}

function applyProducts(data, offline) {
  state.products = data.products.map((product) => {
    const categorySlug = product.category_slug || categorySlugFromUrl(product.url);
    const subcategoryName = SUBCATEGORY_LABELS[categorySlug] || product.category || labelFromSlug(categorySlug);
    const mainCategory = mainCategoryFromName(subcategoryName);
    return {
      ...product,
      category_slug: categorySlug,
      subcategory_slug: categorySlug,
      subcategory_key: normalize(subcategoryName),
      subcategory_name: subcategoryName,
      category: subcategoryName,
      main_category: mainCategory,
      search: normalize(`${product.name} ${product.product_code || ""}`)
    };
  }).filter((product) => VISIBLE_MAIN_CATEGORY_SET.has(product.main_category));
  if (!offline) updateExpiredPromos(state.products, data.generated_at);
  updatePriceHistory(state.products, data.generated_at);
  renderCategories();
  renderSubcategories();
  renderDiscountOptions();
  const when = data.generated_at ? `Actualizat: ${data.generated_at}` : "Baza incarcata";
  const promoCount = state.products.filter((product) => product.is_promo || product.discount || product.old_price).length;
  const mode = offline ? "Offline" : "Online";
  els.meta.textContent = `${mode}. ${when}. ${state.products.length} produse, ${promoCount} promotionale.`;
  render();
}

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveOfflineProducts(data) {
  try {
    const db = await openOfflineDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readwrite");
      transaction.objectStore(DB_STORE).put(data, PRODUCTS_CACHE_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch (error) {
    try {
      localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(data));
    } catch (localError) {
      // Offline cache is best effort; the app still works online.
    }
  }
}

async function loadOfflineProducts() {
  try {
    const db = await openOfflineDb();
    const data = await new Promise((resolve, reject) => {
      const transaction = db.transaction(DB_STORE, "readonly");
      const request = transaction.objectStore(DB_STORE).get(PRODUCTS_CACHE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (data) return data;
  } catch (error) {
    // Fall through to localStorage fallback.
  }

  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function renderCategories() {
  const available = new Set(state.products.map((product) => mainCategoryFromProduct(product)));
  const categories = VISIBLE_MAIN_CATEGORIES.filter((name) => available.has(name));

  els.category.innerHTML = [
    `<option value="all">Toate categoriile</option>`,
    ...categories.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
  ].join("");
  els.category.value = state.category;
}

function renderSubcategories() {
  const hasNewProducts = state.products.some(isNewProduct);
  const subcategories = [...new Map(
    state.products
      .filter((product) => state.category === "all" || mainCategoryFromProduct(product) === state.category)
      .map((product) => [product.subcategory_key, subcategoryFromProduct(product)])
      .filter(([slug]) => Boolean(slug))
  ).entries()].sort((a, b) => a[1].localeCompare(b[1], "ro"));

  if (
    state.subcategory !== "all" &&
    state.subcategory !== NEW_SUBCATEGORY &&
    !subcategories.some(([slug]) => slug === state.subcategory)
  ) {
    state.subcategory = "all";
  }
  if (state.subcategory === NEW_SUBCATEGORY && !hasNewProducts) {
    state.subcategory = "all";
  }

  els.subcategory.innerHTML = [
    `<option value="all">${state.category === "all" ? "Alege categoria" : "Toate diviziunile"}</option>`,
    hasNewProducts ? `<option value="${NEW_SUBCATEGORY}">Nou</option>` : "",
    ...subcategories.map(([slug, name]) => `<option value="${escapeHtml(slug)}">${escapeHtml(name)}</option>`)
  ].join("");
  els.subcategory.value = state.subcategory;
  els.subcategory.disabled = !hasNewProducts && (state.category === "all" || subcategories.length === 0);
}

function renderDiscountOptions() {
  const percents = [...new Map(
    state.products
      .map(discountPercentFromProduct)
      .filter((value) => value !== null)
      .sort((a, b) => b - a)
      .map((value) => [String(value), value])
  ).values()];

  if (state.discountPercent !== "all" && !percents.some((value) => String(value) === state.discountPercent)) {
    state.discountPercent = "all";
  }

  els.discount.innerHTML = [
    `<option value="all">Toate reducerile</option>`,
    ...percents.map((value) => `<option value="${value}">${formatPercent(value)}</option>`)
  ].join("");
  els.discount.value = state.discountPercent;
  els.discount.disabled = !state.onlyPromo || percents.length === 0;
}

function loadVisibleCodes() {
  const chips = [...document.querySelectorAll(".code-chip")];
  for (const chip of chips.slice(0, 20)) {
    fetchProductCode(chip);
  }
}

async function loadProductCode(product) {
  if (product.product_code) return product.product_code;
  if (!product.url) return "";
  const response = await fetch(`api/code?url=${encodeURIComponent(product.url)}`, { cache: "no-store" });
  if (!response.ok) return "";
  const data = await response.json();
  if (data.product_code) {
    product.product_code = data.product_code;
    product.search = normalize(`${product.name} ${product.product_code}`);
  }
  return product.product_code || "";
}

async function fetchProductCode(chip) {
  const url = chip.dataset.url;
  if (!url || chip.dataset.loading === "1") return;
  chip.dataset.loading = "1";
  try {
    const product = state.products.find((item) => item.url === url);
    const code = product ? await loadProductCode(product) : "";
    if (code) {
      chip.textContent = `Cod: ${code}`;
    } else {
      chip.textContent = "Cod: -";
    }
  } catch (error) {
    chip.textContent = "Cod: disponibil online";
  }
}

async function fetchProducts() {
  const apiResponse = await fetch("api/products", { cache: "no-store" }).catch(() => null);
  if (apiResponse && apiResponse.ok) return apiResponse;
  return fetch("products.json", { cache: "no-store" });
}

async function pollRefreshStatus() {
  for (let i = 0; i < 360; i += 1) {
    const response = await fetch("api/status", { cache: "no-store" }).catch(() => null);
    if (!response || !response.ok) break;
    const status = await response.json();
    els.refreshStatus.textContent = status.message || "";
    if (!status.running) {
      els.refresh.disabled = false;
      if (status.success) await loadProducts();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  els.refresh.disabled = false;
}

async function refreshPrices() {
  els.refresh.disabled = true;
  els.refreshStatus.textContent = "Actualizare pornita...";
  try {
    const response = await fetch("api/refresh", { method: "POST" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await pollRefreshStatus();
  } catch (error) {
    els.refresh.disabled = false;
    els.refreshStatus.textContent = "Refresh disponibil doar cand aplicatia ruleaza cu server backend.";
  }
}

function applyTheme(theme) {
  const dark = theme === "dark";
  document.body.classList.toggle("dark-theme", dark);
  els.theme.checked = dark;
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch (error) {
    // Theme preference is optional.
  }
}

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || "light";
  } catch (error) {
    return "light";
  }
}

function openImageModal(url, title) {
  if (!url) return;
  els.imageModalImg.src = url;
  els.imageModalImg.alt = title || "Poza produs";
  els.imageModalTitle.textContent = title || "";
  els.imageModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeImageModal() {
  els.imageModal.hidden = true;
  els.imageModalImg.src = "";
  els.imageModalTitle.textContent = "";
  document.body.classList.remove("modal-open");
}

function updateScrollTopButton() {
  els.scrollTop.hidden = window.scrollY < 500;
}

loadUserLists();
applyTheme(loadTheme());

els.form.addEventListener("submit", (event) => event.preventDefault());
els.input.addEventListener("input", () => {
  state.query = els.input.value;
  state.visibleLimit = 30;
  render();
});
els.category.addEventListener("change", () => {
  state.category = els.category.value;
  state.subcategory = "all";
  state.visibleLimit = 30;
  renderSubcategories();
  render();
});
els.subcategory.addEventListener("change", () => {
  state.subcategory = els.subcategory.value;
  state.visibleLimit = 30;
  render();
});
els.discount.addEventListener("change", () => {
  state.discountPercent = els.discount.value;
  if (state.discountPercent !== "all") {
    state.onlyPromo = true;
    els.onlyPromo.classList.add("active");
    els.discount.disabled = false;
  }
  state.visibleLimit = 30;
  render();
});
els.clear.addEventListener("click", () => {
  els.input.value = "";
  state.query = "";
  state.visibleLimit = 30;
  els.input.focus();
  render();
});
els.sortName.addEventListener("click", () => {
  state.sort = "name";
  state.visibleLimit = 30;
  els.sortName.classList.add("active");
  els.sortPrice.classList.remove("active");
  render();
});
els.sortPrice.addEventListener("click", () => {
  state.sort = "price";
  state.visibleLimit = 30;
  els.sortPrice.classList.add("active");
  els.sortName.classList.remove("active");
  render();
});
els.onlyPromo.addEventListener("click", () => {
  state.onlyPromo = !state.onlyPromo;
  if (!state.onlyPromo) {
    state.discountPercent = "all";
    els.discount.value = "all";
  }
  els.discount.disabled = !state.onlyPromo;
  state.visibleLimit = 30;
  els.onlyPromo.classList.toggle("active", state.onlyPromo);
  render();
});
els.codes.addEventListener("click", () => setListMode("codes"));
els.expiredPromos.addEventListener("click", () => setListMode("expired"));
els.clearExpiredPromos.addEventListener("click", clearExpiredPromos);
els.exportCodes.addEventListener("click", exportCollectedCodes);
els.importExcel.addEventListener("click", () => {
  els.excelInput.click();
});
els.excelInput.addEventListener("change", () => {
  importBarcodeExcel(els.excelInput.files[0]);
});
els.scanBarcode.addEventListener("click", () => startBarcodeScan());
els.scannerInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  handleScannerCode();
});
els.scannerInput.addEventListener("change", handleScannerCode);
els.refresh.addEventListener("click", refreshPrices);
els.loadMore.addEventListener("click", () => {
  state.visibleLimit += 30;
  render();
});
els.scrollTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
window.addEventListener("scroll", updateScrollTopButton, { passive: true });
window.addEventListener("hashchange", handleBarcodeFromUrl);
els.theme.addEventListener("change", () => {
  applyTheme(els.theme.checked ? "dark" : "light");
});
els.results.addEventListener("input", (event) => {
  if (!event.target.classList.contains("kg-input")) return;
  const input = event.target;
  const pricePerKg = Number(input.dataset.pricePerKg);
  const kg = Number(input.value);
  const total = Number.isFinite(pricePerKg) && Number.isFinite(kg) ? pricePerKg * kg : 0;
  const output = input.closest(".kg-calculator")?.querySelector(".kg-total");
  if (output) output.textContent = formatPrice(total);
});
els.results.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]");
  if (action) {
    const card = action.closest(".product");
    const key = card?.dataset.key;
    if (!key) return;
    if (action.dataset.action === "code") {
      const product = state.products.find((item) => productKey(item) === key);
      if (!product) return;
      action.disabled = true;
      const code = await loadProductCode(product).catch(() => "");
      action.disabled = false;
      if (!code) {
        els.refreshStatus.textContent = "Nu am gasit cod pentru acest produs.";
        return;
      }
      if (state.collectedCodes.has(code)) state.collectedCodes.delete(code);
      else state.collectedCodes.add(code);
      saveCollectedCodes();
    }
    render();
    return;
  }

  const button = event.target.closest(".image-button");
  if (!button) return;
  openImageModal(button.dataset.imageUrl, button.dataset.imageTitle);
});
els.imageModalClose.addEventListener("click", closeImageModal);
els.imageModal.addEventListener("click", (event) => {
  if (event.target === els.imageModal) closeImageModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.imageModal.hidden) closeImageModal();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    let reloadedForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("service-worker.js").then((registration) => {
      registration.update().catch(() => {});
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    }).catch(() => {});
  });
}

loadProducts().then(handleBarcodeFromUrl);
