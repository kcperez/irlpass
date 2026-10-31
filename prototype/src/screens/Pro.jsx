import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeft, ArrowRight, ArrowUpRight, CalendarCheck, ChartBar, CheckCircle, CircleNotch, Eye, Gift, InstagramLogo,
  MagnifyingGlass, Megaphone, QrCode, ShieldCheck, Storefront, Trash, UsersThree, X,
} from "@phosphor-icons/react"
import { Logo } from "../components/bits"

// irlpass pro (josh, oct 30): one plan, $69 a month, 14 days free. venues keep
// 100% of what members spend; we charge the flat subscription. the pitch:
// nobody on irlpass goes out solo, and one group's table covers the month.
const DRAFT_KEY = "irl:pro-draft"
const PRICE = 69
const PERKS = ["a free drink", "free entry", "2-for-1 drinks", "10% off the bill"]
const STORY_PERKS = ["a second drink", "a free shot", "a dessert on us"]
const shadow = "shadow-[0_1px_2px_rgba(58,50,44,0.05),0_14px_34px_-18px_rgba(58,50,44,0.35)]"
const spring = { type: "spring", stiffness: 140, damping: 20 }

const readDraft = () => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null") } catch { return null }
}
const params = new URLSearchParams(window.location.search)

export default function Pro() {
  const [info, setInfo] = useState(null)
  const [step, setStep] = useState(params.get("step") && readDraft() ? "you" : null)
  const [done, setDone] = useState(null)
  const owner = params.get("owner")

  useEffect(() => {
    if (owner) return
    fetch("/api/pro").then((r) => r.json()).then(setInfo).catch(() => setInfo({ foundingLeft: 10, members: 0, photos: [] }))
    const sid = params.get("session_id")
    if (sid) {
      fetch(`/api/pro?session_id=${encodeURIComponent(sid)}`).then((r) => r.json()).then((r) => {
        if (r.ok) {
          setDone(r)
          try { localStorage.removeItem(DRAFT_KEY) } catch { /* private mode */ }
        }
      }).catch(() => {})
    }
  }, [owner])

  // the onboarding owns the screen; the page behind it stays put
  useEffect(() => {
    document.body.style.overflow = step ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [step])

  if (owner) return <Owner token={owner} />
  if (done) return <Welcomed venue={done.venue} owner={done.owner} />

  const left = info?.foundingLeft ?? 10
  const start = () => setStep("venue")

  return (
    <div className="relative pb-16">
      <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] lg:px-10 lg:pt-8">
        <a href="/?home=1" className="flex items-center gap-2">
          <Logo size="text-[22px] lg:text-[26px]" />
          <span className="rounded-full border border-line bg-white/70 px-2.5 py-1 text-[11px] font-bold">pro</span>
        </a>
        <button onClick={start} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-bold text-cream">claim your venue</button>
      </header>

      {/* hero: the promise, the live member count, one button */}
      <section className="px-5 pt-8 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12 lg:px-10 lg:pt-16">
        <div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-[13px] font-bold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-deep" />
            {info?.members ? `${info.members} members in medellín right now` : "members in medellín right now"}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}
            className="display mt-3 font-bold leading-[0.93] tracking-[-0.035em]"
            style={{ fontSize: "clamp(40px, 11vw, 68px)" }}
          >
            nobody on irlpass goes out{" "}
            <span className="relative inline-block">
              solo.
              <motion.span
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                transition={{ delay: 0.35, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="absolute -bottom-0.5 left-0 h-[0.14em] w-full origin-left rounded-full bg-lime" aria-hidden
              />
            </span>
          </motion.h1>
          <p className="mt-4 max-w-[480px] text-[16.5px] leading-snug text-ink-soft lg:text-[19px]">
            members make plans together and show up as a table. put your venue at the top of their guide, post what's on, and see every group that came. ${PRICE} a month, and you keep 100% of what they spend.
          </p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.15 }} className="mt-6 flex flex-col gap-2 lg:max-w-[420px]">
            <motion.button whileTap={{ scale: 0.97 }} onClick={start} className="flex items-center justify-center gap-2 rounded-full bg-ink py-4 text-[17px] font-bold text-cream">
              claim your venue <ArrowRight size={18} weight="bold" />
            </motion.button>
            <p className="text-center text-[12.5px] text-ink-soft lg:text-left">14 days free · we send you a group before you pay</p>
          </motion.div>
        </div>
        <Collage photos={info?.photos || []} loaded={!!info} />
      </section>

      {/* proof first: real groups, real money */}
      <section className="mx-5 mt-14 lg:mx-10">
        <div className="overflow-hidden rounded-[2rem] bg-ink text-cream">
          <div className="px-6 pb-6 pt-6 lg:px-10 lg:py-9">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-cream/55">what an irlpass group spends</p>
            <p className="display mt-3 max-w-[620px] text-[30px] font-bold leading-[1] tracking-tight lg:text-[40px]">a solo traveler orders one drink. an irlpass group orders for the table.</p>
            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              <Proof where="mala audio, medellín" what="we posted one night in the app. about 25 members came, paid the cover and drank all night." n="$900-1,600" label="spent at the venue, one night" />
              <Proof where="a dinner in medellín" what="six members who met on irlpass booked one table together." n="~$400" label="spent at one table" />
            </div>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="mt-14 px-5 lg:px-10">
        <p className="text-[12px] font-semibold text-ink-soft">how it works</p>
        <h2 className="display mt-1 text-[32px] font-bold leading-[0.95] tracking-tight lg:text-[44px]">members plan it. you see it.</h2>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <HowCard icon={UsersThree} n="1" title="members find you" body="your spot sits at the top of the irlpass guide with your perk and what's on. they tap i'm going and see who else is." />
          <HowCard icon={QrCode} n="2" title="they show up together" body="at the door they scan your irlpass qr, say how many came, and show the bar their perk. no app for your staff." />
          <HowCard icon={ChartBar} n="3" title="you see every group" body="your dashboard counts plans made at your place, group sizes, what they spent, and who tapped your booking link." />
        </div>
      </section>

      {/* the offer: everything pro includes, against what one table is worth */}
      <section className="mt-14 px-5 lg:grid lg:grid-cols-[1fr_0.9fr] lg:gap-10 lg:px-10">
        <div>
          <p className="text-[12px] font-semibold text-ink-soft">irlpass pro</p>
          <h2 className="display mt-1 text-[32px] font-bold leading-[0.95] tracking-tight lg:text-[44px]">one group's table covers the month.</h2>
          <ul className="mt-5 space-y-2.5">
            <Stack title="top of the guide, with a partner label" body="members see you first in the mood tab, with your perk on the card" />
            <Stack title="post what's on" body="a dj tonight, a sound bath at 8, a zero-proof menu all week: it shows in the feed" />
            <Stack title="your booking link, your prices" body="members book with you directly. you keep 100% of every booking" />
            <Stack title="a perk for showing up, a bonus for a story" body="members post your place to their friends, from their own instagram" />
            <Stack title="your dashboard" body="plans made at your place, group sizes, spend, stories, views and booking taps" />
            <Stack title="your door qr and partner sticker" body="the qr is how members claim the perk and how we count every group" />
          </ul>
        </div>
        <div className="mt-6 lg:mt-0">
          <OfferCard left={left} onStart={start} />
        </div>
      </section>

      {/* questions owners ask */}
      <section className="mt-14 px-5 lg:px-10">
        <p className="text-[12px] font-semibold text-ink-soft">questions</p>
        <div className="mt-3 divide-y divide-line rounded-[1.6rem] border border-line bg-white/70">
          <Faq q="who are irlpass members?" a="travelers and locals who want to go out with people, in medellín first. everyone signs up with their instagram and we check it, so they're real people with real followings." />
          <Faq q="do you take a cut of my sales?" a={`no. you set your own prices and keep 100% of what members spend or book. pro is a flat $${PRICE} a month.`} />
          <Faq q="what does the perk cost me?" a="you pick it. most spots give a free drink at the door and a second one for a story. it's one drink for a table that orders all night." />
          <Faq q="do my staff need an app?" a="no. the member scans the qr at your door and shows a screen with a live clock. your bartender just looks at it." />
          <Faq q="what if it doesn't work for us?" a="your first 14 days are free and we send you a group inside them. if no irlpass group comes through your door in those 14 days, you never pay. after that it's monthly, cancel any time." />
          <Faq q="can irlpass run a night at my place?" a="yes. irlpass nights, run clubs and day trips are becoming hosted experiences that members book and pay for in the app. pro venues get the first ones." />
          <Faq q="can anyone pay to be on irlpass?" a="no. we approve every venue: a social crowd, a good zero-proof option, a place our members would pick anyway. pro venues get a small partner label, and we never sell member data." />
        </div>
      </section>

      <section className="mx-5 mt-14 rounded-[2rem] bg-lime px-6 py-8 text-center lg:mx-10 lg:py-12">
        <h2 className="display text-[32px] font-bold leading-[0.95] tracking-tight lg:text-[44px]">see a group before you pay.</h2>
        <p className="mx-auto mt-2 max-w-[420px] text-[14.5px] text-ink/70">
          {left > 0 ? `the next ${left} ${left === 1 ? "venue" : "venues"} in medellín get the founding partner badge and the top of the guide.` : "claim your venue and we'll send your first group this week."}
        </p>
        <motion.button whileTap={{ scale: 0.97 }} onClick={start} className="mx-auto mt-5 flex w-full max-w-[360px] items-center justify-center gap-2 rounded-full bg-ink py-4 text-[16px] font-bold text-cream">
          claim your venue <ArrowRight size={18} weight="bold" />
        </motion.button>
      </section>

      <AnimatePresence>
        {step && <Onboarding step={step} setStep={setStep} left={left} />}
      </AnimatePresence>
    </div>
  )
}

