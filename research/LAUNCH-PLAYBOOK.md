# irlpass — launch video script + funnel playbook

For the friend's account (the one with the 7M/1M viral videos). Kevin edits in Premiere.
Format: lo-fi UGC talking-to-camera + screen recording. NOT a brand film.

## Video 1 — the launch (hook V1, zero product dependency until the demo)

**Hook (0-3s)** — face to camera, mid-walk or sat somewhere recognizably Medellín:
> "9 million people watched my colombia videos. the dms all ask the same 3 questions. so my best friend built the answer."

On-screen text (different angle than verbal, CC-16): **"the 3 questions every solo traveler asks"**

**Body (3-20s)** — but/so chain, no "and then":
> "is it safe. where do i meet people. where do i actually go. i used to answer every dm one by one, but there's thousands of you, so we built irlpass: a members club for people landing in medellín."
> "you apply, a real person checks you're not a weirdo, and you land with plans, dinners, and people who already know your name."

**Demo beats (20-32s)** — screen recording of irlpass.vercel.app:
1. counter beat (~3s): city page, counter ticks up next to real faces
2. apply beat (~4s): fast taps through the lowercase questions
3. vetting beat (~3s): "hold on, maya." checkmarks tick green
4. pass beat (~5s): dark flip, "you're in.", lime pass springs in — freeze-frame this for the thumbnail

**CTA (32-38s)**:
> "we're taking 50 founding members for city one. comment PASS and i'll send you the application."

On-screen text: **"50 spots. medellín first."**

**First comment (seed from a burner, per the playbook):** "applied 10 mins ago, the acceptance pass is so clean lol"

## ManyChat setup (his account, dashboard config)
- Trigger keyword: **PASS** (comments on the launch video + any future video)
- Auto-DM copy:
  > "yo 🙌 here's the application for irlpass — 50 founding spots for medellín, every member gets vetted by a real person: https://irlpass.vercel.app
  > fair warning: we actually review these, so fill it out properly"
- Story mention + follow-up flows: add after launch, keep V1 minimal.

## Acceptance DM (manual, from his account, after Kevin accepts in dashboard)
> "hey {name} — reviewed your application, you're in 🤝
> you're founding member nº {NNN} of 50. this link is yours only, it expires in 24h:
> {offer-url}
> everything's explained on the page. see you in the chat."

## Ops loop (daily during launch)
1. Open dashboard (applications table) → check each applicant's IG is real.
2. Click **accept** → offer link auto-copies.
3. Send acceptance DM (template above) from his account.
4. Stripe notification on payment → send WhatsApp invite (until automated).
5. Screenshot milestones (member 010, 025, 040) → content for the next video.

## Video 2 (once ~15-20 members real) — the proof video
Hook: "we said 50 founding spots. 23 are gone." — counter + real chat screenshots
(blur names), first thursday dinner footage. The product starts producing its own content here.

## Reminders
- WHATSAPP_INVITE in `prototype/src/data.js` is still a placeholder — swap before launch.
- Stripe must be on the new **irlpass** account before any link goes out (statement says IRLPASS, not VERYVIRAL).
- Roll the sk_live key Kevin pasted in chat (Stripe dashboard → API keys → roll).
- Demo mode for filming: `irlpass.vercel.app/?demo=1` (full flow incl. pass) or `?screen=pass&name=X&n=003` (jump straight to the money shot).
