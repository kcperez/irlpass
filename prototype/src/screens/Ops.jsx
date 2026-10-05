import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, CircleNotch, ArrowsClockwise } from "@phosphor-icons/react"
import { cityChip } from "../lib/cities"

// founders only: the numbers that say whether this thing is working.
const fmtDay = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

function Stat({ n, label, tone = "" }) {
  return (
    <div className={`rounded-[1.25rem] border-2 border-line bg-white/70 px-4 py-3 ${tone}`}>
      <p className="display text-[30px] font-bold leading-none">{n}</p>
      <p className="mt-1 text-[12px] font-semibold text-ink-soft">{label}</p>
    </div>
  )
}

// josh's welcome dm: every new member gets it in their chat tab. {first name}
// and {city} fill in. "send to everyone" only reaches people without a thread yet.
function WelcomeEditor({ token, text }) {
  const [value, setValue] = useState(text)
  const [note, setNote] = useState("")
  const post = (action, body) =>
    fetch(`/api/ops?t=${token}&action=${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then((r) => r.json()).catch(() => ({ error: "failed" }))
  return (
    <div className="mt-4 rounded-[1.25rem] border-2 border-line bg-white/70 p-3">
      <p className="text-[13px] font-bold">welcome dm from josh</p>
      <p className="text-[11.5px] text-ink-soft">{"{first name}"} and {"{city}"} fill in for each person</p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={5}
        className="mt-2 w-full rounded-lg border border-line bg-white px-2.5 py-2 text-[13px] leading-snug"
      />
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          onClick={async () => { const r = await post("welcome-text", { text: value }); setNote(r.ok ? "saved" : r.error || "failed") }}
          className="rounded-full bg-ink py-2 text-[12.5px] font-bold text-cream"
        >
          save text
        </button>
        <button
          onClick={async () => { setNote("sending…"); const r = await post("welcome-backfill"); setNote(r.error ? r.error : `sent to ${r.sent} people`) }}
          className="rounded-full border-2 border-ink py-2 text-[12.5px] font-bold"
        >
          send to everyone new
        </button>
      </div>
      {note && <p className="mt-1.5 text-[12px] font-semibold text-ink-soft">{note}</p>}
    </div>
  )
}

// conversion: the knobs, free-month codes, the ride and who bought, hosts
function ConversionPanel({ token, c, onSaved }) {
  const [note, setNote] = useState("")
  const [codes, setCodes] = useState([])
  const [mk, setMk] = useState({ kind: "ride", count: 8, months: 1, maxUses: 1, note: "" })
  const [ride, setRide] = useState({ title: "guaranteed ride out of the stadium", night: "2026-10-11", depart: "3am from the stadium gates", priceCents: 5000, seats: 8 })
  const post = (action, body) =>
    fetch(`/api/ops?t=${token}&action=${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then((r) => r.json()).catch(() => ({ error: "failed" }))
  const field = "w-full min-w-0 rounded-lg border border-line bg-white px-2 py-1.5 text-[13px]"
  if (!c) return null
  return (
    <div className="mt-4 rounded-[1.25rem] border-2 border-line bg-white/70 p-3">
      <p className="text-[13px] font-bold">conversion</p>
      <p className="text-[11.5px] text-ink-soft">{c.compedNow} on a free month from a code · referrals {c.referrals.joined} joined, {c.referrals.rewarded} rewarded</p>
      {c.funnel && (
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
          {[[c.funnel.people, "saw the paywall"], [c.funnel.subscribed, "subscribed"], [c.funnel.tripUnlocks, "bought a trip"], [c.funnel.codes, "used a code"]].map(([n, l]) => (
            <div key={l} className="rounded-lg bg-cream-deep px-1 py-1.5">
              <p className="text-[18px] font-bold leading-none">{n}</p>
              <p className="mt-0.5 text-[10px] font-semibold text-ink-soft">{l}</p>
            </div>
          ))}
          <p className="col-span-4 text-[10.5px] text-ink-soft">last 7 days · {c.funnel.views} paywall views ({Object.entries(c.funnel.byReason).map(([k, v]) => `${k} ${v}`).join(", ") || "none yet"})</p>
        </div>
      )}

      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11.5px]">
        <button
          onClick={async () => { const r = await post("setting", { key: "founding_free_dms", value: c.settings.founding_free_dms === "on" ? "off" : "on" }); setNote(r.ok ? "saved" : r.error); onSaved() }}
          className={`rounded-lg border-2 px-2 py-1.5 font-bold ${c.settings.founding_free_dms === "on" ? "border-ink bg-lime" : "border-line"}`}
        >
          founding free dms: {c.settings.founding_free_dms}
        </button>
        <label className="rounded-lg border-2 border-line px-2 py-1 font-bold">
          free days
          <input defaultValue={c.settings.trial_days} onBlur={async (e) => { const r = await post("setting", { key: "trial_days", value: e.target.value }); setNote(r.ok ? "saved" : r.error) }} className={field} />
        </label>
        <label className="rounded-lg border-2 border-line px-2 py-1 font-bold">
          referral ¢
          <input defaultValue={c.settings.referral_reward_cents} onBlur={async (e) => { const r = await post("setting", { key: "referral_reward_cents", value: e.target.value }); setNote(r.ok ? "saved" : r.error) }} className={field} />
        </label>
      </div>

      <p className="mt-3 text-[12px] font-bold">free-month codes</p>
      <div className="mt-1 grid grid-cols-4 gap-1.5">
        <select value={mk.kind} onChange={(e) => setMk({ ...mk, kind: e.target.value })} className={field}>
          {["ride", "host", "promo"].map((k) => <option key={k}>{k}</option>)}
        </select>
        <input type="number" value={mk.count} onChange={(e) => setMk({ ...mk, count: e.target.value })} className={field} title="how many codes" />
        <input type="number" value={mk.months} onChange={(e) => setMk({ ...mk, months: e.target.value })} className={field} title="months free" />
        <input type="number" value={mk.maxUses} onChange={(e) => setMk({ ...mk, maxUses: e.target.value })} className={field} title="uses per code" />
      </div>
      <p className="mt-0.5 text-[10.5px] text-ink-soft">kind · how many · months free · uses each</p>
      <button
        onClick={async () => { const r = await post("make-codes", mk); setCodes(r.codes || []); setNote(r.error || `made ${r.codes?.length}`); onSaved() }}
        className="mt-1.5 w-full rounded-full bg-ink py-2 text-[12.5px] font-bold text-cream"
      >
        make codes
      </button>
      {codes.length > 0 && <p className="mt-1.5 select-all rounded-lg bg-cream-deep p-2 font-mono text-[12px]">{codes.join("  ")}</p>}
      <div className="mt-2 max-h-40 overflow-y-auto font-mono text-[11px] text-ink-soft">
        {c.codes.map((x) => <p key={x.code}>{x.code} · {x.kind} · {x.uses}/{x.max_uses} used</p>)}
      </div>

      <p className="mt-3 text-[12px] font-bold">the ride (members only, $ in the app)</p>
      {c.rides.map((r) => (
        <div key={r.id} className="mt-1.5 rounded-lg border border-line bg-white px-2.5 py-2 text-[12px]">
          <p className="font-bold">{r.title} · {fmtDay(r.night)} · ${Math.round(r.price_cents / 100)} · {r.buyers.length}/{r.seats} sold {r.active ? "" : "(hidden)"}</p>
          {r.buyers.length > 0 && <p className="text-ink-soft">{r.buyers.map((b) => `${b.name} ${b.ig}`).join(", ")}</p>}
          <button onClick={async () => { await post("ride", { id: r.id, active: !r.active }); onSaved() }} className="mt-1 text-[11px] font-bold underline">{r.active ? "hide" : "show"}</button>
        </div>
      ))}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <input value={ride.title} onChange={(e) => setRide({ ...ride, title: e.target.value })} className={`${field} col-span-2`} placeholder="title" />
        <input type="date" value={ride.night} onChange={(e) => setRide({ ...ride, night: e.target.value })} className={field} />
        <input value={ride.depart} onChange={(e) => setRide({ ...ride, depart: e.target.value })} className={field} placeholder="3am from the stadium" />
        <input type="number" value={ride.priceCents / 100} onChange={(e) => setRide({ ...ride, priceCents: Math.round(Number(e.target.value) * 100) })} className={field} title="price $" />
        <input type="number" value={ride.seats} onChange={(e) => setRide({ ...ride, seats: e.target.value })} className={field} title="seats" />
      </div>
      <button
        onClick={async () => { const r = await post("ride", ride); setNote(r.ok ? "ride added" : r.error); onSaved() }}
        className="mt-1.5 w-full rounded-full border-2 border-ink py-2 text-[12.5px] font-bold"
      >
        add a ride
      </button>

      {c.hosts.length > 0 && (
        <>
          <p className="mt-3 text-[12px] font-bold">want to host ({c.hosts.length})</p>
          {c.hosts.map((h) => <p key={h.memberNo} className="text-[12px]">{h.name} {h.ig} · {h.earn}{h.note ? ` · ${h.note}` : ""}</p>)}
        </>
      )}
      {note && <p className="mt-1.5 text-[12px] font-semibold text-ink-soft">{note}</p>}
    </div>
  )
}

// josh curates the mood boards here: rename, move, hide, add
function SpotsEditor({ token, spots, onSaved }) {
  const [draft, setDraft] = useState({ mood: "pregame", name: "", area: "", kind: "", recovery: false })
  const save = async (body) => {
    await fetch("/api/mood", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, action: "spot", ...body }),
    }).catch(() => {})
    onSaved()
  }
  const field = "w-full min-w-0 rounded-lg border border-line bg-white px-2 py-1.5 text-[13px]"
  return (
    <div className="mt-4 rounded-[1.25rem] border-2 border-line bg-white/70 p-3">
      <p className="text-[13px] font-bold">mood board spots (medellín)</p>
      {["pregame", "afters", "chill"].map((mood) => (
        <div key={mood} className="mt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">{mood}</p>
          {spots.filter((sp) => sp.mood === mood).map((sp) => (
            <div key={sp.id} className={`mt-1.5 grid grid-cols-[1fr_0.8fr_auto] items-center gap-1.5 ${sp.active ? "" : "opacity-45"}`}>
              <input defaultValue={sp.name} onBlur={(e) => e.target.value !== sp.name && save({ id: sp.id, name: e.target.value })} className={field} />
              <input defaultValue={sp.area || ""} onBlur={(e) => e.target.value !== (sp.area || "") && save({ id: sp.id, area: e.target.value })} className={field} placeholder="area" />
              <span className="flex items-center gap-1.5">
                {sp.goingTonight > 0 && <span className="rounded-full bg-lime px-1.5 text-[11px] font-bold">{sp.goingTonight}</span>}
                <button onClick={() => save({ id: sp.id, active: !sp.active })} className="rounded-full border border-line px-2 py-1 text-[11px] font-bold">
                  {sp.active ? "hide" : "show"}
                </button>
              </span>
            </div>
          ))}
        </div>
      ))}
      <div className="mt-4 grid grid-cols-2 gap-1.5 border-t border-line/70 pt-3">
        <select value={draft.mood} onChange={(e) => setDraft({ ...draft, mood: e.target.value })} className={field}>
          <option value="pregame">pregame</option>
          <option value="afters">afters</option>
          <option value="chill">chill</option>
        </select>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="spot name" className={field} />
        <input value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} placeholder="area (el poblado)" className={field} />
        <input value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} placeholder="kind (rooftop, club, gym)" className={field} />
        <label className="col-span-2 flex items-center gap-2 text-[12.5px] font-semibold">
          <input type="checkbox" checked={draft.recovery} onChange={(e) => setDraft({ ...draft, recovery: e.target.checked })} />
          recovery (daytime wellness list)
        </label>
        <button
          onClick={async () => {
            if (!draft.name.trim()) return
            await save({ mood: draft.mood, name: draft.name, area: draft.area, kind: draft.kind, tag: draft.recovery ? "recovery" : "" })
            setDraft({ ...draft, name: "", area: "", kind: "" })
          }}
          className="col-span-2 rounded-full bg-ink py-2 text-[13px] font-bold text-cream"
        >
          add spot
        </button>
      </div>
    </div>
  )
}

