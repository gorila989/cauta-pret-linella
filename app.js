const state = {
  products: [],
  query: "",
  sort: "name",
  category: "all",
  subcategory: "all",
  onlyPromo: false,
  discountPercent: "all",
  visibleLimit: 30,
  hasUserFilter: false
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
  camera: document.getElementById("cameraButton"),
  cameraInput: document.getElementById("cameraInput"),
  cameraStatus: document.getElementById("cameraStatus"),
  refresh: document.getElementById("refreshButton"),
  refreshStatus: document.getElementById("refreshStatus"),
  loadMore: document.getElementById("loadMoreButton"),
  theme: document.getElementById("themeToggle"),
  imageModal: document.getElementById("imageModal"),
  imageModalImg: document.getElementById("imageModalImg"),
  imageModalTitle: document.getElementById("imageModalTitle"),
  imageModalClose: document.getElementById("imageModalClose"),
  scrollTop: document.getElementById("scrollTopButton")
};

const THEME_KEY = "cauta-pret-theme";
const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

const SITE_CATEGORY_GROUPS = [
  ["Fructe, fructe de padure, Legume, Muraturi", ["fructe, legume, muraturi", "fructe", "fructe de padure", "legume", "salate verde", "verdeturi", "muraturi"]],
  ["Culinarie", ["culinarie", "fel principal", "salate", "to go", "placinde", "placinte", "vertutas"]],
  ["Produse Panificatie", ["panificatie", "paine", "patiserie", "colaci", "lavas", "pita", "chifle", "croissante", "khachapuri", "covrigi", "gogosi"]],
  ["Produse de cofetarie", ["produse de cofetarie", "torturi", "prajituri", "deserturi"]],
  ["Mezeluri si crenvursti", ["mezeluri", "parizer", "crenvursti", "safalade", "afumaturi", "sunca", "salamuri", "toba", "slanina"]],
  ["Produse lactate", ["produse lactate", "lapte", "chefir", "iaurturi", "smantana", "branza de vaci", "branza feta", "tofu", "frisca", "lapte condensat", "unt", "margarina"]],
  ["Cascaval", ["cascaval", "branza tare", "mozzarella", "branza moale", "branza procesata", "tartina"]],
  ["Oua", ["oua"]],
  ["Carne", ["carne", "carne proaspata", "carne tocata", "marinate", "carnaciori", "mici"]],
  ["Peste", ["peste", "fructe de mare", "icre"]],
  ["Dulciuri", ["dulciuri", "bomboane", "ciocolate", "ciocolata", "batoane", "caramele", "drajeuri", "gume", "biscuiti", "turte", "napolitane", "muffin", "chec", "panettone", "blaturi", "diabetici", "crema de ciocolata"]],
  ["Ceai si cafea", ["ceai", "cafea", "cacao", "cappucinno", "cicoare"]],
  ["Crupe si boboase", ["orez", "hrisca", "bulgur", "arpacas", "mei", "gris", "arnaut", "malai", "couscous", "grau", "orz", "mazare", "linte", "naut", "fasole", "crupe"]],
  ["Bacanie", ["bacanie", "sushi", "zahar", "sare", "paste", "faina", "pesmet", "fulgi", "cereale", "muesli", "granola", "ulei", "maioneza", "ketchup", "sosuri", "dressing", "bors", "otet", "alimente instant", "condimente", "mirodenii", "articole pentru copt", "jeleu", "kissel"]],
  ["Conserve", ["conserve", "masline", "pateuri", "ciuperci", "miere", "magiun", "gem", "dulceturi"]],
  ["Produse congelate", ["congelate", "aluat congelat", "pizza", "pelmeni", "coltunasi", "inghetata", "gheata"]],
  ["Nuci, fructe uscate si seminte", ["fructe uscate", "nuci", "seminte", "amestecuri de nuci"]],
  ["Snack-uri", ["snack", "chipsuri", "nachos", "sticks", "crackers", "pesmeti", "popcorn", "arahide", "fistic", "gustari"]],
  ["Bauturi nealcoolice", ["apa minerala", "bauturi racoritoare", "suc", "nectar", "energizante"]],
  ["Bauturi alcoolice", ["vin", "divin", "votca", "vodca", "whiskey", "rom", "tequila", "gin", "brandy", "lichior", "balsam", "vermut", "aperol", "bere", "alcoolice"]],
  ["Produse chimice de uz casnic", ["detergenti", "curatenia suprafetelor", "masina de spalat", "repelente", "odorizanti"]],
  ["Produse cosmetice", ["parfumerie", "machiaj", "creme", "ser", "masti", "plasturi cosmetici", "demachiere", "vopsea", "tonice", "solara"]],
  ["Igiena si ingrijire", ["sapun", "ingrijire corp", "ingrijire par", "igiena orala", "igiena intima", "bumbac", "barbatilor", "servetele umede", "trusa de prim ajutor"]],
  ["Hrana & Accesorii animale", ["hrana pisici", "hrana caini", "animale", "asternut"]]
];

