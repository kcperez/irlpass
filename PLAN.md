# irlpass → freemium + reputation rebuild

## Context
irlpass is currently **hard-paywalled**: `getMember()` (`api/_lib.js:40`) requires `paid=true` for
every action, so non-paying members hit a denied screen. We're getting subs but not converting —
same failure mode as NomadTable's hard-wall-at-onboarding. Goal: flip to a **NomadTable-style
freemium funnel** — frictionless open signup, free local use, contextual paywall on premium
actions — plus a **reputation/safety layer** so trust is earned in-app instead of at a vetting gate.
Focus city = Medellín (seed it now; other cities browseable but unseeded).

## Decisions (locked with Kevin)
- **Open signup, no manual vetting.** Trust = verified badge + reputation + reporting, earned after entry.
  Keep the "you're in 🎉" celebration — it fires on onboarding completion, not after review.
- **Map is global + GPS-geolocated.** Your GPS city = your free city. Pan/search any city to browse;
  manual city switch allowed; fallback to saved city if GPS denied.
- **Contextual paywall, not a hard wall.** Free everywhere locally; sub prompt appears the moment a
  user taps a gated action.
- **Paywall line:** join/create in other cities · DM members · full attendee lists. (Profile-viewers = later.)
- **Women-only** = per-activity audience setting + one-tap map filter + profile safety toggles. Not a separate mode.

## Free vs Paid
| Capability | Free | Paid |
|---|---|---|
| See your GPS city map + activities | ✅ | ✅ |
| Browse other cities' maps/activities | ✅ (view only) | ✅ |
| Join / create / chat in your GPS city | ✅ | ✅ |
| Review activities, build reputation | ✅ | ✅ |
| Join / create in **other** cities | ❌ → paywall | ✅ |
| **DM** members not in a shared activity | ❌ → paywall | ✅ |
| See **full** attendee list (free = first 3 + count) | ❌ → paywall | ✅ |

## Workstreams

### 1. Kill the hard paywall (entry = free)
- `api/_lib.js`: split `getMember()` — keep a `getUser()` (accepted, not banned, **paid optional**) for
  general access; reserve a `requirePaid()` helper only for gated actions. Most endpoints move to `getUser`.
- Endpoints currently on `getMember` to relax → `getUser`: `me.js`, `activities.js` (create/join local),
  `members.js`, `messages.js`, `profile.js`, `activity-photo.js`, `portal.js`.
- `email-login.js` / `oauth-callback.js`: stop routing unpaid → `/offer`; route everyone → `/app`.
- `Club.jsx:1425`: drop `DeniedScreen()` for unpaid; show app with locks on gated actions.

### 2. Global + geolocated map
- Add `CITIES` table/const (name, slug, center lat/lng, bounds). Seed Medellín; add miami/cdmx/lisboa/bali
  as browseable shells (`data.js:87` CITIES_SOON already lists them).
- `Club.jsx`: replace hardcoded `MDE_CENTER` (`:25`) with dynamic center. On load:
  `navigator.geolocation` → nearest city = "home city"; denied → `me.city`. Add city switcher UI.
- `api/geocode.js:32`: drop the Medellín-only viewbox; accept a city/bounds param.

### 3. Activity `city` field + city gating  ← schema change
- **DB:** add `city` (slug) column to `activities`. Backfill existing rows = `'medellin'`.
- `api/activities.js`: on create, set `city` from creator's current city. On **join** (`:143`), gate:
  `if (row.city !== me.currentCity && !me.paid) return 402 "unlock other cities"`.
- Same gate before `seat-checkout.js` checkout.
- Frontend: gated cards show a lock + "✦ unlock {city}" → paywall sheet (reuse `Offer.jsx` pricing).

### 4. Onboarding rebuild (frictionless, NomadTable-modeled)
Flow: **auth → birthday (18+) → name → gender → home country → IG handle → photo → selfie verify →
current city + dates → interests** — with live "243 active now" counter + **progress bar** throughout.
- New fields on `members`: `birthday`/`age`, `gender`, `country` (exists), `interests[]`, `verified_selfie`.
- 18+ hard confirm on birthday. Gender drives women-only + safety toggles.
- Rework `Apply.jsx` → multi-step; keep lowercase voice. Auto-accept on completion (no review queue).
- Soft-asks (GPS, notifications) with benefit framing, not raw permission prompts.

### 5. Reputation + safety layer
- **DB:** `reviews` table (activity_id, reviewer_no, target = host|attendee, rating 👍, created_at);
  `reports` table (reporter_no, target_type user|activity, target_id, reason, private); `members` add
  `rep_score`, `verified_selfie`, `safety_prefs` (allow_dm_from_men, show_ig_to_men).
- **Review activity after it happens** (only if you joined) → averages into **host `rep_score`**, shown on
  profile + activity cards. Optional 👍 on attendees → their rep.
- **Report** user/activity → private flag (admin view in `Admin.jsx`), never public.
- **Verified badge** = IG present + selfie passed. Low-rep/unverified = reduced reach.

### 6. Women-only + safety
- `api/activities.js` create: `audience` = `open` | `women_nb`. Men excluded from query + join of `women_nb`.
- `Club.jsx`: one-tap "women-only 🌸" map/board filter.
- Profile: safety toggles (allow DMs from men, show IG to men) gate DM + IG visibility.

### 7. DM system (new, partly paid)
- **DB:** `dm_threads` (pair of member_nos), `dm_messages`. Reuse `messages.js` patterns/notify.
- Free: DM anyone you **share an activity** with. Paid: DM anyone else → 402 paywall.
- Respect `allow_dm_from_men` safety pref.
- New `Messages` screen/tab (inbox: activities + cities + DMs).

### 8. Seed Medellín
- `scripts/seed-medellin.js` (Supabase service key): insert ~6–8 activities across el poblado / laureles /
  envigado / centro / guatapé using real coords from `Club.jsx:27-34`, `city='medellin'`, `event_date>=today`,
  cover photos from `public/medellin/*.jpg`, a couple flagged `women_nb`, varied hosts w/ rep scores.
- Run: `node --env-file=.env.local scripts/seed-medellin.js`.

## Build order
1 (kill paywall) → 3 (city field+gate) → 2 (global map) → 8 (seed, so map isn't empty) →
4 (onboarding) → 5 (reputation) → 6 (women-only) → 7 (DM). Ship/test after each.

## Verification
- `npm install` then `npm run dev`; need `.env.local` (SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE keys).
- Free path: sign up → land in Medellín via GPS → create + join local activity + chat (no paywall).
- Gate path: pan to Lisbon → browse OK → tap join → paywall sheet.
- Reputation: join → mark past → review → host rep updates on card.
- Women-only: create women_nb activity → invisible to a male test account.
- Seed: board shows ~6–8 Medellín activities on load.

## Open / later
- Profile-viewers (paid) — deferred.
- Pricing SKU: keep existing monthly+yearly, or move to NomadTable's single $69.99/yr — TBD.
- eSIM affiliate card per city (second revenue stream) — later.
- Migrations: confirm whether Supabase schema is managed by SQL we can run, or dashboard-only.