export default function Ops({ token }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState("")
  const [at, setAt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [openCity, setOpenCity] = useState(null)
  const [photoRun, setPhotoRun] = useState(null) // null | "running" | result

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const r = await fetch(`/api/ops?t=${token}`, { cache: "no-store" })
      if (!r.ok) throw new Error("founders only")
      setD(await r.json())
      setAt(new Date())
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  // keep it current: every 60s, and whenever you come back to the tab
  useEffect(() => {
    const id = setInterval(load, 60000)
    const onFocus = () => load()
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [load])

  if (err) {
    return <div className="flex min-h-[var(--app-h)] items-center justify-center text-[14px] text-ink-soft">{err}</div>
  }
  if (!d) {
    return <div className="flex min-h-[var(--app-h)] items-center justify-center"><CircleNotch size={24} className="animate-spin text-ink-soft" /></div>
  }

  return (
    <div className="min-h-[var(--app-h)] px-5 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        <a href={`/?screen=app&t=${token}`} aria-label="back"><ArrowLeft size={22} weight="bold" /></a>
        <h1 className="display text-[26px] font-bold">ops</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={load}
            aria-label="refresh"
            className="flex items-center gap-1.5 rounded-full border-2 border-line px-3 py-1.5 text-[12px] font-bold"
          >
            <ArrowsClockwise size={13} weight="bold" className={busy ? "animate-spin" : ""} />
            {at ? at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}
          </button>
          <a href={`/?screen=app&t=${token}`} className="rounded-full border-2 border-line px-3 py-1.5 text-[12px] font-bold">app</a>
          <a href={`/?screen=app&t=${token}&tab=chat`} className="rounded-full bg-ink px-3 py-1.5 text-[12px] font-bold text-cream">chat</a>
        </div>
      </div>

      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">members</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat n={d.members.total} label="total" />
        <Stat n={d.members.today} label="today" tone={d.members.today > 0 ? "border-ink bg-lime" : ""} />
        <Stat n={d.members.week} label="this week" />
        <Stat n={d.members.verified} label="verified ig" />
        <Stat n={d.members.withPhoto} label="with photo" />
        <Stat n={d.members.paying} label="paying" />
        <Stat n={d.members.comped} label="comped" />
      </div>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">the calendar</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat n={d.calendar.peopleWithDates} label="with dates up" tone="border-ink bg-lime" />
        <Stat n={d.calendar.tripsUp} label="trips posted" />
        <Stat n={d.calendar.silent} label="signed up, silent" />
      </div>

      {d.calendar.cities.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {d.calendar.cities.map((c) => (
            <div key={c.city} className="overflow-hidden rounded-[1.25rem] border-2 border-line bg-white/70">
              <button
                onClick={() => setOpenCity(openCity === c.city ? null : c.city)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-[15px] font-bold">{cityChip(c.city).emoji} {cityChip(c.city).name}</span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-lime px-2.5 py-0.5 text-[12px] font-bold">{c.people}</span>
                  <span className="text-[12px] font-bold text-ink-soft">{openCity === c.city ? "−" : "+"}</span>
                </span>
              </button>

              {openCity === c.city && (
                <div className="border-t border-line/60">
                  {c.roster.map((p, i) => (
                    <div key={`${p.memberNo}-${i}`} className="flex items-center gap-2 border-b border-line/50 px-4 py-2.5 last:border-b-0">
                      {p.photo ? (
                        <img src={p.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream-deep text-[12px] font-bold text-ink-soft">
                          {(p.name || p.ig)[0]?.toUpperCase()}
                        </span>
                      )}
                      <a
                        href={`https://instagram.com/${String(p.ig).replace(/^@/, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-[13.5px] font-semibold underline-offset-2 hover:underline"
                      >
                        {p.ig}
                      </a>
                      {p.local && <span className="shrink-0 rounded-full bg-peach px-2 py-0.5 text-[10px] font-bold">local</span>}
                      {p.verified && <span className="shrink-0 rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold">✓</span>}
                      <span className="shrink-0 text-[11.5px] text-ink-soft">{fmtDay(p.starts)} – {fmtDay(p.ends)}</span>
                      <a
                        href={`/?screen=app&t=${token}&dm=${p.memberNo}`}
                        className="shrink-0 rounded-full border-2 border-line px-2 py-0.5 text-[10px] font-bold text-ink-soft"
                      >
                        dm
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">instagram verification</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat n={d.verifyFunnel?.reached ?? 0} label="saw the code" />
        <Stat n={d.verifyFunnel?.completed ?? 0} label="verified" tone={d.verifyFunnel?.completed ? "border-ink bg-lime" : ""} />
        <Stat
          n={`${d.verifyFunnel?.reached ? Math.round((d.verifyFunnel.completed / d.verifyFunnel.reached) * 100) : 0}%`}
          label="finished"
        />
      </div>

      <button
        onClick={async () => {
          setPhotoRun("running")
          const r = await fetch(`/api/ops?t=${token}&action=backfill-photos`, { method: "POST" })
            .then((x) => x.json())
            .catch(() => ({ error: "failed" }))
          setPhotoRun(r)
          load()
        }}
        disabled={photoRun === "running"}
        className="mt-6 w-full rounded-full border-2 border-ink py-3 text-[13.5px] font-bold disabled:opacity-50"
      >
        {photoRun === "running"
          ? "pulling instagram photos… (up to a few minutes)"
          : photoRun?.error
            ? `photo backfill failed: ${photoRun.error}`
            : photoRun
              ? `filled ${photoRun.filled} of ${photoRun.missing} missing photos`
              : "fill in missing profile photos from instagram"}
      </button>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">mood · tonight</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat n={d.mood?.setTonight ?? 0} label="set a mood" />
        <Stat n={d.mood?.goingTonight ?? 0} label="i'm going taps" tone={d.mood?.goingTonight ? "border-ink bg-lime" : ""} />
        <Stat n={d.mood?.changedMood ?? 0} label="changed mood across nights" />
      </div>
      <p className="mt-1.5 text-[11.5px] text-ink-soft">
        all time: {d.mood?.setEver ?? 0} set a mood · {d.mood?.goingPeople ?? 0} tapped going · {d.mood?.cameBack ?? 0} came back another night
      </p>

      <SpotsEditor token={token} spots={d.spots || []} onSaved={load} />

      <WelcomeEditor token={token} text={d.welcome || ""} />
      <ConversionPanel token={token} c={d.conversion} onSaved={load} />

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">vibes</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat n={d.vibesFunnel?.seen ?? 0} label="saw the prompt" />
        <Stat n={d.vibesFunnel?.finished ?? 0} label="have 3+ vibes" tone={d.vibesFunnel?.finished ? "border-ink bg-lime" : ""} />
        <Stat
          n={`${d.members?.total ? Math.round(((d.vibesFunnel?.finished || 0) / d.members.total) * 100) : 0}%`}
          label="of members"
        />
      </div>

      {d.requested?.length > 0 && (
        <>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">cities people asked for</p>
          <div className="mt-2 overflow-hidden rounded-[1.25rem] border-2 border-line bg-white/70">
            {d.requested.map((c) => (
              <div key={c.city} className="flex items-center justify-between border-b border-line/60 px-4 py-2.5 last:border-b-0">
                <span className="text-[14px] font-semibold">{cityChip(c.city).emoji} {cityChip(c.city).name}</span>
                <span className="rounded-full bg-peach px-2.5 py-0.5 text-[12px] font-bold">{c.people}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">activity · 7 days</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat n={d.activity.dmsWeek} label="dms sent" />
        <Stat n={d.activity.roomWeek} label="room messages" />
        <Stat n={d.activity.unlocks} label="unlocks bought" />
      </div>

      <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">newest members</p>
      <div className="mt-2 overflow-hidden rounded-[1.25rem] border-2 border-line bg-white/70">
        {d.recent.map((m) => (
          <div key={m.memberNo} className="flex items-center gap-2 border-b border-line/60 px-4 py-2.5 last:border-b-0">
            <span className="w-9 shrink-0 font-mono text-[11px] text-ink-soft">{m.memberNo}</span>
            <a
              href={`https://instagram.com/${String(m.ig).replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate text-[14px] font-semibold underline-offset-2 hover:underline"
            >
              {m.ig}
            </a>
            {m.followers ? <span className="shrink-0 text-[11px] text-ink-soft">{m.followers.toLocaleString()}</span> : null}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${m.hasDates ? "bg-lime" : "bg-cream-deep text-ink-soft"}`}>
              {m.hasDates ? "dates" : "silent"}
            </span>
            <a
              href={`/?screen=app&t=${token}&dm=${m.memberNo}`}
              className="shrink-0 rounded-full border-2 border-line px-2.5 py-0.5 text-[10px] font-bold text-ink-soft"
            >
              dm
            </a>
          </div>
        ))}
      </div>

      {d.upcoming.length > 0 && (
        <>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">next trips</p>
          <div className="mt-2 overflow-hidden rounded-[1.25rem] border-2 border-line bg-white/70">
            {d.upcoming.map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-2 border-b border-line/60 px-4 py-2.5 last:border-b-0">
                <span className="truncate text-[14px] font-semibold">{cityChip(t.city).emoji} {cityChip(t.city).name}</span>
                <span className="shrink-0 text-[12px] text-ink-soft">{fmtDay(t.starts)} – {fmtDay(t.ends)} · {t.who}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
