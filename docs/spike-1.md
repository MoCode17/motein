# Spike 1: where Chemist Warehouse keeps the price

Nov 10, 2026 · build step 1

Test product: [Musashi 100% Whey Vanilla 2kg](https://www.chemistwarehouse.com.au/buy/91340/musashi-100-whey-vanilla-2kg)

## Result

A plain `fetch` with no browser returns the full product data. **Playwright is not needed.**

- HTTP 200, about 75 KB of server-rendered HTML, no bot challenge, no cookies required.
- Tested from a home connection with both `curl` and Node 24's built-in `fetch`, using the user agent `motein-price-tracker/0.1 (personal price watcher)`.
- Not tested: requests from GitHub Actions' cloud IP ranges. That shows up in step 4.

## Where the data lives

The site is a Next.js app backed by commercetools. Every product page embeds its data as JSON in `<script id="__NEXT_DATA__">`. That JSON is a more stable source than the page markup.

There is no JSON-LD on the page. Any JSON endpoints would sit under `/api/`, which `robots.txt` disallows, so we don't use them.

| Field | Path in `__NEXT_DATA__` | Sample value |
| --- | --- | --- |
| Name | `props.pageProps.product.product.name` | `Musashi 100% Whey Vanilla 2kg` |
| SKU | `props.pageProps.product.product.variants[0].sku` | `2683955` |
| Price | `props.pageProps.product.prices[sku].price.value.amount` | `139.99` |
| Was-price (RRP) | `props.pageProps.product.prices[sku].price.rrp.amount` | `154.99` |
| Currency | `...price.value.currencyCode` | `AUD` |
| Stock status | `props.pageProps.product.availability[sku].status` | `in-stock` |
| Image | `...variants[0].images[0].url` | `https://static.chemistwarehouse.com.au/ams/media/pi/91340/2DF_800.jpg` |
| Hide RRP flag | variant attribute `cwr-hide-rrp` | `false` |
| Pack size | variant attribute `weight` (Size) | `2` (in kg here, even though the label says "Size (g)") |

The JSON matches what the page displays: `$139.99`, and "Don't Pay RRP $154.99 · $15.00 Off RRP".

Prices are keyed by SKU, so the adapter should match on the SKU rather than taking the first entry. This product has one variant.

### Notes for the adapter (step 2)

- If `cwr-hide-rrp` is true, or `rrp` is missing, treat the was-price as `null`.
- A fallback to parsing the HTML (`h2` with the dollar amount) is possible but brittle. I'd rather record `ok = false` when `__NEXT_DATA__` is missing, which is what the failure alert (F9) is for.
- Pack size units look inconsistent, so W11 (unit price) needs more products checked before we rely on it.

## robots.txt

`https://www.chemistwarehouse.com.au/robots.txt` applies to all user agents. It disallows `/api/`, `/admin/`, `/account/`, `/search` and some filtered listing URLs. **Product pages under `/buy/` are allowed.**

## Terms and conditions

[The terms](https://www.chemistwarehouse.com.au/help-centre/terms-and-policies/terms-and-conditions) say you must not:

> (c) use any online crawler tool such as robot, spider, site search or similar mechanism on the Website;
>
> (h) introduce viruses, malware, spyware, scraping tools or harmful code;

Taken literally, an automated price checker conflicts with clause (c), even at one request per product per week. robots.txt allows it, but the terms do not. The PRD's mitigation is to keep the tool personal and low-frequency and to revisit before sharing it. **Whether to go ahead on that basis is the owner's decision, not a technical one.**

## Reproduce

```
npm run check-url -w @motein/core -- <product-url>
```
