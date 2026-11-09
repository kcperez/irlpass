import { useEffect, useRef, useState } from "react"
import { Logo } from "../components/bits"

// irlpass.xyz/traction — a shareable numbers page (aggregates only, see api/traction.js)
const fmt = (n) => (n ?? 0).toLocaleString("en-US")
const day = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const card = "rounded-[22px] border border-line bg-white/70 shadow-[0_1px_2px_rgba(58,50,44,0.05),0_14px_34px_-18px_rgba(58,50,44,0.25)]"

export default function Traction() {
  const [s, setS] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    document.title = "irlpass · traction"
    fetch("/api/traction").then((r) => (r.ok ? r.json() : Promise.reject())).then(setS).catch(() => setErr(true))
  }, [])

  const peak = s?.weekly?.reduce((a, b) => (b.added > a.added ? b : a), s.weekly[0])
  const asOf = s ? new Date(s.at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""

  return (
    <div className="mx-auto max-w-[980px] px-5 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))] lg:px-10 lg:pt-10">
      <header className="flex items-center justify-between">
        <a href="/?home=1"><Logo size="text-[22px] lg:text-[26px]" /></a>
        <span className="rounded-full border border-line bg-white/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
          live · {asOf || "loading"}
        </span>
      </header>

      <section className="mt-10 lg:mt-14">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft">traction</p>
        <h1 className="display mt-3 max-w-[18ch] text-[40px] leading-[1.02] lg:text-[64px]">
          {s ? <>{fmt(s.members)} members in {s.countries} countries.</> : err ? "numbers unavailable right now." : "counting…"}
        </h1>
        <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-ink-soft">
          irlpass helps travelers and locals meet up in real life. every member came in organically through creator-led short-form
          content on tiktok and instagram, with zero paid ads.
          {peak ? <> the biggest week added <b className="text-ink">{fmt(peak.added)}</b> members (week of {day(peak.week)}).</> : null}
        </p>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi label="members" value={s?.members} sub="since the june 2026 launch" tone="bg-lime" />
        <Kpi label="trips posted" value={s?.trips} sub={s ? `by ${fmt(s.tripPosters)} members` : ""} tone="bg-peach" />
        <Kpi label="chat messages" value={s?.messages} sub={s ? `from ${fmt(s.chatters)} members` : ""} />
        <Kpi label="creators" value={s?.creators} sub="members with 1k+ ig followers" />
      </section>

      <section className={`mt-6 p-5 lg:p-7 ${card}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-[22px] lg:text-[26px]">member growth</h2>
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
            <span className="flex items-center gap-1.5"><i className="inline-block h-[3px] w-4 rounded bg-plum" />total</span>
            <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-lime-deep" />new per week</span>
          </div>
        </div>
        <Growth weekly={s?.weekly || []} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={`p-5 lg:p-7 ${card}`}>
          <h2 className="display text-[22px]">top cities</h2>
          <Bars rows={(s?.topCities || []).map((c) => ({ k: c.city, n: c.n }))} />
          {s ? <p className="mt-4 text-[13px] text-ink-soft">members call {fmt(s.cities)} cities home.</p> : null}
        </section>
        <section className={`p-5 lg:p-7 ${card}`}>
          <h2 className="display text-[22px]">top countries</h2>
          <Bars rows={(s?.topCountries || []).map((c) => ({ k: c.country, n: c.n }))} peach />
          <p className="mt-4 text-[13px] text-ink-soft">countries members set on their profile.</p>
        </section>
      </div>

      <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
        live from the irlpass database · staff and test accounts excluded · no personal data on this page
      </p>
    </div>
  )
}

function Kpi({ label, value, sub, tone = "bg-white/70" }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-[22px] border border-line p-4 lg:p-5 ${tone}`}>
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/60">{label}</span>
      <span className="display text-[34px] leading-none tabular-nums lg:text-[44px]">{value == null ? "—" : fmt(value)}</span>
      <span className="text-[12px] text-ink/60">{sub}</span>
    </div>
  )
}