const VISIBLE_MAIN_CATEGORIES = SITE_CATEGORY_GROUPS.map(([name]) => name);

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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

function applySearchText(text) {
  const query = String(text || "").trim();
  if (!query) return;
  els.input.value = query;
  state.query = query;
  state.visibleLimit = 30;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function searchTokens(text) {
  return [...new Set(
    normalize(text)
      .split(" ")
      .filter((word) => word.length >= 3 && !["produs", "masa", "net", "gram", "grame", "fabricat"].includes(word))
  )];
}

function bestProductFromText(text) {
  const tokens = searchTokens(text);
  if (!tokens.length) return null;
  let best = null;
  let bestScore = 0;
  for (const product of state.products) {
    const haystack = product.search || normalize(`${product.name} ${product.product_code || ""}`);
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += token.length;
    }
    if (score > bestScore) {
      best = product;
      bestScore = score;
    }
  }
  return bestScore >= 8 ? best : null;
}

function formatPercent(value) {
  return `${String(value).replace(".", ",")}%`;
}

function parseKgUnit(unit) {
  const match = String(unit || "").match(/^\/\s*([0-9]+(?:\.[0-9]+)?)kg$/i);
  if (!match) return null;
  const kg = Number(match[1]);
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}

function isWeightedProduce(product) {
  return mainCategoryFromProduct(product) === "Fructe, fructe de padure, Legume, Muraturi" && parseKgUnit(product.unit);
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
  const kgUnit = parseKgUnit(product.unit);
  const weightedProduce = isWeightedProduce(product);
  const productIsNew = isNewProduct(product);
  const pricePerKg = weightedProduce ? product.price / kgUnit : product.price;
  const oldPrice = product.old_price
    ? `<span>${formatPrice(weightedProduce ? product.old_price / kgUnit : product.old_price)}</span>`
    : "";
  const promo = product.discount
    ? `<span class="chip promo">${product.discount}</span>`
    : "";
  const newChip = productIsNew ? `<span class="chip new-chip">Nou</span>` : "";
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
  const unit = product.unit ? `<span class="chip">${weightedProduce ? "Pret / kg" : product.unit}</span>` : "";
  const original = weightedProduce ? `<span class="chip">Pe site: ${formatPrice(product.price)} pentru ${kgUnit}kg</span>` : "";
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
    <article class="product${productIsNew ? " new-product" : ""}">
      ${image}
      <div>
        <h2>${source}</h2>
        <div class="details">
          ${newChip}
          ${unit}
          ${category}
          ${subcategory}
          ${promo}
          ${code}
          ${original}
        </div>
        ${calculator}
      </div>
      <div class="price">
        <strong>${formatPrice(pricePerKg)}</strong>
        ${oldPrice}
      </div>
    </article>
  `;
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
  state.hasUserFilter =
    words.length > 0 ||
    state.category !== "all" ||
    state.subcategory !== "all" ||
    state.onlyPromo ||
    state.discountPercent !== "all";
  if (!state.hasUserFilter) {
    els.count.textContent = String(state.products.length);
    els.results.innerHTML = "";
    els.loadMore.hidden = true;
    els.empty.hidden = false;
    els.empty.textContent = "Scrie numele produsului sau alege o categorie.";
    return;
  }

  let products = state.products.filter((product) => {
    if (state.onlyPromo && !product.discount && !product.old_price) return false;
    if (state.discountPercent !== "all" && String(discountPercentFromProduct(product)) !== state.discountPercent) return false;
    if (state.category !== "all" && mainCategoryFromProduct(product) !== state.category) return false;
    if (state.subcategory === NEW_SUBCATEGORY && !isNewProduct(product)) return false;
    if (state.subcategory !== "all" && state.subcategory !== NEW_SUBCATEGORY && product.subcategory_key !== state.subcategory) return false;
    if (!words.length) return true;
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
  els.loadMore.hidden = products.length <= visible.length;
  els.loadMore.textContent = `Mai multe (${visible.length}/${products.length})`;
  loadVisibleCodes();
}

async function loadProducts() {
  const offlineData = await loadOfflineProducts();
  if (offlineData) {
    applyProducts(offlineData, true);
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
    if (offlineData && manifest.generated_at === offlineData.generated_at) {
      return null;
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
    const subcategoryName = product.category || labelFromSlug(categorySlug);
    return {
      ...product,
      category_slug: categorySlug,
      subcategory_slug: categorySlug,
      subcategory_key: categorySlug || normalize(subcategoryName),
      subcategory_name: subcategoryName,
      category: subcategoryName,
      main_category: mainCategoryFromName(subcategoryName),
      search: normalize(`${product.name} ${product.product_code || ""}`)
    };
  });
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

async function fetchProductCode(chip) {
  const url = chip.dataset.url;
  if (!url || chip.dataset.loading === "1") return;
  chip.dataset.loading = "1";
  try {
    const response = await fetch(`api/code?url=${encodeURIComponent(url)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.product_code) {
      chip.textContent = `Cod: ${data.product_code}`;
      const product = state.products.find((item) => item.url === url);
      if (product) {
        product.product_code = data.product_code;
        product.search = normalize(`${product.name} ${product.product_code}`);
      }
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

function setCameraStatus(message) {
  els.cameraStatus.textContent = message || "";
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.Tesseract) resolve();
      else existing.addEventListener("load", resolve, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Nu pot incarca citirea textului."));
    document.head.appendChild(script);
  });
}

