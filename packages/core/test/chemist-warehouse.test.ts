import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AdapterError } from "../src/types.js";
import {
  USER_AGENT,
  fetchProduct,
  isChemistWarehouseUrl,
  parseProductPage,
} from "../src/stores/chemist-warehouse.js";

const PRODUCT_URL = "https://www.chemistwarehouse.com.au/buy/91340/musashi-100-whey-vanilla-2kg";
const FIXTURE = readFileSync(new URL("./fixtures/musashi-whey-2kg.html", import.meta.url), "utf8");

/** The fixture's __NEXT_DATA__ as an object, for tests that tweak it. */
function fixtureData(): any {
  const json = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(FIXTURE)![1]!;
  return JSON.parse(json);
}

function pageWith(edit: (product: any) => void): string {
  const data = fixtureData();
  edit(data.props.pageProps.product);
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

function expectAdapterError(fn: () => unknown, reason: AdapterError["reason"]) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AdapterError);
    expect((err as AdapterError).reason).toBe(reason);
    return;
  }
  throw new Error("Expected an AdapterError");
}

describe("isChemistWarehouseUrl", () => {
  it.each([
    PRODUCT_URL,
    `${PRODUCT_URL}/`,
    `${PRODUCT_URL}?utm_source=share`,
  ])("accepts %s", (url) => {
    expect(isChemistWarehouseUrl(url)).toBe(true);
  });

  it.each([
    "http://www.chemistwarehouse.com.au/buy/91340/musashi-100-whey-vanilla-2kg",
    "https://chemistwarehouse.com.au/buy/91340/musashi-100-whey-vanilla-2kg",
    "https://www.chemistwarehouse.com.au.evil.com/buy/91340/x",
    "https://evil.com/www.chemistwarehouse.com.au/buy/91340/x",
    "https://www.chemistwarehouse.com.au@evil.com/buy/91340/x",
    "https://user:pw@www.chemistwarehouse.com.au/buy/91340/x",
    "https://www.chemistwarehouse.com.au:8443/buy/91340/x",
    "https://www.chemistwarehouse.com.au/api/products/91340",
    "https://www.chemistwarehouse.com.au/buy/abc/x",
    "https://www.chemistwarehouse.com.au/buy/91340",
    "https://www.chemistwarehouse.com.au/shop-online/256/sports-nutrition",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(isChemistWarehouseUrl(url)).toBe(false);
  });
});

describe("parseProductPage", () => {
  it("reads the saved Musashi page", () => {
    expect(parseProductPage(FIXTURE)).toEqual({
      name: "Musashi 100% Whey Vanilla 2kg",
      price: 139.99,
      wasPrice: 154.99,
      sku: "2683955",
      imageUrl: "https://static.chemistwarehouse.com.au/ams/media/pi/91340/2DF_800.jpg",
    });
  });

  it("returns a null was-price when there is no RRP", () => {
    const html = pageWith((p) => {
      p.prices[0].price.rrp = null;
    });
    expect(parseProductPage(html).wasPrice).toBeNull();
  });

  it("returns a null was-price when the page hides the RRP", () => {
    const html = pageWith((p) => {
      p.product.variants[0].attributes.find((a: any) => a.key === "cwr-hide-rrp").value = true;
    });
    expect(parseProductPage(html).wasPrice).toBeNull();
  });

  it("returns a null was-price when the RRP is not above the price", () => {
    const html = pageWith((p) => {
      p.prices[0].price.rrp.amount = 139.99;
    });
    expect(parseProductPage(html).wasPrice).toBeNull();
  });

  it("omits the image when there is none", () => {
    const html = pageWith((p) => {
      p.product.variants[0].images = [];
    });
    expect(parseProductPage(html)).not.toHaveProperty("imageUrl");
  });

  it("uses the primary variant's SKU to find the price", () => {
    const html = pageWith((p) => {
      p.product.variants.unshift({ sku: "999", isPrimary: false, images: [], attributes: [] });
      p.prices.unshift({ sku: "999", price: { value: { amount: 1, currencyCode: "AUD" } } });
    });
    expect(parseProductPage(html).price).toBe(139.99);
  });

  it.each<[string, (p: any) => void]>([
    ["the price SKU does not match", (p) => (p.prices[0].sku = "other")],
    ["the price is missing", (p) => delete p.prices[0].price.value],
    ["the price is zero", (p) => (p.prices[0].price.value.amount = 0)],
    ["the price is a string", (p) => (p.prices[0].price.value.amount = "139.99")],
    ["the currency is not AUD", (p) => (p.prices[0].price.value.currencyCode = "NZD")],
    ["the name is blank", (p) => (p.product.name = "  ")],
    ["there are no variants", (p) => (p.product.variants = [])],
    ["there is no product", (p) => delete p.product],
  ])("fails to parse when %s", (_label, edit) => {
    expectAdapterError(() => parseProductPage(pageWith(edit)), "parse-failed");
  });

  it("fails to parse a page without __NEXT_DATA__", () => {
    expectAdapterError(() => parseProductPage("<html><h2>$139.99</h2></html>"), "parse-failed");
  });

  it("fails to parse invalid JSON", () => {
    const html = `<script id="__NEXT_DATA__">{not json</script>`;
    expectAdapterError(() => parseProductPage(html), "parse-failed");
  });
});

