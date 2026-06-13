# NomadTable — Full Product Teardown (142 screens, June 2026, v16.0.45)

Source: App Store screen rip in `research/screens/`. Analyzed screen-by-screen by 5 agents; synthesized here.

## Architecture: 3 tabs (Map / Trips / Messages)

### 1. Onboarding (≈13 steps before account exists)
- Splash → value prop ("join activities and connect with travelers wherever you go 🎉") → Apple/Google/phone auth
- Live social proof everywhere: ticking "79,591 travelers active now" counter, falling flag emojis
- Steps: birthday (18+ confirm) → attribution survey → name (immutable) → gender → home country (flag = identity) → Instagram handle ("verify you're a real person") → traveler type (incl. "Local" — supply hack) → current city + stay dates (manual, no GPS) → bio → interests (max 10, feed AI suggestions)
- Mid-funnel interstitial: "1.4M+ travelers with similar interests are waiting to meet you" personalized with the user's own interest emojis — placed right before the high-friction steps
- Photo required to create account; notification + location soft-asks with benefit framing
- Women-safety toggles AT ONBOARDING: allow DMs from men, show IG to men, distance visibility + confirmation modal
- App Store rating prompt INSIDE onboarding (before any usage) with testimonial cards — aggressive ASO
- **Hard paywall at the end**: Nomadtable Plus, 3-day trial, **$69.99/yr single SKU**, "try for $0.00", Blinkist-style trial timeline. Gates: full traveler lists, priority visibility, profile viewers, create/join in other cities, message far-away travelers. Local join+chat stays free.

### 2. Map (core surface)
- Apple Maps + emoji activity pins with attendee avatars, "100+ Travelers Here >" density pill, profile-completion ring (45%) on avatar
- **AI suggestion engine (✨)**: generates plausible activities around you in ~30s, purple-badged pins, "we suggest sunset at pandi park!" cards → one-tap prefilled creation. This is their cold-start solve for empty maps.
- Activity creation = 5 steps, ~20 seconds: free-text "I want to… grab coffee" → category → fuzzy/exact location → flexible/exact time → audience (age slider, open/private, **women & non-binary only 🌸**)
- Activities expire at midnight (fresh map daily)
- Join → confetti → auto-funneled into group chat with RSVP banner (Going/Maybe/Can't)

### 3. Trips
- Declare trip: specific dates / flexible / living here (3-tier liquidity model)
- Destination page: "9,365 travelers during these dates" + avatar stack → Join Trip → auto-prompt into **city group chat** (with "join but mute" option)
- City chats are where real meetup intent lives ("Anyone wants to go to Daikoku this evening? 2 spots left")
- **simify eSIM affiliate card** on every city page, geo-localized, 15% off (second revenue stream)
- Trending trips with inflated-looking counts ("17,129 going" vs 7,470 actual chat members)

### 4. Messages / Social
- Inbox filters: All / Unread / Activities / Cities. DMs only with people who share a group/activity (chat graph seeded from city chats)
- Distance-aware catfish banner in DMs ("This user is 6,310km away…")
- In-chat Translate, reactions, reply threading
- Friends found via Instagram username (no contacts permission); friends color in your "% of world explored" map (collection mechanic)
- Selfie verification: "Strike a Pose!" peace-sign gesture (Bumble-style)
- Reputation: thumbs-up ratings only from organizer-confirmed meetups; downvotes private to T&S team
- Retention pushes: profile views, "activities heating up nearby", interest-targeted notifications

## Monetization summary
1. $69.99/yr Plus sub (3-day trial), single SKU, hard paywall end of onboarding
2. eSIM affiliate (simify partner cards per city)
3. "Nomadtable for Partners" B2B/venue link on auth screen (nascent)

## Confirmed weaknesses (screens + App Store reviews)
- **Bugs**: keyboard breaking, ghost notification badges, backwards nav animations, slow chat on weak connections — solo founder "Jay" personally answering reviews and shipping fixes
- **Creep problem**: "A lot of Weirdos" 2★ — women churning because men treat it as a hookup app despite the safety architecture. Women-side supply is actively leaking.
- Long onboarding, no progress bar; inflated/buggy numbers ("May 17 - May 14", "Barcellona", "Philippines (the)")
- Big-city chats too noisy, small-city chats dead (liquidity imbalance users complain about in-app)
- $69.99/yr single anchor with no cheaper SKU; vague Plus value at profile touchpoint
- Empty states everywhere in low-density areas; AI suggestions hallucinate ("premier nightlife spot" in a barangay)

## What's genuinely clever (steal these)
- Live counters + personalized social-proof interstitials
- AI-seeded map (never looks dead)
- Trip declaration → "N travelers there during your dates" → auto city chat
- Women-only visibility layer as product architecture, not a filter
- share.nomadtable.app deep links on every activity/profile
- "Join but mute" third option; verified-meetup-only ratings