function Proof({ where, what, n, label }) {
  return (
    <div className="rounded-[1.5rem] bg-cream/[0.07] p-5">
      <p className="text-[12px] font-bold text-cream/55">{where}</p>
      <p className="mt-1 text-[14.5px] leading-snug text-cream/80">{what}</p>
      <p className="display mt-4 text-[34px] font-bold leading-none tracking-tight">{n}</p>
      <p className="mt-1 text-[12px] text-cream/60">{label}</p>
    </div>
  )
}

function Collage({ photos, loaded }) {
  const shots = photos.slice(0, 3)
  if (loaded && shots.length === 0) {
    return (
      <div className="mt-10 flex justify-center lg:mt-0">
        <img src="/art/hero.png" alt="" className="max-h-[340px] w-auto select-none object-contain lg:max-h-[460px]" draggable="false" />
      </div>
    )
  }
  const tilt = ["-rotate-6", "rotate-3", "-rotate-2"]
  const place = ["left-0 top-6", "right-0 top-0", "left-1/2 -translate-x-1/2 top-[42%]"]
  return (
    <div className="relative mt-10 h-[340px] lg:mt-0 lg:h-[460px]">
      {shots.length === 0 && [0, 1, 2].map((i) => (
        <div key={i} className={`shimmer absolute h-[200px] w-[56%] rounded-[1.6rem] lg:h-[260px] ${tilt[i]} ${place[i]}`} />
      ))}
      {shots.map((p, i) => (
        <motion.figure
          key={p.src}
          initial={{ opacity: 0, y: 18, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring, delay: 0.1 + i * 0.1 }}
          className={`absolute w-[56%] overflow-hidden rounded-[1.6rem] border-[5px] border-white bg-cream-deep ${shadow} ${tilt[i]} ${place[i]}`}
        >
          <img src={p.src} alt="" className="h-[190px] w-full object-cover lg:h-[250px]" draggable="false" />
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-8 text-cream">
            <span className="display block truncate text-[16px] font-bold leading-none">{p.name}</span>
            {p.area && <span className="block truncate text-[11px] text-cream/75">{p.area}</span>}
          </figcaption>
        </motion.figure>
      ))}
      {shots.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: 0.5 }}
          className={`absolute bottom-2 right-3 flex items-center gap-2 rounded-full bg-white px-3.5 py-2 ${shadow}`}
        >
          <Gift size={16} weight="fill" />
          <span className="text-[12.5px] font-bold">free drink · scan at the door</span>
        </motion.div>
      )}
    </div>
  )
}

