// Live check: fetch one real product page and print what the adapter reads.
// Usage: npm run check-url -w @motein/core -- <product-url>
import { fetchProduct } from "../src/stores/chemist-warehouse.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm run check-url -w @motein/core -- <product-url>");
  process.exit(1);
}

console.log(await fetchProduct(url));
