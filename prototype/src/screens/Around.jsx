import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { CircleNotch, LockSimple, CheckCircle } from "@phosphor-icons/react"
import { t } from "../lib/i18n"

// who is actually around: only people with dates posted. no dates, no listing,
// no dm — there is nothing to meet about yet.

const iso = (d) => d.toISOString().slice(0, 10)
const todayIso = () => iso(new Date())
const addDays = (isoDate, n) => {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}
const fmt = (isoDate) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const dayLetter = (isoDate) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" })

import { cityChip } from "../lib/cities"
import { isMod } from "../lib/mods"

export default function Around({ token, me, onOpenDM, onUnlock }) {
  const [data, setData] = useState(null)
  const [week, setWeek] = useState(0) // which 14-day window we're looking at

  const load = useCallback(() => {
    fetch(`/api/members?t=${token}&city=${me.city}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ people: [], days: {} }))
  }, [token, me.city])
  useEffect(() => { load() }, [load])

  const from = addDays(todayIso(), week * 14)
  const strip = useMemo(() => {
    const out = []
    for (let i = 0; i < 14; i++) {
      const d = addDays(from, i)
      out.push({ d, n: data?.days?.[d] || 0 })
    }
    return out
  }, [data, from])
  const peak = Math.max(1, ...strip.map((s) => s.n))

  const visible = useMemo(() => {
    const to = addDays(from, 13)
    return (data?.people || []).filter((p) => p.starts <= to && p.ends >= from)
  }, [data, from])

  if (!data) {
    return <div className="flex flex-1 items-center justify-center pt-20"><CircleNotch size={24} className="animate-spin text-ink-soft" /></div>
  }

  return (
    <div className="px-5 pb-28 pt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="display text-[30px] font-bold">{cityChip(me.city).name.toLowerCase()}</h2>
        <span className="text-[13px] font-semibold text-ink-soft">
          {data.total} {data.total === 1 ? t("person with dates") : t("people with dates")}
        </span>
      </div>

      {/* two weeks at a glance: taller bar = busier day */}
      <div className="mt-4 rounded-[1.75rem] border-2 border-line bg-white/70 p-4">
        <div className="flex items-end justify-between gap-1">
          {strip.map((s) => (
            <div key={s.d} className="flex flex-1 flex-col items-center gap-1">
              <motion.div
                initial={{ height: 4 }}
                animate={{ height: Math.max(4, Math.round((s.n / peak) * 54)) }}
                transition={{ type: "spring", stiffness: 160, damping: 20 }}
                className={`w-full rounded-full ${s.n ? "bg-lime-deep" : "bg-cream-deep"}`}
              />
              <span className={`text-[9px] font-bold ${s.n ? "text-ink" : "text-ink-soft/50"}`}>{s.n || ""}</span>
              <span className="text-[9px] text-ink-soft/60">{dayLetter(s.d)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => setWeek((w) => Math.max(0, w - 1))}
            disabled={week === 0}
            className="rounded-full border-2 border-line px-3 py-1.5 text-[12px] font-bold disabled:opacity-35"
          >
            ← {t("earlier")}
          </button>
          <span className="text-[12px] font-semibold text-ink-soft">{fmt(from)} – {fmt(addDays(from, 13))}</span>
          <button
            onClick={() => setWeek((w) => w + 1)}
            className="rounded-full border-2 border-line px-3 py-1.5 text-[12px] font-bold"
          >
            {t("later")} →
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-4 rounded-[1.75rem] border-2 border-dashed border-line bg-white/50 px-5 py-7 text-center">
          <img src="/art/icon-people.png" alt="" className="mx-auto h-20 w-20 object-contain" draggable="false" />
          <p className="display mt-1 text-[20px] font-bold">{t("nobody in these two weeks")}</p>
          <p className="mt-1 text-[13px] text-ink-soft">{t("try later dates, or post yours and get told when someone lands.")}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-[1.75rem] border-2 border-line bg-white/70">
          {visible.map((p) => (
            <div key={`${p.memberNo}-${p.starts}`} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-cream-deep">
                {p.photo ? (
                  <img src={p.photo} alt="" className={`h-full w-full object-cover ${p.locked ? "blur-[6px]" : ""}`} />
                ) : (
                  <div className={`flex h-full w-full items-center justify-center font-bold text-ink-soft ${p.locked ? "blur-[5px]" : ""}`}>
                    {(p.name || p.first)[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[15px] font-bold">
                  <span className={p.locked ? "blur-[4px] select-none" : ""}>{p.locked ? `${p.first} ••••` : p.name}</span>
                  {p.verified && <CheckCircle size={15} weight="fill" className="shrink-0 text-lime-deep" />}
                  {isMod(p.memberNo) && (
                    <span className="shrink-0 rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold">{t("co-founder")}</span>
                  )}
                </p>
                <p className="truncate text-[12px] text-ink-soft">
                  {fmt(p.starts)} – {fmt(p.ends)}
                  {p.flexible && ` · ${t("flexible")}`}
                  {p.overlapsMe && ` · ${t("same days as you")}`}
                  {p.note ? ` · ${p.note}` : ""}
                </p>
              </div>
              {p.canMessage ? (
                <button onClick={() => onOpenDM(p)} className="shrink-0 rounded-full bg-ink px-3.5 py-2 text-[12px] font-bold text-cream">
                  {t("say hi")}
                </button>
              ) : (
                <button
                  onClick={() => onUnlock(p)}
                  className="flex shrink-0 items-center gap-1 rounded-full border-2 border-line px-3 py-1.5 text-[12px] font-bold text-ink-soft"
                >
                  <LockSimple size={13} weight="fill" />
                  {p.womenOnly ? t("women only") : t("unlock")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
