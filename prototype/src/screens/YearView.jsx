import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { CircleNotch, LockSimple } from "@phosphor-icons/react"
import { cityChip } from "../lib/cities"
import { t } from "../lib/i18n"

// A year of a city, so you can move your trip to where the people are.
const iso = (d) => d.toISOString().slice(0, 10)
const todayIso = () => iso(new Date())
const addDays = (isoDate, n) => {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}
const fmt = (isoDate) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const monthLabel = (isoDate) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })

// twelve months of day cells, aligned to weekday columns
function buildMonths(from) {
  const months = []
  const start = new Date(`${from}T00:00:00Z`)
  for (let m = 0; m < 12; m++) {
    const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1))
    const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
    const pad = (first.getUTCDay() + 6) % 7 // monday-first
    months.push({
      key: iso(first),
      label: monthLabel(iso(first)),
      pad,
      days: Array.from({ length: days }, (_, i) => iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1)))),
    })
  }
  return months
}

export default function YearView({ token, city, onPosted }) {
  const [data, setData] = useState(null)
  const [a, setA] = useState(null) // range start
  const [b, setB] = useState(null) // range end
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const load = useCallback(() => {
    fetch(`/api/calendar?t=${token}&city=${city}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ days: {}, mine: {} }))
  }, [token, city])
  useEffect(() => { load() }, [load])

  const months = useMemo(() => buildMonths(todayIso()), [])
  const peak = useMemo(() => Math.max(1, ...Object.values(data?.days || { x: 1 })), [data])

  // who's actually there on the picked days, so picking dates shows people
  // first and posting is the next step, never the only one
  const [who, setWho] = useState(null)
  useEffect(() => {
    if (!a) { setWho(null); return }
    let alive = true
    setWho("loading")
    fetch(`/api/overlap?t=${token}&city=${city}&starts=${a}&ends=${b || a}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setWho(d) })
      .catch(() => { if (alive) setWho({ people: [], count: 0 }) })
    return () => { alive = false }
  }, [token, city, a, b])

  const pick = (day) => {
    if (day < todayIso()) return
    if (!a || (a && b)) { setA(day); setB(null); return }
    if (day < a) { setA(day); return }
    setB(day)
  }

  const inRange = (day) => a && b && day >= a && day <= b
  const shade = (n) => {
    if (!n) return "bg-cream-deep"
    const step = n / peak
    if (step > 0.66) return "bg-lime-deep"
    if (step > 0.33) return "bg-lime"
    return "bg-lime/50"
  }

  const post = async () => {
    setBusy(true)
    setErr("")
    try {
      const r = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, city, starts: a, ends: b || a }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "could not save those dates")
      setA(null); setB(null)
      load()
      onPosted?.()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return <div className="flex justify-center py-12"><CircleNotch size={22} className="animate-spin text-ink-soft" /></div>
  }

  return (
    <div className="pb-4">
      {data.busiest?.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {data.busiest.map((x) => (
            <button
              key={x.day}
              onClick={() => { setA(x.day); setB(addDays(x.day, 6)) }}
              className="rounded-full border-2 border-line bg-white/70 px-3 py-1.5 text-[12px] font-bold"
            >
              {fmt(x.day)} · {x.people} {x.people === 1 ? t("person") : t("people")}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {months.map((m) => (
          <div key={m.key}>
            <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-soft">{m.label}</p>
            <div className="grid grid-cols-7 gap-[2px]">
              {Array.from({ length: m.pad }).map((_, i) => <span key={`p${i}`} />)}
              {m.days.map((day) => {
                const n = data.days?.[day] || 0
                const isMine = !!data.mine?.[day]
                const past = day < todayIso()
                return (
                  <button
                    key={day}
                    onClick={() => pick(day)}
                    title={`${fmt(day)} · ${n} ${n === 1 ? "person" : "people"}`}
                    className={`aspect-square rounded-[3px] ${past ? "bg-cream-deep/40" : shade(n)} ${
                      inRange(day) || day === a ? "ring-2 ring-ink" : ""
                    } ${isMine ? "ring-1 ring-ink/40" : ""}`}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-soft">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-cream-deep" /> {t("nobody")}</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-lime/50" /> {t("a few")}</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-[3px] bg-lime-deep" /> {t("busy")}</span>
      </div>

      {a && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 rounded-[1.4rem] border-2 border-ink bg-lime px-4 py-3">
          <p className="text-[14px] font-bold">
            {cityChip(city).name} · {fmt(a)}{b ? ` – ${fmt(b)}` : ""}
          </p>

          {who === "loading" || !who ? (
            <p className="mt-1 text-[13px] font-semibold text-ink/70">{t("checking who's there…")}</p>
          ) : who.count === 0 ? (
            <p className="mt-1 text-[13px] font-semibold text-ink/70">
              {t("nobody's posted these days yet. post yours and you're the first face people see.")}
            </p>
          ) : (
            <>
              <p className="mt-1 text-[13px] font-semibold">
                <span className="display text-[20px] font-bold">{who.count}</span>{" "}
                {who.count === 1 ? t("person is there then") : t("people are there then")}
                {who.women > 0 && <span className="text-ink/70"> · {who.women} {who.women === 1 ? t("woman") : t("women")}</span>}
              </p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {who.people.slice(0, 12).map((p) => (
                  <div key={p.memberNo} className="flex w-14 shrink-0 flex-col items-center gap-1">
                    <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-ink/20 bg-cream-deep">
                      {p.photo ? (
                        <img src={p.photo} alt="" className={`h-full w-full object-cover ${p.locked ? "scale-105 blur-[2.5px]" : ""}`} />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[18px] font-bold text-ink-soft">
                          {String(p.first || "?")[0].toUpperCase()}
                        </span>
                      )}
                      {p.locked && (
                        <span className="absolute bottom-0.5 right-0.5 rounded-full bg-ink/70 p-0.5">
                          <LockSimple size={9} weight="fill" className="text-cream" />
                        </span>
                      )}
                    </div>
                    <span className="w-full truncate text-center text-[10.5px] font-bold">{p.locked ? p.first : p.name || p.first}</span>
                  </div>
                ))}
                {who.count > 12 && (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-cream">
                    +{who.count - 12}
                  </span>
                )}
              </div>
            </>
          )}
          {!b && <p className="mt-1 text-[11.5px] font-semibold text-ink/60">{t("tap another day to make it a range")}</p>}
          {err && <p className="mt-1 text-[12.5px] font-semibold text-[#8f2b2b]">{err}</p>}
          <div className="mt-2 flex gap-2">
            <button
              onClick={post}
              disabled={busy}
              className="flex-1 rounded-full bg-ink py-2.5 text-[13px] font-bold text-cream disabled:opacity-50"
            >
              {busy ? t("saving…") : who?.count > 0 ? t("post these dates to meet them") : t("post these dates")}
            </button>
            <button onClick={() => { setA(null); setB(null) }} className="rounded-full border-2 border-ink px-4 py-2.5 text-[13px] font-bold">
              {t("clear")}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}