describe("fetchProduct", () => {
  const respond = (body: string, init?: ResponseInit) => new Response(body, init);

  it("fetches once with the user agent and parses the page", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(respond(FIXTURE));
    const result = await fetchProduct(PRODUCT_URL, fetchImpl);

    expect(result.price).toBe(139.99);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(PRODUCT_URL);
    expect(init?.redirect).toBe("manual");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
  });

  it("never fetches a URL off the store's domain", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(fetchProduct("https://evil.com/buy/1/x", fetchImpl)).rejects.toMatchObject({
      reason: "invalid-url",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("follows a redirect to another product page on the store", async () => {
    const moved = "https://www.chemistwarehouse.com.au/buy/91340/musashi-whey-vanilla-2kg";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond("", { status: 301, headers: { location: "/buy/91340/musashi-whey-vanilla-2kg" } }))
      .mockResolvedValueOnce(respond(FIXTURE));

    await expect(fetchProduct(PRODUCT_URL, fetchImpl)).resolves.toMatchObject({ price: 139.99 });
    expect(fetchImpl.mock.calls[1]![0]).toBe(moved);
  });

  it.each([
    "https://evil.com/buy/91340/x",
    "/shop-online/256/sports-nutrition",
  ])("refuses to follow a redirect to %s", async (location) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(respond("", { status: 302, headers: { location } }));
    await expect(fetchProduct(PRODUCT_URL, fetchImpl)).rejects.toMatchObject({ reason: "http-error" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after too many redirects", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(respond("", { status: 302, headers: { location: PRODUCT_URL } })));
    await expect(fetchProduct(PRODUCT_URL, fetchImpl)).rejects.toMatchObject({ reason: "http-error" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it.each([403, 429, 503])("reports HTTP %i as blocked", async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(respond("", { status }));
    await expect(fetchProduct(PRODUCT_URL, fetchImpl)).rejects.toMatchObject({ reason: "blocked" });
  });

  it("reports a 404 as an HTTP error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(respond("", { status: 404 }));
    await expect(fetchProduct(PRODUCT_URL, fetchImpl)).rejects.toMatchObject({ reason: "http-error" });
  });

  it("reports a network failure as an HTTP error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchProduct(PRODUCT_URL, fetchImpl)).rejects.toMatchObject({ reason: "http-error" });
  });

  it("reports an unreadable page as a parse failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(respond("<html>Access denied</html>"));
    await expect(fetchProduct(PRODUCT_URL, fetchImpl)).rejects.toMatchObject({ reason: "parse-failed" });
  });
});
