import { useCallback, useEffect, useMemo, useState } from "react"
import { CircleNotch, LockSimple, CheckCircle } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { joinVibes } from "../lib/vibes"
import YearView from "./YearView"

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

import { cityChip, searchCities, slugify, CITY_INDEX } from "../lib/cities"
import { isMod } from "../lib/mods"

export default function Around({ token, me, onOpenDM, onUnlock, onNeedDates, viewCity, onViewCity }) {
  const [data, setData] = useState(null)
  const [week, setWeek] = useState(0) // which 14-day window we're looking at
  const [city, setCity] = useState(viewCity || me.city || "medellin")
  const [myCities, setMyCities] = useState([])

  // the city you just posted becomes the city you're looking at
  useEffect(() => {
    if (viewCity && viewCity !== city) { setCity(viewCity); setData(null); setWeek(0) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewCity])

  // your own cities, for one-tap switching
  useEffect(() => {
    fetch(`/api/trips?t=${token}`)
      .then((r) => r.json())
      .then((d) => setMyCities([...new Set((d.trips || []).map((x) => x.city))]))
      .catch(() => {})
  }, [token])
  const [picking, setPicking] = useState(false)
  const [typed, setTyped] = useState("")
  const [view, setView] = useState("weeks") // weeks | year
  const [selectedDay, setSelectedDay] = useState(null)
  const [othersShown, setOthersShown] = useState(24) // the city roster can be hundreds; reveal it a page at a time

  const load = useCallback(() => {
    fetch(`/api/members?t=${token}&city=${city}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ people: [], days: {} }))
  }, [token, city])
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

  // under a handful of people the day chart is just bars of height one, which
  // reads as an empty room. lead with the faces until the city fills up.
  const sparse = (data?.total || 0) < 8

  // here now first, then whoever shares the most vibes with you, then soonest
  const byPresence = (a, b) =>
    (b.hereNow === true) - (a.hereNow === true) ||
    (b.shared?.length || 0) - (a.shared?.length || 0) ||
    (a.starts < b.starts ? -1 : 1)

  // one card per person: someone with two trips in the same window is still one
  // person, so merge their stays into a single span instead of listing them twice
  const dedupe = (list) => {
    const by = new Map()
    for (const p of list) {
      const prev = by.get(p.memberNo)
      if (!prev) { by.set(p.memberNo, { ...p }); continue }
      prev.starts = prev.starts < p.starts ? prev.starts : p.starts
      prev.ends = prev.ends > p.ends ? prev.ends : p.ends
      prev.hereNow = prev.hereNow || p.hereNow
      prev.overlapsMe = prev.overlapsMe || p.overlapsMe
      prev.local = prev.local || p.local
      prev.canMessage = prev.canMessage || p.canMessage
      if ((p.shared?.length || 0) > (prev.shared?.length || 0)) prev.shared = p.shared
    }
    return [...by.values()]
  }

  const visible = useMemo(() => {
    const to = addDays(from, 13)
    const inWindow = (data?.people || []).filter((p) => p.starts <= to && p.ends >= from)
    if (!selectedDay) return dedupe(inWindow).sort(byPresence)
    return dedupe(inWindow.filter((p) => p.starts <= selectedDay && p.ends >= selectedDay)).sort(byPresence)
  }, [data, from, selectedDay])

  if (!data) {
    return <div className="flex flex-1 items-center justify-center pt-20"><CircleNotch size={24} className="animate-spin text-ink-soft" /></div>
  }

  return (
    <div className="px-5 pb-28 pt-4">
      <div className="flex items-baseline justify-between">
        <button onClick={() => setPicking((p) => !p)} className="flex items-baseline gap-1.5">
          <h2 className="display text-[30px] font-bold">{cityChip(city).name.toLowerCase()}</h2>
          <span className="text-[13px] font-bold text-ink-soft">{picking ? "×" : "▾"}</span>
        </button>
        <span className="text-[13px] font-semibold text-ink-soft">
          {data.total} {data.total === 1 ? t("person with dates") : t("people with dates")}
        </span>
      </div>
      <p className="mt-1 text-[14px] text-ink-soft">
        {data.iHaveDates
          ? t("people here on your dates. say hi to join them.")
          : t("post your dates for this city to see who you'd overlap with.")}
      </p>

      {myCities.length > 1 && !picking && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {myCities.map((c) => (
            <button
              key={c}
              onClick={() => { setCity(c); onViewCity?.(c); setWeek(0); setData(null) }}
              className={`rounded-full border-2 px-3 py-1.5 text-[12.5px] font-bold ${
                city === c ? "border-ink bg-lime" : "border-line bg-white/60 text-ink-soft"
              }`}
            >
              {cityChip(c).emoji} {cityChip(c).name}
            </button>
          ))}
        </div>
      )}

      {picking && (
        <div className="mt-3 rounded-[1.5rem] border-2 border-line bg-white/80 p-3">
          <input
            id="around-city"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            placeholder={t("look at another city")}
            className="w-full rounded-[1.1rem] border-2 border-line bg-white px-3 py-2.5 text-[15px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(typed.trim() ? searchCities(typed) : CITY_INDEX.slice(0, 6)).map((c) => (
              <button
                key={c.slug}
                onClick={() => { setCity(c.slug); onViewCity?.(c.slug); setTyped(""); setPicking(false); setWeek(0); setData(null) }}
                className="rounded-full border-2 border-line bg-white px-3 py-1.5 text-[12.5px] font-bold"
              >
                {c.emoji} {c.name}
              </button>
            ))}
            {typed.trim() && searchCities(typed).length === 0 && (
              <button
                onClick={() => {
                  const s = slugify(typed)
                  // a city nobody has opened yet is a request: log it as roadmap data
                  fetch("/api/city-request", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ t: token, city: typed, source: "browse" }),
                  }).catch(() => {})
                  setCity(s); onViewCity?.(s); setTyped(""); setPicking(false); setWeek(0); setData(null)
                }}
                className="rounded-full border-2 border-ink bg-lime px-3 py-1.5 text-[12.5px] font-bold"
              >
                📍 {typed}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 flex gap-1.5">
        {[
          { key: "weeks", label: t("next 2 weeks") },
          { key: "year", label: t("the year") },
        ].map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`rounded-full border-2 px-3.5 py-1.5 text-[12.5px] font-bold ${
              view === v.key ? "border-ink bg-lime" : "border-line bg-white/60 text-ink-soft"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "year" && (
        <div className="mt-3">
          <YearView token={token} city={city} onPosted={load} />
        </div>
      )}

      {view === "weeks" && (<>
      {/* one cell per day: the number is people here that day. tap to filter. */}
      <div className={`mt-3 rounded-[1.75rem] border-2 border-line bg-white/70 p-4 ${sparse ? "hidden" : ""}`}>
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-bold">{t("people here each day")}</p>
          <span className="text-[11.5px] text-ink-soft">{fmt(from)} – {fmt(addDays(from, 13))}</span>
        </div>

        <div className="mt-2.5 grid grid-cols-7 gap-1.5">
          {strip.map((s2) => {
            const on = selectedDay === s2.d
            return (
              <button
                key={s2.d}
                onClick={() => setSelectedDay(on ? null : s2.d)}
                className={`flex flex-col items-center rounded-[0.9rem] border-2 py-1.5 ${
                  on ? "border-ink bg-lime" : s2.n ? "border-line bg-lime/30" : "border-line bg-cream-deep/40"
                }`}
              >
                <span className="text-[9px] font-bold uppercase text-ink-soft">{dayLetter(s2.d)}</span>
                <span className="text-[12px] font-bold leading-tight">{Number(s2.d.slice(8))}</span>
                <span className={`mt-0.5 text-[12px] font-bold ${s2.n ? "" : "text-ink-soft/40"}`}>
                  {s2.n || "·"}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => { setWeek((w) => Math.max(0, w - 1)); setSelectedDay(null) }}
            disabled={week === 0}
            className="rounded-full border-2 border-line px-3 py-1.5 text-[12px] font-bold disabled:opacity-35"
          >
            ← {t("earlier")}
          </button>
          <span className="text-[12px] font-semibold text-ink-soft">
            {selectedDay
              ? `${data.days?.[selectedDay] || 0} ${(data.days?.[selectedDay] || 0) === 1 ? t("person") : t("people")} · ${fmt(selectedDay)}`
              : t("tap a day to see who")}
          </span>
          <button
            onClick={() => { setWeek((w) => w + 1); setSelectedDay(null) }}
            className="rounded-full border-2 border-line px-3 py-1.5 text-[12px] font-bold"
          >
            {t("later")} →
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-4 rounded-[1.75rem] border-2 border-dashed border-line bg-white/50 px-5 py-7 text-center">
          <img src="/art/icon-people.png" alt="" className="mx-auto h-20 w-20 object-contain" draggable="false" />
          <p className="display mt-1 text-[20px] font-bold">
            {selectedDay ? `${t("nobody on")} ${fmt(selectedDay)}` : t("nobody in these two weeks")}
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">{t("try later dates, or post yours and get told when someone lands.")}</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {visible.map((p) => (
            <div key={`${p.memberNo}-${p.starts}`} className="overflow-hidden rounded-[1.5rem] border-2 border-line bg-white/80">
              <div className="relative aspect-[4/5] w-full overflow-hidden bg-cream-deep">
                {p.photo ? (
                  <img
                    src={p.photo}
                    alt=""
                    loading="lazy"
                    className={`h-full w-full object-cover ${p.locked ? "scale-110 blur-[10px]" : ""}`}
                  />
                ) : (
                  <div className={`display flex h-full w-full items-center justify-center text-[44px] font-bold text-ink-soft/40 ${p.locked ? "blur-[8px]" : ""}`}>
                    {(p.name || p.first)[0]?.toUpperCase()}
                  </div>
                )}

                {/* one badge, not three: three wrap and clip on a half-width card */}
                <div className="absolute left-2 top-2 flex gap-1">
                  {p.hereNow && !p.local && (
                    <span className="flex items-center gap-1 rounded-full bg-[#e8f6e8] px-2 py-0.5 text-[10px] font-bold text-[#2f7a2f]">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#5fd35f] opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#5fd35f]" />
                      </span>
                      {t("here now")}
                    </span>
                  )}
                  {p.local && <span className="rounded-full bg-peach px-2 py-0.5 text-[10px] font-bold">{t("local")}</span>}
                  {isMod(p.memberNo) && !p.hereNow && !p.local && (
                    <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold">{t("founder")}</span>
                  )}
                </div>

                {p.overlapsMe && (
                  <span className="absolute right-2 top-2 rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold">
                    {t("same days")}
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2.5 pb-2 pt-8 text-cream">
                  <p className="flex items-center gap-1 text-[14.5px] font-bold leading-tight">
                    <span className={`truncate ${p.locked ? "select-none blur-[4px]" : ""}`}>
                      {p.locked ? `${p.first} ••••` : p.name}
                    </span>
                    {p.verified && <CheckCircle size={14} weight="fill" className="shrink-0 text-lime" />}
                  </p>
                  <p className="truncate text-[11px] font-semibold text-cream/75">
                    {p.local ? t("lives here") : `${fmt(p.starts)} – ${fmt(p.ends)}`}
                    {p.flexible && !p.local ? ` · ${t("flexible")}` : ""}
                  </p>
                </div>
              </div>

              {p.shared?.length > 0 && (
                <p className="mx-2 mt-2 truncate rounded-full bg-lime px-2 py-0.5 text-center text-[10.5px] font-bold">
                  {t("both into")} {joinVibes(p.shared)}
                </p>
              )}

              <div className="p-2">
                {p.canMessage ? (
                  <button
                    onClick={() => onOpenDM(p)}
                    className="w-full rounded-full bg-ink py-2 text-[12.5px] font-bold text-cream"
                  >
                    {t("say hi")}
                  </button>
                ) : p.womenOnly ? (
                  <span className="flex justify-center py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-ink-soft/60">
                    {t("women only")}
                  </span>
                ) : !data.iHaveDates ? (
                  <button
                    onClick={() => onNeedDates?.(city)}
                    className="w-full rounded-full bg-lime py-2 text-[12.5px] font-bold"
                  >
                    {t("post your dates")}
                  </button>
                ) : (
                  <button
                    onClick={() => onUnlock(p)}
                    className="flex w-full items-center justify-center gap-1 rounded-full border-2 border-line py-1.5 text-[12.5px] font-bold text-ink-soft"
                  >
                    <LockSimple size={13} weight="fill" />
                    {t("unlock")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </>)}

      {data.others?.length > 0 && (
        <>
          <div className="mt-6 flex items-baseline justify-between">
            <h3 className="display text-[19px] font-bold">
              {t("also in")} {cityChip(city).name.toLowerCase()}
            </h3>
            <span className="text-[12px] text-ink-soft">{data.others.length}</span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-soft">{t("here, but no dates up yet")}</p>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {data.others.slice(0, othersShown).map((p) => (
              <button
                key={p.memberNo}
                onClick={() => p.canMessage && onOpenDM(p)}
                className="flex flex-col items-center gap-1"
              >
                <div className="aspect-square w-full overflow-hidden rounded-[1rem] bg-cream-deep">
                  {p.photo ? (
                    <img src={p.photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="display flex h-full w-full items-center justify-center text-[20px] font-bold text-ink-soft/40">
                      {(p.name || p.first)[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="w-full truncate text-center text-[11px] font-semibold">{p.name || p.first}</span>
              </button>
            ))}
          </div>
          {data.others.length > othersShown && (
            <button
              onClick={() => setOthersShown((n) => n + 24)}
              className="mt-3 w-full rounded-full border-2 border-line bg-white/70 py-2.5 text-[13px] font-bold"
            >
              {t("show more")} · {data.others.length - othersShown}
            </button>
          )}
        </>
      )}
    </div>
  )
}
