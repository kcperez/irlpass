import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ChatsCircle, CheckCircle, CircleNotch, LockSimple, MapPin, X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { joinVibes } from "../lib/vibes"

// tonight in medellín: pick a mood, see the hand-picked spots for it, say
// you're going, and see who else from irlpass is. vibes are who you are;
// mood is just tonight, and it resets every day.
const MOODS = [
  { key: "pregame", emoji: "🍸", label: "pregame", sub: "rooftops, bars, dinner" },
  { key: "afters", emoji: "🪩", label: "afters", sub: "clubs, late" },
  { key: "chill", emoji: "☕", label: "something chill", sub: "coffee, gym, a walk" },
]

function Face({ p, size = "h-9 w-9" }) {
  return (
    <div className={`relative ${size} shrink-0 overflow-hidden rounded-full border-2 border-cream bg-cream-deep`}>
      {p.photo ? (
        <img
          src={p.photo}
          alt=""
          onError={(e) => { e.currentTarget.style.display = "none" }}
          className={`h-full w-full object-cover ${p.locked ? "scale-105 blur-[2px]" : ""}`}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[12px] font-bold text-ink-soft">
          {String(p.first || "?")[0].toUpperCase()}
        </span>
      )}
    </div>
  )
}

export default function Mood({ token, me, onOpenRoom }) {
  const [data, setData] = useState(null)
  const [mood, setMood] = useState(null)
  const [filter, setFilter] = useState("all") // chill only: all | recovery
  const [outOpen, setOutOpen] = useState(false)
  const [area, setArea] = useState("")
  const [busy, setBusy] = useState(null)

  const load = useCallback(() => {
    fetch(`/api/mood?t=${token}&city=medellin`)
      .then((r) => r.json())
      .then((d) => { setData(d); setMood((m) => m || d.mood) })
      .catch(() => setData({ board: {}, presence: [] }))
  }, [token])
  useEffect(() => { load() }, [load])
  // the board is live on a night out: refresh every half minute
  useEffect(() => { const id = setInterval(load, 30000); return () => clearInterval(id) }, [load])

  const post = (body) =>
    fetch("/api/mood", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, ...body }),
    }).then((r) => r.json()).catch(() => null)

  const pickMood = async (key) => {
    setMood(key)
    setFilter("all")
    await post({ action: "mood", mood: key })
  }

  const toggleGoing = async (spot) => {
    setBusy(spot.id)
    await post({ action: "going", spotId: spot.id, on: !spot.imGoing })
    await load()
    setBusy(null)
  }

  const goOut = async () => {
    if (!area.trim()) return
    setBusy("out")
    await post({ action: "out", area })
    setOutOpen(false)
    setArea("")
    await load()
    setBusy(null)
  }

  if (!data) {
    return <div className="flex flex-1 items-center justify-center py-16"><CircleNotch size={24} className="animate-spin text-ink-soft" /></div>
  }

  const spots = (data.board?.[mood] || []).filter((s) => filter === "all" || s.tag === filter)
  const others = (data.presence || []).filter((p) => !p.me)
  const until = data.myOut ? new Date(data.myOut.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null

  return (
    <div className="px-4 pb-28 pt-3">
      <h2 className="display text-[28px] font-bold leading-tight">{t("tonight in medellín")}</h2>
      <p className="text-[13px] text-ink-soft">{t("pick your mood. it resets tomorrow.")}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {MOODS.map((m) => (
          <motion.button
            key={m.key}
            whileTap={{ scale: 0.95 }}
            onClick={() => pickMood(m.key)}
            className={`flex flex-col items-center gap-0.5 rounded-[1.3rem] border-2 px-2 py-3 text-center ${
              mood === m.key ? "border-ink bg-lime" : "border-line bg-white/70"
            }`}
          >
            <span className="text-[26px] leading-none">{m.emoji}</span>
            <span className="text-[13px] font-bold leading-tight">{t(m.label)}</span>
            <span className="text-[10.5px] leading-tight text-ink-soft">{t(m.sub)}</span>
          </motion.button>
        ))}
      </div>

      {/* who's out right now: neighborhood only, gone after a few hours */}
      <div className="mt-4 rounded-[1.5rem] border-2 border-line bg-white/70 p-3.5">
        {data.myOut ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13.5px] font-bold">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#5fd35f] align-middle" />
              {t("you're out in")} {data.myOut.area} · {t("until")} {until}
            </p>
            <button
              onClick={async () => { await post({ action: "out", off: true }); load() }}
              className="shrink-0 rounded-full border-2 border-line px-3 py-1 text-[12px] font-bold text-ink-soft"
            >
              {t("stop")}
            </button>
          </div>
        ) : outOpen ? (
          <div className="flex gap-2">
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && goOut()}
              autoFocus
              maxLength={40}
              placeholder={t("neighborhood, like provenza")}
              className="w-full rounded-full border-2 border-line bg-white px-3.5 py-2 text-[14px] font-semibold outline-none focus:border-ink"
            />
            <button onClick={goOut} disabled={busy === "out"} className="shrink-0 rounded-full bg-ink px-4 text-[13px] font-bold text-cream disabled:opacity-50">
              {t("go")}
            </button>
            <button onClick={() => setOutOpen(false)} aria-label={t("close")} className="shrink-0 text-ink-soft"><X size={18} /></button>
          </div>
        ) : (
          <button onClick={() => setOutOpen(true)} className="flex w-full items-center justify-center gap-2 text-[14px] font-bold">
            <MapPin size={17} weight="fill" /> {t("i'm out tonight, come find me")}
          </button>
        )}

        {others.length > 0 && (
          <div className="mt-3 flex gap-3 overflow-x-auto border-t border-line/70 pt-3">
            {others.map((p) => (
              <div key={p.memberNo} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
                <Face p={p} size="h-12 w-12" />
                <span className="w-full truncate text-[11px] font-bold">{p.first}</span>
                <span className="w-full truncate text-[10px] text-ink-soft">📍 {p.area}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!mood ? (
        <p className="mt-6 text-center text-[13.5px] font-semibold text-ink-soft">{t("pick a mood to see tonight's spots")}</p>
      ) : (
        <>
          {mood === "chill" && (
            <div className="mt-4 flex gap-2">
              {[["all", t("everything")], ["recovery", `🧘 ${t("recovery")}`]].map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={`rounded-full border-2 px-3.5 py-1.5 text-[12.5px] font-bold ${filter === k ? "border-ink bg-lime" : "border-line bg-white/70 text-ink-soft"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-2.5">
            {spots.map((s) => (
              <div key={s.id} className={`rounded-[1.5rem] border-2 p-3.5 ${s.imGoing ? "border-ink bg-lime/40" : "border-line bg-white/80"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-bold leading-tight">{s.name}</p>
                    <p className="truncate text-[12px] text-ink-soft">{[s.area, s.kind].filter(Boolean).join(" · ")}</p>
                  </div>
                  <button
                    onClick={() => toggleGoing(s)}
                    disabled={busy === s.id}
                    className={`shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-bold disabled:opacity-50 ${
                      s.imGoing ? "border-2 border-ink bg-white" : "bg-ink text-cream"
                    }`}
                  >
                    {s.imGoing ? <span className="flex items-center gap-1"><CheckCircle size={14} weight="fill" /> {t("going")}</span> : t("i'm going tonight")}
                  </button>
                </div>

                {s.going > 0 && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {s.people.slice(0, 5).map((p) => <Face key={p.memberNo} p={p} />)}
                    </div>
                    <p className="min-w-0 truncate text-[12.5px] font-semibold">
                      {s.going} {s.going === 1 ? t("going") : t("going")}
                      {(() => {
                        const match = s.people.find((p) => !p.me && p.shared?.length)
                        return match ? <span className="text-ink-soft"> · {match.first} {t("is into")} {joinVibes(match.shared)}</span> : null
                      })()}
                    </p>
                    {s.people.some((p) => p.locked) && <LockSimple size={12} weight="fill" className="shrink-0 text-ink-soft/60" />}
                  </div>
                )}

                {s.imGoing && (
                  <button
                    onClick={() => onOpenRoom?.({ channel: s.room, title: `${s.name} ${t("tonight")}` })}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full border-2 border-ink bg-white py-2 text-[12.5px] font-bold"
                  >
                    <ChatsCircle size={15} weight="fill" /> {t("chat with who's going")}
                  </button>
                )}
              </div>
            ))}
            {spots.length === 0 && (
              <p className="py-6 text-center text-[13px] text-ink-soft">{t("no spots here yet")}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
