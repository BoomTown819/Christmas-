# Our Christmas

A family Christmas wishlist platform. Everyone gets their own account, their own wishlist and their own share link. Family members see each other's lists on the **OUR CHRISTMAS 🎄** dashboard and can secretly claim gifts. **Nobody can ever see what's been claimed on their own list.**

Built with Next.js 14 (App Router), React, TypeScript and Supabase (Auth, Postgres, row level security).

---

## Set it up (about 15 minutes)

### 1. Create a Supabase project
1. Go to [supabase.com](https://supabase.com), create a free project, and wait for it to start.
2. Open **SQL Editor**, paste everything from `supabase/migrations/20261105000000_family_wishlists.sql`, and click **Run**.
   (Or with the Supabase CLI: `supabase link` then `supabase db push`.)
3. Open **Authentication → URL Configuration**:
   - **Site URL**: your site's address (for example `https://our-christmas.vercel.app`, or `http://localhost:3000` while testing).
   - **Redirect URLs**: add `https://YOUR-SITE/auth/callback` (and `http://localhost:3000/auth/callback`).
4. Optional: **Authentication → Providers → Email**. "Confirm email" is on by default, so new users click a link before they can log in. Turn it off if you'd rather skip that step for family.
5. Optional but recommended for real emails: **Project Settings → Authentication → SMTP**. Supabase's built-in sender is rate-limited to a few emails per hour.

### 2. Configure and run
```bash
npm install
cp .env.example .env.local      # fill in the Supabase URL + anon key (Project Settings → API)
                                # and your ANTHROPIC_API_KEY for AI descriptions (optional)
npm run dev                     # http://localhost:3000
```

### 3. Deploy (Vercel)
1. Push this folder to a GitHub repo and import it in [Vercel](https://vercel.com).
2. Add the same environment variables from `.env.local` in Vercel's project settings. Set `NEXT_PUBLIC_SITE_URL` to your real address.
3. Deploy, then put that address into Supabase's Site URL and Redirect URLs (step 1.3).

Only the public anon key is used. There is no service-role key anywhere in the app.

---

## How the secret gift system works

The rule: **a wishlist owner must never learn what has been claimed or bought on their list.** The database enforces it, not just the page.

| Layer | What stops the owner |
|---|---|
| `gift_claims` table | Row level security is on with **no policies**, and all table permissions are revoked for signed-in and anonymous users. Nobody can read it directly, and every user gets the same "permission denied". |
| `get_claims(slug)` | The only way to read claims. It returns **no rows** when the caller owns the list, which looks exactly like a list with no claims. |
| `claim_item`, `cancel_claim`, `set_purchased` | They check "is this your own list?" **before** anything else, so an owner always gets the same refusal whether or not an item is claimed. Nothing leaks through error messages. |
| `get_public_wishlist(slug)` | Returns items and the owner's name only. It never includes claim data, for anyone. |
| `get_family_dashboard` | "N still available" is calculated only for **other** people's cards. |
| Page and link preview | The public page, its link preview image and the owner's pages contain no claim data. Claims are fetched separately, only in the gift-buyer view. |
| Signed out on your own device | When you open your own link while signed out, the browser remembers it's yours and shows the owner view **before** anything is fetched. Someone sharing your device can tap "This isn't my list" to see claims. |

Private notes live in their own owner-only table, so gift buyers never receive them. "Why I want it" is meant to be shared and is visible to buyers.

**The one honest limit:** share links work without an account, so a list owner who deliberately opens their own link in a private window or on someone else's device, while signed out, looks exactly like a guest. No server can tell them apart. Everything above makes it impossible to find out *by accident*, and impossible while signed in, from any API, URL or developer tools.

### Claims
- Anyone with the link can tap **I'M GETTING THIS! 🎁**, enter a name (and optionally an email, which is never shown to anyone), and confirm.
- Signed-in claims belong to your account. Guest claims are tied to a secret token kept in that browser, so only that person can cancel or update them.
- A database unique constraint means two people can't claim the same item, even at the same instant. The second person sees "Someone else just claimed this."
- **Claimed** and **Bought** are separate states, and the claimer marks an item bought when they've actually bought it.
- Open lists refresh claims every 5 seconds, so everyone stays in sync.

## Families
- Create a family, then **Invite family** to get a link and a code like `K7QM-3XPA` that you can send by Messages, Email or WhatsApp.
- Someone opening the invitation can sign up right there and joins automatically afterwards.
- You can be in several families and switch between them. Leaving keeps your list and your link. If the organizer leaves, organizer passes to the longest-standing member.
- Turn off "Show my list on family dashboards" in the share dialog if you'd rather share only by link.

## Your wishlist
Half-star "how badly I want it" ratings (0.5 to 5), AI one-sentence descriptions from the product page, prices, totals, "why I want it", private notes, images, edit/delete with undo, drag (or arrow buttons) to rearrange, sorting and rating filters, "Surprise me", CSV export, and a **SHARE MY CHRISTMAS LIST 🎁** button.

AI descriptions: the server fetches the product page (public addresses only, 8 second timeout, 2 MB cap) and asks Claude for one sentence using only the text it actually read. If a site blocks the request or has no readable product text, the form says so and you write it yourself. Nothing is made up.

---

## Tests

```bash
npm test                 # unit tests: money, sorting, CSV, page extraction, AI call
npm run typecheck
```

`tests/security.test.ts` (29 tests) and `e2e/e2e_test.py` (multi-user browser test) run against a real Supabase-compatible stack. To run them locally on Linux with Postgres 16 installed:

```bash
cd dev-stack && ./install.sh && ./start.sh        # Postgres + Supabase Auth + PostgREST + mail catcher
psql -h /tmp -p 54322 -U postgres -f ../supabase/migrations/20261105000000_family_wishlists.sql
psql -h /tmp -p 54322 -U postgres -c "notify pgrst, 'reload schema'"
# point .env.local at http://localhost:54321 with the anon key from dev-stack/keys.json, then:
npm run test:security
node e2e/fixtures-server.mjs & npm run build && dev-stack/run-app.sh && npm run test:e2e
```

The security suite checks, with five real accounts and guests:
- each account has a separate list and an unguessable link, and emails are never exposed
- nobody can edit, add to, delete from or reorder someone else's list, or change its link
- private notes are owner-only and missing from public pages
- guests can't list or enumerate wishlists, profiles, families or claims
- guest and member claims work, other buyers see who claimed what (never emails), and 7 simultaneous claims produce exactly 1 winner
- only the claimer can cancel or mark bought, and cancelling frees the item
- **the owner cannot read claims by table, join, count, RPC, error message, dashboard or public payload, and all of this holds for every owner independently**
- invitations, joining, leaving, organizer handover and family sharing toggles

The browser test signs up Sonny, Mom and Dad in separate browsers plus a guest "Grandma", then runs the whole season: adding items with an AI description, editing, deleting and undoing, reordering, sharing, creating a family, inviting, joining by link (signed in and from signup), claiming as a guest and as a member, live updates, a duplicate claim, bought vs claimed, cancelling, password reset by email, leaving a family, profile edits and link-preview images. It records **every response Sonny's browser receives** and fails if any claimer name or claim field appears, both signed in and signed out on his device.

## Project layout
```
app/                      Next.js routes
  page.tsx                Landing (signed out) / OUR CHRISTMAS dashboard (signed in)
  FamilyApp.tsx           Family cards, invites, create/join/leave
  my-list/                The owner's wishlist editor
  list/[slug]/            Public wishlist, secret claiming, link preview image
  join/[code]/            Invitation landing
  login, signup, forgot-password, reset-password, profile, auth/*
  api/describe/           AI description route (server only, signed-in users)
src/components/           Cards, half-star rating, form, totals, dialogs, festive art
src/lib/server/           Safe page fetching, extraction, Claude call
supabase/migrations/      Schema, row level security, secure functions
tests/  e2e/  dev-stack/  Tests and the local test stack
```