async function scanBarcode(file) {
  if (!("BarcodeDetector" in window)) return "";
  const bitmap = await createImageBitmap(file);
  try {
    const detector = new BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"]
    });
    const codes = await detector.detect(bitmap);
    return codes[0]?.rawValue || "";
  } finally {
    bitmap.close();
  }
}

async function readTextFromPhoto(file) {
  await loadScriptOnce(TESSERACT_URL);
  if (!window.Tesseract) throw new Error("Citirea textului nu este disponibila.");
  const result = await window.Tesseract.recognize(file, "ron+eng");
  return result?.data?.text || "";
}

async function handleCameraFile(file) {
  if (!file) return;
  els.camera.disabled = true;
  setCameraStatus("Citesc poza...");
  try {
    const code = await scanBarcode(file).catch(() => "");
    if (code) {
      applySearchText(code);
      if (els.count.textContent !== "0") {
        setCameraStatus(`Am gasit codul: ${code}`);
        return;
      }
      setCameraStatus("Codul nu este in baza. Incerc sa citesc textul...");
    }

    setCameraStatus("Citesc textul din poza. Prima data poate dura mai mult...");
    const text = await readTextFromPhoto(file);
    const best = bestProductFromText(text);
    if (best) {
      applySearchText(best.name);
      setCameraStatus("Am cautat produsul cel mai apropiat din poza.");
      return;
    }

    const tokens = searchTokens(text).slice(0, 5).join(" ");
    if (tokens) {
      applySearchText(tokens);
      setCameraStatus("Am citit cateva cuvinte si le-am pus in cautare.");
      return;
    }
    setCameraStatus("Nu am putut citi textul. Fa poza mai aproape, la denumire.");
  } catch (error) {
    setCameraStatus("Nu am putut citi poza. Incearca pe Render cu internet.");
  } finally {
    els.camera.disabled = false;
    els.cameraInput.value = "";
  }
}

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
els.camera.addEventListener("click", () => {
  els.cameraInput.click();
});
els.cameraInput.addEventListener("change", () => {
  handleCameraFile(els.cameraInput.files[0]);
});
els.refresh.addEventListener("click", refreshPrices);
els.loadMore.addEventListener("click", () => {
  state.visibleLimit += 30;
  render();
});
els.scrollTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});
window.addEventListener("scroll", updateScrollTopButton, { passive: true });
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
els.results.addEventListener("click", (event) => {
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

loadProducts();