function HowCard({ icon: Icon, n, title, body }) {
  return (
    <div className={`rounded-[1.6rem] bg-white p-5 ${shadow}`}>
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lime"><Icon size={22} weight="duotone" /></span>
        <span className="display text-[28px] font-bold text-ink/10">{n}</span>
      </div>
      <p className="display mt-4 text-[21px] font-bold leading-tight">{title}</p>
      <p className="mt-1.5 text-[14px] leading-snug text-ink-soft">{body}</p>
    </div>
  )
}

function Stack({ title, body }) {
  return (
    <li className="flex gap-3">
      <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-lime-deep" />
      <div>
        <p className="text-[15.5px] font-bold leading-tight">{title}</p>
        <p className="mt-0.5 text-[13.5px] leading-snug text-ink-soft">{body}</p>
      </div>
    </li>
  )
}

function OfferCard({ left, onStart, compact = false }) {
  return (
    <div className={`rounded-[2rem] border border-line bg-white p-6 ${shadow}`}>
      {left > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-peach px-3 py-1 text-[12px] font-bold">
          founding partner badge · {left} left in medellín
        </span>
      )}
      <div className="mt-4 flex items-end gap-2">
        <p className="display text-[54px] font-bold leading-[0.85] tracking-tight">${PRICE}</p>
        <p className="pb-1 text-[13px] text-ink-soft">a month, one plan</p>
      </div>
      <p className="mt-2 text-[13.5px] font-semibold">one table of 6 spends about $400. pro pays for itself the first night.</p>
      <div className="mt-5 space-y-3 border-t border-line pt-5">
        <p className="flex gap-2.5 text-[14px] leading-snug"><Gift size={20} weight="duotone" className="shrink-0" /> <span><b>14 days free.</b> you're not charged until day 15.</span></p>
        <p className="flex gap-2.5 text-[14px] leading-snug"><ShieldCheck size={20} weight="duotone" className="shrink-0" /> <span><b>we send you a group first.</b> if no irlpass group comes through your door in your 14 days, you never pay.</span></p>
        <p className="flex gap-2.5 text-[14px] leading-snug"><ChartBar size={20} weight="duotone" className="shrink-0" /> <span><b>monthly, cancel any time.</b> no contract, no setup fee, no cut of your sales.</span></p>
      </div>
      {!compact && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={onStart} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-[16px] font-bold text-cream">
          claim your venue <ArrowRight size={18} weight="bold" />
        </motion.button>
      )}
    </div>
  )
}

