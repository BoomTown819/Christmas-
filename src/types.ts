export type DescriptionSource = 'ai' | 'page' | 'manual' | '';

export interface WishlistItem {
  id: string;
  name: string;
  url: string;
  /** Stored as whole cents to keep totals exact. */
  priceCents: number;
  /** How badly I want it: 0.5 – 5 in half steps. */
  rating: number;
  description: string;
  descriptionSource: DescriptionSource;
  /** "Why I want it" — gift buyers can see this. */
  reason: string;
  /** Only the owner ever sees this. */
  privateNote: string;
  imageUrl: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type ItemDraft = Omit<WishlistItem, 'id' | 'createdAt' | 'updatedAt' | 'position'>;

export type SortKey = 'custom' | 'rating-desc' | 'rating-asc' | 'price-desc' | 'price-asc' | 'recent' | 'alpha';
export type RatingFilter = 'all' | '5' | '4+' | '3+' | '2+' | 'under2';

export interface Profile {
  id: string;
  display_name: string;
  avatar: string;
  avatar_color: string;
}

export interface MyWishlist {
  id: string;
  title: string;
  share_slug: string;
  share_with_family: boolean;
}

/** What gift buyers learn about a claim. Never fetched for your own list. */
export interface Claim {
  item_id: string;
  status: 'claimed' | 'purchased';
  claimer_name: string;
  is_mine: boolean;
  claimed_at: string;
}

export interface PublicWishlist {
  id: string;
  title: string;
  slug: string;
  viewer_is_owner: boolean;
  owner: { display_name: string; avatar: string; avatar_color: string };
  items: {
    id: string; name: string; url: string; price_cents: number; rating: number; description: string;
    description_source: DescriptionSource; reason: string; image_url: string; position: number; created_at: string;
  }[];
}

export interface FamilyMemberCard {
  user_id: string;
  display_name: string;
  avatar: string;
  avatar_color: string;
  role: 'organizer' | 'member';
  is_me: boolean;
  shared: boolean;
  share_slug?: string;
  item_count?: number;
  preview?: { name: string; image_url: string; rating: number }[];
  available_count?: number;
}

export interface FamilyDashboard {
  family: { id: string; name: string; my_role: 'organizer' | 'member' };
  members: FamilyMemberCard[];
  invite_code: string | null;
}
