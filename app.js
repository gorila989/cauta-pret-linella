const state = {
  products: [],
  query: "",
  sort: "name",
  category: "all",
  onlyPromo: false,
  visibleLimit: 80
};

const els = {
  meta: document.getElementById("meta"),
  form: document.getElementById("searchForm"),
  input: document.getElementById("searchInput"),
  clear: document.getElementById("clearButton"),
  results: document.getElementById("results"),
  empty: document.getElementById("emptyState"),
  count: document.getElementById("resultCount"),
  category: document.getElementById("categoryFilter"),
  sortName: document.getElementById("sortName"),
  sortPrice: document.getElementById("sortPrice"),
  onlyPromo: document.getElementById("onlyPromo"),
  refresh: document.getElementById("refreshButton"),
  refreshStatus: document.getElementById("refreshStatus"),
  loadMore: document.getElementById("loadMoreButton")
};

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

function formatPrice(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(2)} lei`;
}

function parseKgUnit(unit) {
  const match = String(unit || "").match(/^\/\s*([0-9]+(?:\.[0-9]+)?)kg$/i);
  if (!match) return null;
  const kg = Number(match[1]);
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}

function isWeightedProduce(product) {
  return categoryFromProduct(product) === "Fructe, legume, muraturi" && parseKgUnit(product.unit);
}

function productCard(product) {
  const kgUnit = parseKgUnit(product.unit);
  const weightedProduce = isWeightedProduce(product);
  const pricePerKg = weightedProduce ? product.price / kgUnit : product.price;
  const oldPrice = product.old_price
    ? `<span>${formatPrice(weightedProduce ? product.old_price / kgUnit : product.old_price)}</span>`
    : "";
  const promo = product.discount
    ? `<span class="chip promo">${product.discount}</span>`
    : "";
  const category = `<span class="chip category-chip">${escapeHtml(categoryFromProduct(product))}</span>`;
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
    ? `<img class="product-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy">`
    : `<div class="product-image product-image-empty" aria-hidden="true"></div>`;

  return `
    <article class="product">
      ${image}
      <div>
        <h2>${source}</h2>
        <div class="details">
          ${unit}
          ${category}
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
  let products = state.products.filter((product) => {
    if (state.onlyPromo && !product.discount && !product.old_price) return false;
    if (state.category !== "all" && categoryFromProduct(product) !== state.category) return false;
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
  try {
    const response = await fetchProducts();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.products = data.products.map((product) => ({
      ...product,
      category_slug: product.category_slug || categorySlugFromUrl(product.url),
      category: product.category || categoryFromProduct({
        category_slug: product.category_slug || categorySlugFromUrl(product.url)
      }),
      search: normalize(`${product.name} ${product.product_code || ""}`)
    }));
    renderCategories();
    const when = data.generated_at ? `Actualizat: ${data.generated_at}` : "Baza incarcata";
    const promoCount = state.products.filter((product) => product.is_promo || product.discount || product.old_price).length;
    els.meta.textContent = `${when}. ${state.products.length} produse, ${promoCount} promotionale.`;
    render();
  } catch (error) {
    els.meta.textContent = "Nu pot incarca products.json.";
    els.empty.hidden = false;
    els.empty.textContent = "Porneste aplicatia printr-un server local sau actualizeaza baza de date.";
  }
}

function renderCategories() {
  const categories = [...new Map(
    state.products
      .map((product) => categoryFromProduct(product))
      .filter(Boolean)
      .map((name) => [name, name])
  ).values()].sort((a, b) => a.localeCompare(b, "ro"));

  els.category.innerHTML = [
    `<option value="all">Toate categoriile</option>`,
    ...categories.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
  ].join("");
  els.category.value = state.category;
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

els.form.addEventListener("submit", (event) => event.preventDefault());
els.input.addEventListener("input", () => {
  state.query = els.input.value;
  state.visibleLimit = 80;
  render();
});
els.category.addEventListener("change", () => {
  state.category = els.category.value;
  state.visibleLimit = 80;
  render();
});
els.clear.addEventListener("click", () => {
  els.input.value = "";
  state.query = "";
  state.visibleLimit = 80;
  els.input.focus();
  render();
});
els.sortName.addEventListener("click", () => {
  state.sort = "name";
  state.visibleLimit = 80;
  els.sortName.classList.add("active");
  els.sortPrice.classList.remove("active");
  render();
});
els.sortPrice.addEventListener("click", () => {
  state.sort = "price";
  state.visibleLimit = 80;
  els.sortPrice.classList.add("active");
  els.sortName.classList.remove("active");
  render();
});
els.onlyPromo.addEventListener("click", () => {
  state.onlyPromo = !state.onlyPromo;
  state.visibleLimit = 80;
  els.onlyPromo.classList.toggle("active", state.onlyPromo);
  render();
});
els.refresh.addEventListener("click", refreshPrices);
els.loadMore.addEventListener("click", () => {
  state.visibleLimit += 80;
  render();
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

loadProducts();
