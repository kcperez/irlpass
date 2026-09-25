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