function Growth({ weekly }) {
  const ref = useRef(null)
  const [w, setW] = useState(640)
  const [hover, setHover] = useState(null)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  const H = 260, m = { t: 14, r: 40, b: 26, l: 30 }
  const n = weekly.length
  const maxAdd = Math.max(1, ...weekly.map((d) => d.added))
  const maxTot = Math.max(1, ...weekly.map((d) => d.total))
  const niceAdd = Math.ceil(maxAdd / 25) * 25
  const niceTot = Math.ceil(maxTot / 100) * 100
  const step = n ? (w - m.l - m.r) / n : 0
  const bw = step * 0.62
  const xc = (i) => m.l + step * i + step / 2
  const yA = (v) => H - m.b - (v / niceAdd) * (H - m.t - m.b)
  const yT = (v) => H - m.b - (v / niceTot) * (H - m.t - m.b)
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((w - m.l - m.r) / 64))))
  const line = weekly.map((d, i) => `${i ? "L" : "M"}${xc(i)},${yT(d.total)}`).join("")
  const h = hover != null ? weekly[hover] : null

  return (
    <div ref={ref} className="relative mt-4 min-h-[260px]">
      {n ? (
        <svg width="100%" viewBox={`0 0 ${w} ${H}`} role="img" aria-label="irlpass members over time, with new members per week">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={m.l} x2={w - m.r} y1={yA(niceAdd * f)} y2={yA(niceAdd * f)} stroke="var(--color-line)" />
              <text x={m.l - 6} y={yA(niceAdd * f)} dy="0.35em" textAnchor="end" className="fill-ink-soft font-mono text-[10px]">{Math.round(niceAdd * f)}</text>
              <text x={w - m.r + 6} y={yT(niceTot * f)} dy="0.35em" className="fill-ink-soft font-mono text-[10px]">{Math.round(niceTot * f)}</text>
            </g>
          ))}
          {weekly.map((d, i) => (
            <rect key={d.week} x={xc(i) - bw / 2} width={bw} y={yA(d.added)} height={yA(0) - yA(d.added)} rx={3}
              fill={hover === i ? "var(--color-plum)" : "var(--color-lime-deep)"} opacity={hover === i ? 0.55 : 1} />
          ))}
          <path d={line} fill="none" stroke="var(--color-plum)" strokeWidth={2.5} strokeLinejoin="round" />
          <circle cx={xc(n - 1)} cy={yT(weekly[n - 1].total)} r={4.5} fill="var(--color-plum)" />
          {weekly.map((d, i) => (i % every === 0 ? (
            <text key={"x" + d.week} x={xc(i)} y={H - 6} textAnchor="middle" className="fill-ink-soft font-mono text-[10px]">{day(d.week)}</text>
          ) : null))}
          {weekly.map((d, i) => (
            <rect key={"h" + d.week} x={m.l + step * i} width={step} y={m.t} height={H - m.t - m.b} fill="transparent"
              onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />
          ))}
        </svg>
      ) : <div className="h-[260px] animate-pulse rounded-2xl bg-cream-deep" />}
      {h ? (
        <div className="pointer-events-none absolute top-0 rounded-xl border border-line bg-white px-3 py-2 text-[12px] shadow-lg"
          style={{ left: Math.min(Math.max(0, xc(hover) / w * 100), 70) + "%" }}>
          <div className="font-medium">week of {day(h.week)}</div>
          <div className="text-ink-soft">+{fmt(h.added)} new · {fmt(h.total)} total</div>
        </div>
      ) : null}
    </div>
  )
}

function Bars({ rows, peach }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  if (!rows.length) return <div className="mt-4 h-40 animate-pulse rounded-2xl bg-cream-deep" />
  return (
    <ul className="mt-4 flex flex-col gap-2">
      {rows.map((r, i) => (
        <li key={r.k} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate">{r.k}</span>
          <span className="h-3 overflow-hidden rounded-full bg-cream-deep">
            <span className={`block h-full rounded-full ${i === 0 ? "bg-plum" : peach ? "bg-peach" : "bg-lime-deep"}`} style={{ width: `${Math.max(3, (r.n / max) * 100)}%` }} />
          </span>
          <span className="font-mono tabular-nums text-ink-soft">{fmt(r.n)}</span>
        </li>
      ))}
    </ul>
  )
}
