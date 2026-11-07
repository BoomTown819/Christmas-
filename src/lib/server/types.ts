/** Shape returned by POST /api/describe. Shared by server and client. */
export type DescribeResponse =
  | {
      status: 'ok';
      description: string;
      /** 'ai' = one-sentence summary written by the AI from the page's text.
       *  'page' = the page's own summary text (used when no AI key is configured or AI declined). */
      source: 'ai' | 'page';
      title?: string;
      imageUrl?: string;
      /** Price found in the page's structured data, in cents (USD only). */
      detectedPriceCents?: number;
    }
  | {
      /** The page was read, but there wasn't enough product information to describe it truthfully. */
      status: 'no_content';
      message: string;
      title?: string;
      imageUrl?: string;
      detectedPriceCents?: number;
    }
  | { status: 'blocked'; message: string }
  | { status: 'invalid_url'; message: string };

export interface SharedWishlist {
  id: string;
  ownerName?: string;
  items: SharedItem[];
  updatedAt: string;
}

export interface SharedItem {
  id: string;
  name: string;
  url: string;
  priceCents: number;
  rating: number;
  description: string;
  reason: string;
  imageUrl: string;
  createdAt: string;
}

/** What the paste-a-link lookup found. Every field is optional: nothing is ever made up. */
export interface ProductInfo {
  name?: string;
  imageUrl?: string;
  description?: string;
  /** 'ai' = summarised by AI from the page's text; 'page' = the page's own wording. */
  descriptionSource?: 'ai' | 'page';
  priceCents?: number;
  store?: string;
}

/** Shape returned by POST /api/product. */
export type ProductResponse =
  | { status: 'found'; product: ProductInfo; via: 'page' | 'service'; cached?: boolean }
  | { status: 'failed'; product: ProductInfo; message: string }
  | { status: 'invalid_url'; product: ProductInfo; message: string };
