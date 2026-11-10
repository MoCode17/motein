/** What a store adapter reads from one product page. Prices are in AUD. */
export interface ProductSnapshot {
  name: string;
  price: number;
  /** The "was" or RRP price shown on the page, or null when none is shown. */
  wasPrice: number | null;
  sku?: string;
  imageUrl?: string;
}

/** Every store adapter has this signature: given a product URL, read the product. */
export type StoreAdapter = (url: string) => Promise<ProductSnapshot>;

export type AdapterErrorReason =
  /** The URL is not a product page on the store's domain. Nothing was fetched. */
  | "invalid-url"
  /** Network error, timeout, unexpected status, or a redirect away from a product page. */
  | "http-error"
  /** The store refused the request (403, 429, 503). */
  | "blocked"
  /** The page loaded but the product data could not be read. */
  | "parse-failed";

export class AdapterError extends Error {
  override readonly name = "AdapterError";

  constructor(
    readonly reason: AdapterErrorReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
