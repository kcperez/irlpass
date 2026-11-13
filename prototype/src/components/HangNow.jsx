import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { HandWaving, MapPin, X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { askPush } from "../lib/push"
import { cityChip } from "../lib/cities"

// the spontaneous part of irlpass (it used to live on the mood tab): say you're
// down to hang for 3 hours, or that you're out in a neighborhood right now.
// sits at the top of people, next to the faces it's about.
function Face({ p, size = "h-11 w-11" }) {
  return (
    <span className={`relative block ${size} shrink-0 overflow-hidden rounded-full border border-line bg-cream-deep`}>
      {p.photo && <img src={p.photo} alt="" onError={(e) => { e.currentTarget.style.display = "none" }} className={`h-full w-full object-cover ${p.locked && !p.faceOpen ? "scale-105 blur-[2px]" : ""}`} />}
    </span>
  )
}

export default function HangNow({ token, city }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [outOpen, setOutOpen] = useState(false)
  const [area, setArea] = useState("")
  const [until, setUntil] = useState("late")
  const load = useCallback(() => {
    fetch(`/api/mood?t=${token}&city=${city}`).then((r) => r.json()).then(setData).catch(() => {})
  }, [token, city])
  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 30000); return () => clearInterval(id) }, [load])
  const post = (body) =>
    fetch("/api/mood", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, city, ...body }) }).then((r) => r.json()).catch(() => null)

  if (!data) return null
  const down = (data.down || []).filter((p) => !p.me)
  const out = (data.presence || []).filter((p) => !p.me)
  const outEnds = data.myOut ? new Date(data.myOut.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase() : null
  const cityName = String(data.cityName || cityChip(city).name || "").toLowerCase()

  const toggleDown = async () => {
    setBusy(true)
    await post({ action: "down", on: !data.myDown, mood: "chill" })
    if (!data.myDown) setTimeout(() => askPush(t("people who are down to hang")), 500)
    await load()
    setBusy(false)
  }
  const goOut = async () => {
    if (!area.trim()) return
    setBusy(true)
    await post({ action: "out", area, until })
    setOutOpen(false)
    setArea("")
    await load()
    setBusy(false)
  }

  return (
    <div className="mb-4 rounded-[1.5rem] border border-line bg-white/70 p-3">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${data.myDown ? "bg-lime" : "bg-cream-deep"}`}><HandWaving size={18} weight="fill" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-tight">{data.myDown ? t("you're down to hang") : t("down to hang now?")}</p>
          <p className="truncate text-[12px] text-ink-soft">
            {data.myDown
              ? `${t("until")} ${new Date(data.myDown).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()} · ${down.length ? `${down.length} ${t("others too")}` : t("we'll tell whoever's down next")}`
              : down.length ? `${down.slice(0, 2).map((p) => p.first).join(", ")}${down.length > 2 ? ` +${down.length - 2}` : ""} ${t("down right now")}` : t("for 3 hours. people here who are down get a ping")}
          </p>
        </div>
        <button onClick={toggleDown} disabled={busy} role="switch" aria-checked={!!data.myDown} aria-label={t("down to hang")}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${data.myDown ? "bg-lime" : "bg-line"}`}>
          <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 34 }} className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${data.myDown ? "right-0.5" : "left-0.5"}`} />
        </button>
      </div>
      {down.length > 0 && (
        <div className="mt-3 flex gap-3 overflow-x-auto [scrollbar-width:none]">
          {down.map((p) => (
            <div key={p.memberNo} className="flex w-14 shrink-0 flex-col items-center gap-1 text-center">
              <Face p={p} />
              <span className="w-full truncate text-[11px] font-bold">{p.first}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 border-t border-line/70 pt-3">
        {data.myOut ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-bold"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-lime align-middle" />{t("you're out in")} {data.myOut.area} · {t("until")} {outEnds}</p>
            <button onClick={async () => { await post({ action: "out", off: true }); load() }} className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] font-bold text-ink-soft">{t("stop")}</button>
          </div>
        ) : outOpen ? (
          <>
            <div className="flex gap-2">
              <input name="out-area" autoComplete="off" data-1p-ignore data-lpignore="true" value={area} onChange={(e) => setArea(e.target.value)} onKeyDown={(e) => e.key === "Enter" && goOut()} autoFocus maxLength={40}
                placeholder={t("which neighborhood?")} className="w-full rounded-full border border-line bg-white px-3.5 py-2 text-[14px] font-semibold outline-none" />
              <button onClick={goOut} disabled={busy} className="shrink-0 rounded-full bg-ink px-4 text-[13px] font-bold text-cream disabled:opacity-50">{t("go")}</button>
              <button onClick={() => setOutOpen(false)} aria-label={t("close")} className="shrink-0 text-ink-soft"><X size={18} /></button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {[["9pm", t("til 9pm")], ["midnight", t("til midnight")], ["late", t("all night")]].map(([k, label]) => (
                <button key={k} onClick={() => setUntil(k)} className={`rounded-full border px-3 py-1 text-[12px] font-bold ${until === k ? "border-transparent bg-ink text-cream" : "border-line bg-white text-ink-soft"}`}>{label}</button>
              ))}
              <span className="w-full pt-0.5 text-[11.5px] text-ink-soft">{t("visible to")} {cityName} {t("members, and posted once in the")} {cityName} {t("chat")}</span>
            </div>
          </>
        ) : (
          <button onClick={() => setOutOpen(true)} className="flex w-full items-center justify-center gap-2 text-[14px] font-bold">
            <MapPin size={17} weight="fill" /> {t("i'm out now, come find me")}
          </button>
        )}
        {out.length > 0 && (
          <div className="mt-3 flex gap-3 overflow-x-auto border-t border-line/70 pt-3">
            {out.map((p) => (
              <div key={p.memberNo} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
                <Face p={p} size="h-12 w-12" />
                <span className="w-full truncate text-[11px] font-bold">{p.first}</span>
                <span className="w-full truncate text-[10px] text-ink-soft">📍 {p.area}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
