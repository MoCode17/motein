// Step 1 spike: confirm a plain fetch returns the price for one Chemist Warehouse product.
// Throwaway. The real adapter lives in packages/core (step 2).
// Usage: node apps/scraper/spike/fetch-price.mjs [product-url]

const url = process.argv[2] ?? "https://www.chemistwarehouse.com.au/buy/91340/musashi-100-whey-vanilla-2kg";

const res = await fetch(url, {
  headers: {
    "User-Agent": "motein-price-tracker/0.1 (personal price watcher)",
    Accept: "text/html",
  },
});
console.log("status:", res.status, res.url);
const html = await res.text();

const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (!match) throw new Error("No __NEXT_DATA__ script found");

const { product, prices, availability } = JSON.parse(match[1]).props.pageProps.product;
const variant = product.variants[0];
const price = prices.find((p) => p.sku === variant.sku)?.price;

console.log({
  sku: variant.sku,
  name: product.name,
  price: price?.value?.amount,
  wasPrice: price?.rrp?.amount ?? null,
  currency: price?.value?.currencyCode,
  availability: availability.find((a) => a.sku === variant.sku)?.status,
  imageUrl: variant.images?.[0]?.url,
});
