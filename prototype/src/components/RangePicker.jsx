import { useMemo, useState } from "react"
import { CaretLeft, CaretRight } from "@phosphor-icons/react"
import { t } from "../lib/i18n"

// Our own date range picker. The native one showed MM/DD/YYYY to an audience
// that reads DD/MM, and it dropped an OS calendar glyph into a rounded app.

// the week starts where the reader's calendar starts: sunday in the US (most of
// our members), monday across latam and europe. 0 = sunday, 1 = monday.
const WEEK_START = (() => {
  try {
    const lang = navigator.language || "en-US"
    const loc = new Intl.Locale(lang)
    const info = loc.getWeekInfo?.() || loc.weekInfo
    if (info?.firstDay) return info.firstDay % 7
    // no region on the locale: english readers get sunday, everyone else monday
    return /^en(-US|-CA)?$/i.test(lang) || /-US$/i.test(lang) ? 0 : 1
  } catch {
    return 0
  }
})()

const iso = (d) => d.toISOString().slice(0, 10)
const todayIso = () => iso(new Date())
const monthOf = (isoDate) => isoDate.slice(0, 7)
const fmt = (isoDate) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })

function buildMonth(ym) {
  const [y, m] = ym.split("-").map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const pad = (first.getUTCDay() - WEEK_START + 7) % 7
  return {
    label: first.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }),
    pad,
    days: Array.from({ length: days }, (_, i) => iso(new Date(Date.UTC(y, m - 1, i + 1)))),
  }
}
const shiftMonth = (ym, n) => {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return iso(d).slice(0, 7)
}

export default function RangePicker({ starts, ends, onChange, busyDays = {} }) {
  const [ym, setYm] = useState(monthOf(starts || todayIso()))
  const month = useMemo(() => buildMonth(ym), [ym])
  const today = todayIso()

  const pick = (day) => {
    if (day < today) return
    // first tap sets the arrival, second sets the departure
    if (!starts || (starts && ends)) return onChange({ starts: day, ends: null })
    if (day < starts) return onChange({ starts: day, ends: null })
    onChange({ starts, ends: day })
  }

  const weekdays = useMemo(() => {
    // 2023-12-31 was a sunday, so day 0 + WEEK_START lands on the first column
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(Date.UTC(2023, 11, 31 + WEEK_START + i))
      return { d: day.toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" }), key: i }
    })
  }, [])

  return (
    <div className="rounded-[1.4rem] border-2 border-line bg-white/80 p-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setYm(shiftMonth(ym, -1))}
          disabled={ym <= monthOf(today)}
          aria-label={t("earlier")}
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-line disabled:opacity-30"
        >
          <CaretLeft size={14} weight="bold" />
        </button>
        <p className="text-[14px] font-bold lowercase">{month.label}</p>
        <button
          onClick={() => setYm(shiftMonth(ym, 1))}
          aria-label={t("later")}
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-line"
        >
          <CaretRight size={14} weight="bold" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {weekdays.map((w) => (
          <span key={w.key} className="text-[10px] font-bold uppercase text-ink-soft">{w.d}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: month.pad }).map((_, i) => <span key={`pad-${i}`} />)}
        {month.days.map((day) => {
          const past = day < today
          const isStart = day === starts
          const isEnd = day === ends
          const between = starts && ends && day > starts && day < ends
          const busy = busyDays[day] || 0
          return (
            <button
              key={day}
              onClick={() => pick(day)}
              disabled={past}
              className={`relative flex aspect-square items-center justify-center rounded-[0.7rem] text-[13px] font-bold transition-colors ${
                isStart || isEnd
                  ? "bg-ink text-cream"
                  : between
                    ? "bg-lime"
                    : past
                      ? "text-ink-soft/25"
                      : busy
                        ? "bg-lime/30"
                        : "hover:bg-cream-deep"
              }`}
            >
              {Number(day.slice(8))}
              {busy > 0 && !isStart && !isEnd && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-lime-deep" />
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-2 text-center text-[12.5px] font-semibold text-ink-soft">
        {starts && ends
          ? `${fmt(starts)} → ${fmt(ends)}`
          : starts
            ? `${fmt(starts)} → ${t("pick your last day")}`
            : t("pick your first day")}
      </p>
    </div>
  )
}