function Faq({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <button onClick={() => setOpen(!open)} className="block w-full px-5 py-4 text-left">
      <span className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-bold">{q}</span>
        <span className={`shrink-0 text-[20px] leading-none text-ink-soft transition-transform ${open ? "rotate-45" : ""}`}>+</span>
      </span>
      {open && <span className="mt-2 block text-[14px] leading-snug text-ink-soft">{a}</span>}
    </button>
  )
}

// claim your venue: find it, pick the perk, who you are -> stripe
const STEPS = ["venue", "perk", "you"]
function Onboarding({ step, setStep, left }) {
  const saved = readDraft() || {}
  const [venue, setVenue] = useState(saved.venue || null)
  const [perk, setPerk] = useState(saved.perk || { perk: PERKS[0], story: STORY_PERKS[0] })
  const [contact, setContact] = useState({ name: "", email: "", phone: "", instagram: "", booking: "", ...saved.contact })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ venue, perk, contact })) } catch { /* private mode */ }
  }, [venue, perk, contact])

  const i = STEPS.indexOf(step)
  const back = () => (i > 0 ? setStep(STEPS[i - 1]) : setStep(null))
  const contactOk = contact.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim()) && contact.phone.replace(/\D/g, "").length >= 7

  const pay = async () => {
    setBusy(true)
    setErr("")
    const booking = contact.booking.trim()
    const r = await fetch("/api/pro", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ venue, perk, contact: { ...contact, booking: booking && !/^https?:\/\//.test(booking) ? `https://${booking}` : booking } }),
    }).then((x) => x.json()).catch(() => ({ error: "no connection, try again" }))
    if (r.url) { window.location.href = r.url; return }
    setErr(r.error || "something broke, try again")
    setBusy(false)
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setStep(null)} className="fixed inset-0 z-40 bg-ink/45 backdrop-blur-[2px]" />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        className="fixed inset-x-0 bottom-0 top-6 z-50 mx-auto flex max-w-[480px] flex-col rounded-t-[1.9rem] bg-cream lg:top-10"
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <button onClick={back} aria-label="back" className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/80"><ArrowLeft size={17} weight="bold" /></button>
          <div className="flex gap-1.5">
            {STEPS.map((s, k) => <span key={s} className={`h-1.5 rounded-full transition-all ${k === i ? "w-6 bg-ink" : k < i ? "w-1.5 bg-ink" : "w-1.5 bg-line"}`} />)}
          </div>
          <button onClick={() => setStep(null)} aria-label="close" className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white/80"><X size={17} weight="bold" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6 pt-5">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22 }}>
              {step === "venue" && <VenueStep venue={venue} setVenue={setVenue} />}
              {step === "perk" && <PerkStep venue={venue} perk={perk} setPerk={setPerk} />}
              {step === "you" && (
                <>
                  <YouStep contact={contact} setContact={setContact} />
                  <div className="mt-6"><OfferCard left={left} compact /></div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="border-t border-line/70 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {err && <p className="mb-2 text-center text-[13px] font-semibold text-[#8f2b2b]">{err}</p>}
          {step === "you" ? (
            <motion.button whileTap={{ scale: 0.97 }} onClick={pay} disabled={busy || !contactOk} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-[16px] font-bold text-cream disabled:opacity-35">
              {busy ? <CircleNotch size={18} className="animate-spin" /> : null} start my 14 free days
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setStep(STEPS[i + 1])}
              disabled={(step === "venue" && !venue?.name) || (step === "perk" && !perk.perk.trim())}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-4 text-[16px] font-bold text-cream disabled:opacity-35"
            >
              continue <ArrowRight size={17} weight="bold" />
            </motion.button>
          )}
        </div>
      </motion.div>
    </>
  )
}

