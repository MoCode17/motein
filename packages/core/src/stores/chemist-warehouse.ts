// All Chemist Warehouse knowledge lives in this module. See docs/spike-1.md for
// where the product data sits on the page.
import * as cheerio from "cheerio";
import { AdapterError, type ProductSnapshot } from "../types.js";

export const STORE = "chemist-warehouse";
export const USER_AGENT = "motein-price-tracker/0.1 (personal price watcher)";

const HOST = "www.chemistwarehouse.com.au";
const PRODUCT_PATH = /^\/buy\/\d+\/[^/]+\/?$/;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;
const BLOCKED_STATUSES = new Set([403, 429, 503]);

/** True only for https product pages on the store's own domain. */
export function isChemistWarehouseUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === HOST &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    PRODUCT_PATH.test(parsed.pathname)
  );
}

/**
 * Fetch one product page and read its name, price and was-price.
 * Makes a single request (plus any same-site redirects) and never leaves the store's domain.
 * Throws AdapterError on any failure.
 */
export async function fetchProduct(url: string, fetchImpl: typeof fetch = fetch): Promise<ProductSnapshot> {
  if (!isChemistWarehouseUrl(url)) {
    throw new AdapterError("invalid-url", `Not a Chemist Warehouse product URL: ${url}`);
  }

  let current = url;
  for (let redirects = 0; ; redirects++) {
    let res: Response;
    try {
      res = await fetchImpl(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      });
    } catch (err) {
      throw new AdapterError("http-error", `Request failed for ${current}`, { cause: err });
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      const next = location ? new URL(location, current).href : null;
      if (!next || !isChemistWarehouseUrl(next)) {
        throw new AdapterError("http-error", `Redirected away from a product page: ${location ?? "(no location)"}`);
      }
      if (redirects >= MAX_REDIRECTS) {
        throw new AdapterError("http-error", `Too many redirects for ${url}`);
      }
      current = next;
      continue;
    }

    if (BLOCKED_STATUSES.has(res.status)) {
      throw new AdapterError("blocked", `Store refused the request (HTTP ${res.status})`);
    }
    if (!res.ok) {
      throw new AdapterError("http-error", `Unexpected HTTP ${res.status} for ${current}`);
    }
    return parseProductPage(await res.text());
  }
}

interface Money {
  amount?: unknown;
  currencyCode?: unknown;
}

interface PageProduct {
  product?: {
    name?: unknown;
    variants?: {
      sku?: unknown;
      isPrimary?: unknown;
      images?: { url?: unknown }[];
      attributes?: { key?: unknown; value?: unknown }[];
    }[];
  };
  prices?: { sku?: unknown; price?: { value?: Money; rrp?: Money | null } }[];
}

/** Read the product from a page's embedded __NEXT_DATA__ JSON. Pure, so it is unit-testable. */
export function parseProductPage(html: string): ProductSnapshot {
  const raw = cheerio.load(html)("script#__NEXT_DATA__").text();
  if (!raw) throw new AdapterError("parse-failed", "Page has no __NEXT_DATA__ script");

  let data: { props?: { pageProps?: { product?: PageProduct } } };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch (err) {
    throw new AdapterError("parse-failed", "__NEXT_DATA__ is not valid JSON", { cause: err });
  }

  const page = data.props?.pageProps?.product;
  const product = page?.product;
  if (!product) throw new AdapterError("parse-failed", "No product in __NEXT_DATA__");

  const name = typeof product.name === "string" ? product.name.trim() : "";
  if (!name) throw new AdapterError("parse-failed", "Product has no name");

  const variants = product.variants ?? [];
  const variant = variants.find((v) => v.isPrimary === true) ?? variants[0];
  if (!variant || typeof variant.sku !== "string") {
    throw new AdapterError("parse-failed", "Product has no variant SKU");
  }
  const sku = variant.sku;

  const priceEntry = page.prices?.find((p) => p.sku === sku)?.price;
  const price = readAud(priceEntry?.value);
  if (price === null) throw new AdapterError("parse-failed", `No AUD price for SKU ${sku}`);

  const hideRrp = variant.attributes?.find((a) => a.key === "cwr-hide-rrp")?.value === true;
  const rrp = hideRrp ? null : readAud(priceEntry?.rrp);
  // An RRP at or below the selling price is not a discount, so it is not a was-price.
  const wasPrice = rrp !== null && rrp > price ? rrp : null;

  const imageUrl = variant.images?.[0]?.url;
  return {
    name,
    price,
    wasPrice,
    sku,
    ...(typeof imageUrl === "string" && imageUrl ? { imageUrl } : {}),
  };
}

function readAud(money: Money | null | undefined): number | null {
  if (!money || money.currencyCode !== "AUD") return null;
  const amount = money.amount;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? amount : null;
}