function VenueStep({ venue, setVenue }) {
  const [q, setQ] = useState(venue?.name || "")
  const [res, setRes] = useState([])
  const [manual, setManual] = useState(!!venue && !venue.spotId)
  const [area, setArea] = useState(venue?.area || "")

  useEffect(() => {
    if (manual || q.trim().length < 2 || venue?.name === q) { setRes([]); return }
    const id = setTimeout(() => {
      fetch(`/api/pro?search=${encodeURIComponent(q.trim())}`).then((r) => r.json()).then((d) => setRes(d.spots || [])).catch(() => {})
    }, 250)
    return () => clearTimeout(id)
  }, [q, manual, venue?.name])

  return (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime"><Storefront size={24} weight="duotone" /></span>
      <h2 className="display mt-3 text-[30px] font-bold leading-[0.95] tracking-tight">find your venue</h2>
      <p className="mt-1.5 text-[14px] text-ink-soft">medellín for now. if you're already on our guide, your photos and hours come with you.</p>
      <div className="mt-4 flex items-center gap-2 rounded-[1.4rem] border border-line bg-white px-4 py-3 focus-within:border-ink">
        <MagnifyingGlass size={18} weight="bold" className="shrink-0 text-ink-soft" />
        <input
          autoFocus value={q}
          onChange={(e) => { setQ(e.target.value); if (venue) setVenue(manual ? { name: e.target.value, area } : null) }}
          placeholder="your venue's name"
          autoComplete="off" data-1p-ignore data-lpignore="true"
          className="w-full bg-transparent text-[16px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/50"
        />
      </div>

      {venue?.spotId && (
        <div className="mt-3 flex items-center gap-3 rounded-[1.4rem] border-2 border-ink bg-white p-2.5">
          {venue.photo ? <img src={venue.photo} alt="" className="h-14 w-14 rounded-[1rem] object-cover" /> : <span className="h-14 w-14 rounded-[1rem] bg-cream-deep" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">{venue.name}</p>
            <p className="truncate text-[12.5px] text-ink-soft">{[venue.kind, venue.area].filter(Boolean).join(" · ")}</p>
          </div>
          <CheckCircle size={24} weight="fill" className="mr-1 shrink-0" />
        </div>
      )}

      {!venue && res.length > 0 && (
        <div className="mt-3 space-y-2">
          {res.map((s) => (
            <button key={s.spotId} onClick={() => { setVenue(s); setQ(s.name); setRes([]) }} className={`flex w-full items-center gap-3 rounded-[1.4rem] bg-white p-2.5 text-left ${shadow}`}>
              {s.photo ? <img src={s.photo} alt="" className="h-14 w-14 rounded-[1rem] object-cover" /> : <span className="h-14 w-14 rounded-[1rem] bg-cream-deep" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">{s.name}</p>
                <p className="truncate text-[12.5px] text-ink-soft">{[s.kind, s.area].filter(Boolean).join(" · ")}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {!venue?.spotId && q.trim().length >= 2 && (
        manual ? (
          <div className="mt-3">
            <label className="text-[12.5px] font-semibold text-ink-soft">neighborhood</label>
            <input
              value={area}
              onChange={(e) => { setArea(e.target.value); setVenue({ name: q.trim(), area: e.target.value }) }}
              placeholder="like provenza or laureles"
              className="mt-1 w-full rounded-[1.4rem] border border-line bg-white px-4 py-3 text-[15px] font-semibold outline-none focus:border-ink"
            />
          </div>
        ) : (
          <button onClick={() => { setManual(true); setVenue({ name: q.trim(), area }) }} className="mt-3 w-full rounded-full border border-line bg-white/70 py-3 text-[13.5px] font-bold">
            not listed? add "{q.trim()}"
          </button>
        )
      )}
    </>
  )
}

function Choice({ options, value, onChange, custom }) {
  const isCustom = value && !options.includes(value)
  const [typing, setTyping] = useState(isCustom)
  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o} onClick={() => { setTyping(false); onChange(o) }} className={`rounded-full border px-4 py-2.5 text-[14px] font-bold ${value === o && !typing ? "border-ink bg-ink text-cream" : "border-line bg-white"}`}>
            {o}
          </button>
        ))}
        <button onClick={() => { setTyping(true); onChange(isCustom ? value : "") }} className={`rounded-full border px-4 py-2.5 text-[14px] font-bold ${typing ? "border-ink bg-ink text-cream" : "border-line bg-white"}`}>
          {custom}
        </button>
      </div>
      {typing && (
        <input autoFocus value={value} maxLength={60} onChange={(e) => onChange(e.target.value)} placeholder="like a free tasting flight"
          className="mt-2 w-full rounded-[1.4rem] border border-line bg-white px-4 py-3 text-[15px] font-semibold outline-none focus:border-ink" />
      )}
    </>
  )
}

function PerkStep({ venue, perk, setPerk }) {
  return (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime"><Gift size={24} weight="duotone" /></span>
      <h2 className="display mt-3 text-[30px] font-bold leading-[0.95] tracking-tight">what do members get?</h2>
      <p className="mt-1.5 text-[14px] text-ink-soft">one perk at the door for showing up, and a bonus for posting a story. you can change these any time.</p>

      <p className="mt-5 flex items-center gap-1.5 text-[13px] font-bold"><QrCode size={16} weight="bold" /> at the door</p>
      <Choice options={PERKS} value={perk.perk} onChange={(v) => setPerk({ ...perk, perk: v })} custom="something else" />

      <p className="mt-5 flex items-center gap-1.5 text-[13px] font-bold"><InstagramLogo size={16} weight="bold" /> for a story tagging you</p>
      <Choice options={STORY_PERKS} value={perk.story} onChange={(v) => setPerk({ ...perk, story: v })} custom="something else" />

      {/* what members will see in the guide */}
      <p className="mt-6 text-[12px] font-semibold text-ink-soft">what members see</p>
      <div className="mt-2 overflow-hidden rounded-[1.5rem] bg-lime">
        <div className="px-4 pb-3 pt-3.5">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-ink/70"><Gift size={14} weight="fill" /> irlpass perk · {venue?.name || "your venue"}</p>
          <p className="display mt-1 text-[22px] font-bold leading-tight">{perk.perk || "…"}</p>
        </div>
        <p className="bg-white/55 px-4 py-2.5 text-[12.5px]">post a story tagging you and get {perk.story || "…"}</p>
      </div>
    </>
  )
}

function YouStep({ contact, setContact }) {
  const field = (k, label, props = {}) => (
    <div className="mt-3">
      <label className="text-[12.5px] font-semibold text-ink-soft">{label}</label>
      <input value={contact[k]} onChange={(e) => setContact({ ...contact, [k]: e.target.value })}
        className="mt-1 w-full rounded-[1.4rem] border border-line bg-white px-4 py-3 text-[15px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
        {...props} />
    </div>
  )
  return (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lime"><UsersThree size={24} weight="duotone" /></span>
      <h2 className="display mt-3 text-[30px] font-bold leading-[0.95] tracking-tight">who should we talk to?</h2>
      <p className="mt-1.5 text-[14px] text-ink-soft">we look at every venue ourselves and message you on whatsapp within a day.</p>
      {field("name", "your name", { autoComplete: "name", placeholder: "first and last" })}
      {field("phone", "whatsapp", { type: "tel", autoComplete: "tel", placeholder: "+57 300 000 0000" })}
      {field("email", "email", { type: "email", autoComplete: "email", placeholder: "for receipts and your report" })}
      {field("instagram", "venue instagram", { autoCapitalize: "none", placeholder: "@yourspot" })}
      {field("booking", "booking link (optional)", { type: "url", autoCapitalize: "none", placeholder: "your reservations page or wa.me link" })}
    </>
  )
}

// back from stripe: they're in. the dashboard link and the door qr come first.
const qrFor = (url, size = 600) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=1&color=3a322c&bgcolor=ffffff&data=${encodeURIComponent(url)}`

function Welcomed({ venue, owner }) {
  const qr = qrFor(venue.door)
  return (
    <div className="mx-auto max-w-[560px] px-5 pb-12 pt-[max(1rem,env(safe-area-inset-top))]">
      <Logo size="text-[22px]" />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <p className="mt-8 flex items-center gap-2 text-[13px] font-bold"><CheckCircle size={18} weight="fill" className="text-lime-deep" /> irlpass pro{venue.founding ? " · founding partner" : ""}</p>
        <h1 className="display mt-2 text-[42px] font-bold leading-[0.93] tracking-[-0.03em]">{venue.name} is on irlpass.</h1>
        <p className="mt-3 text-[15.5px] text-ink-soft">your 14 free days start now. we look at every venue ourselves and message you on whatsapp within a day, then we send you your first group.</p>
      </motion.div>

      <a href={`/pro?owner=${owner}`} className="mt-6 flex items-center justify-center gap-2 rounded-full bg-ink py-4 text-[16px] font-bold text-cream">
        open my dashboard <ArrowRight size={17} weight="bold" />
      </a>
      <p className="mt-2 text-center text-[12.5px] text-ink-soft">we emailed you this link too. it's how you get back in.</p>

      <div className={`mt-6 rounded-[2rem] bg-white p-5 text-center ${shadow}`}>
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-ink-soft">your door qr</p>
        <img src={qr} alt="your irlpass door qr" className="mx-auto mt-3 aspect-square w-full max-w-[240px]" />
        <p className="mt-3 text-[13.5px] text-ink-soft">print it and put it by the door or the bar. members scan it to get <b className="text-ink">{venue.perk}</b>.</p>
        <a href={qr} target="_blank" rel="noreferrer" className="mt-4 block rounded-full border border-line py-3 text-[14px] font-bold">open the qr to print</a>
      </div>
    </div>
  )
}

// owner mode: the venue's own page on irlpass. post what's on, change the perk
// and booking link, see this month's groups. the link in the email is the key.
function Owner({ token }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState("")
  useEffect(() => {
    fetch(`/api/pro?owner=${encodeURIComponent(token)}`).then((r) => r.json()).then((r) => (r.venue ? setD(r) : setErr(r.error || "this link doesn't open a venue"))).catch(() => setErr("no connection, try again"))
  }, [token])
  const call = (body) => fetch("/api/pro", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ owner: token, ...body }) }).then((r) => r.json()).catch(() => ({ error: "no connection, try again" }))

  if (err) {
    return (
      <div className="mx-auto max-w-[560px] px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <Logo size="text-[22px]" />
        <h1 className="display mt-10 text-[34px] font-bold leading-[0.95] tracking-tight">{err}</h1>
        <a href="/pro" className="mt-6 inline-block rounded-full bg-ink px-5 py-3 text-[14px] font-bold text-cream">irlpass pro</a>
      </div>
    )
  }
  if (!d) return <div className="flex h-[60vh] items-center justify-center"><CircleNotch size={26} className="animate-spin text-ink-soft" /></div>

  const { venue: v, numbers: n } = d
  const month = new Date(`${n.since}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }).toLowerCase()
  return (
    <div className="mx-auto max-w-[980px] px-5 pb-16 pt-[max(1rem,env(safe-area-inset-top))] lg:px-10 lg:pt-8">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2"><Logo size="text-[22px]" /><span className="rounded-full border border-line bg-white/70 px-2.5 py-1 text-[11px] font-bold">pro</span></span>
        <button
          onClick={async () => { const r = await call({ action: "billing" }); if (r.url) window.location.href = r.url }}
          className="rounded-full border border-line bg-white/80 px-4 py-2 text-[12.5px] font-bold"
        >billing</button>
      </header>

      <p className="mt-8 flex flex-wrap items-center gap-2 text-[13px] font-bold">
        {v.status === "active"
          ? <><span className="h-1.5 w-1.5 rounded-full bg-lime-deep" /> live in the guide</>
          : <><span className="h-1.5 w-1.5 rounded-full bg-peach" /> we're reviewing your venue, you'll hear from us on whatsapp</>}
        {v.founding && <span className="rounded-full bg-peach px-2.5 py-0.5 text-[11.5px]">founding partner</span>}
      </p>
      <h1 className="display mt-2 text-[40px] font-bold leading-[0.93] tracking-[-0.03em] lg:text-[54px]">{v.name}</h1>

      <section className="mt-8">
        <p className="text-[12px] font-semibold text-ink-soft">{month} so far</p>
        <div className="mt-2 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Num icon={UsersThree} n={n.going} label="members made plans here" />
          <Num icon={QrCode} n={n.groups} label={`groups at the door${n.avgGroup ? `, ${n.avgGroup} avg` : ""}`} />
          <Num icon={ChartBar} n={n.spend ? `$${n.spend.toLocaleString()}` : "-"} label={`group spend reported${n.spendReports ? ` (${n.spendReports})` : ""}`} />
          <Num icon={InstagramLogo} n={n.stories.length} label="stories tagging you" />
          <Num icon={Eye} n={n.views} label="profile views" />
          <Num icon={CalendarCheck} n={n.bookingTaps} label="booking link taps" />
        </div>
        {n.plans.length > 0 && (
          <div className="mt-3 rounded-[1.5rem] border border-line bg-white/70 p-4">
            <p className="text-[12px] font-bold text-ink-soft">plans made at your place</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {n.plans.slice(0, 12).map((p) => (
                <span key={p.night} className="rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold">
                  {new Date(`${p.night}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" }).toLowerCase()} · {p.size} going
                </span>
              ))}
            </div>
          </div>
        )}
        {n.stories.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {n.stories.slice(0, 10).map((u, k) => <a key={u} href={u} target="_blank" rel="noreferrer" className="rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] font-bold">story {k + 1} <ArrowUpRight size={11} weight="bold" className="inline" /></a>)}
          </div>
        )}
      </section>

      <div className="mt-10 lg:grid lg:grid-cols-2 lg:gap-8">
        <Posts posts={d.posts} call={call} onChange={(posts) => setD({ ...d, posts })} />
        <Profile v={v} call={call} onSaved={(venue) => setD({ ...d, venue })} />
      </div>

      <section className={`mt-10 flex items-center gap-4 rounded-[1.6rem] bg-white p-4 ${shadow}`}>
        <img src={qrFor(v.door, 300)} alt="your door qr" className="h-24 w-24 shrink-0" />
        <div className="min-w-0">
          <p className="text-[15px] font-bold">your door qr</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">by the door or the bar. it's how members get the perk and how we count every group.</p>
          <a href={qrFor(v.door)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[13px] font-bold underline">open to print</a>
        </div>
      </section>
    </div>
  )
}

function Num({ icon: Icon, n, label }) {
  return (
    <div className={`rounded-[1.4rem] bg-white p-4 ${shadow}`}>
      <Icon size={18} weight="duotone" className="text-ink-soft" />
      <p className="display mt-2 text-[30px] font-bold leading-none tracking-tight">{n}</p>
      <p className="mt-1 text-[12px] leading-tight text-ink-soft">{label}</p>
    </div>
  )
}

const input = "mt-1 w-full rounded-[1.2rem] border border-line bg-white px-4 py-3 text-[15px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"

function Posts({ posts, call, onChange }) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [when, setWhen] = useState("tonight")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const post = async () => {
    setBusy(true); setErr("")
    const tonight = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)
    const r = await call({ action: "post", title, body, ...(when === "tonight" ? { day: tonight } : { days: 7 }) })
    setBusy(false)
    if (r.posts) { onChange(r.posts); setTitle(""); setBody("") } else setErr(r.error || "something broke")
  }
  return (
    <section>
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft"><Megaphone size={13} weight="fill" /> what's on</p>
      <h2 className="display mt-1 text-[26px] font-bold leading-[0.95] tracking-tight">post it to members</h2>
      <p className="mt-1 text-[13.5px] text-ink-soft">it shows on your spot in the guide, and on your card in the feed.</p>
      <div className="mt-3 rounded-[1.5rem] border border-line bg-white/70 p-4">
        <input value={title} maxLength={70} onChange={(e) => setTitle(e.target.value)} placeholder="sound bath tonight at 8" className={input} />
        <input value={body} maxLength={200} onChange={(e) => setBody(e.target.value)} placeholder="details, optional" className={`${input} mt-2 text-[14px] font-medium`} />
        <div className="mt-3 flex gap-2">
          {[["tonight", "just tonight"], ["week", "all week"]].map(([k, l]) => (
            <button key={k} onClick={() => setWhen(k)} className={`rounded-full border px-4 py-2 text-[13px] font-bold ${when === k ? "border-ink bg-ink text-cream" : "border-line bg-white"}`}>{l}</button>
          ))}
          <motion.button whileTap={{ scale: 0.97 }} onClick={post} disabled={busy || title.trim().length < 3} className="ml-auto rounded-full bg-ink px-5 py-2 text-[13px] font-bold text-cream disabled:opacity-35">post</motion.button>
        </div>
        {err && <p className="mt-2 text-[13px] font-semibold text-[#8f2b2b]">{err}</p>}
      </div>
      <div className="mt-3 space-y-2">
        {posts.map((p) => (
          <div key={p.id} className="flex items-start gap-3 rounded-[1.3rem] bg-white px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-bold text-ink-soft">{p.day ? "tonight" : `until ${new Date(`${p.ends_on}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" }).toLowerCase()}`}</p>
              <p className="text-[15px] font-bold leading-snug">{p.title}</p>
              {p.body && <p className="text-[13px] text-ink-soft">{p.body}</p>}
            </div>
            <button aria-label="take it down" onClick={async () => { const r = await call({ action: "unpost", id: p.id }); if (r.posts) onChange(r.posts) }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line"><Trash size={14} weight="bold" /></button>
          </div>
        ))}
      </div>
    </section>
  )
}

function Profile({ v, call, onSaved }) {
  const [f, setF] = useState({ perk: v.perk || "", story: v.story || "", blurb: v.blurb || "", booking: v.booking || "", instagram: v.instagram || "" })
  const [state, setState] = useState("")
  const save = async () => {
    setState("saving")
    const booking = f.booking.trim()
    const r = await call({ action: "profile", ...f, booking: booking && !/^https?:\/\//.test(booking) ? `https://${booking}` : booking })
    if (r.venue) { onSaved(r.venue); setState("saved") } else setState(r.error || "something broke")
  }
  const field = (k, label, props = {}) => (
    <div className="mt-3">
      <label className="text-[12.5px] font-semibold text-ink-soft">{label}</label>
      <input value={f[k]} onChange={(e) => { setF({ ...f, [k]: e.target.value }); setState("") }} className={input} {...props} />
    </div>
  )
  return (
    <section className="mt-10 lg:mt-0">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-soft"><Storefront size={13} weight="fill" /> your spot</p>
      <h2 className="display mt-1 text-[26px] font-bold leading-[0.95] tracking-tight">what members see</h2>
      <div className="rounded-[1.5rem] border border-line bg-white/70 p-4 pt-1">
        {field("perk", "perk at the door", { maxLength: 60 })}
        {field("story", "bonus for a story tagging you", { maxLength: 60 })}
        {field("booking", "booking link", { type: "url", autoCapitalize: "none", placeholder: "reservations page or wa.me link" })}
        {field("instagram", "instagram", { autoCapitalize: "none", placeholder: "@yourspot" })}
        {field("blurb", "one line about your place", { maxLength: 200, placeholder: "café by day, club by night" })}
        <div className="mt-4 flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.97 }} onClick={save} disabled={state === "saving"} className="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-bold text-cream disabled:opacity-50">save</motion.button>
          {state && state !== "saving" && <span className={`text-[13px] font-semibold ${state === "saved" ? "text-ink-soft" : "text-[#8f2b2b]"}`}>{state}</span>}
        </div>
      </div>
    </section>
  )
}
