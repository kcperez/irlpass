import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { ChatsCircle, CircleNotch, UsersThree, X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { registerCities } from "../lib/cities"

// "where irlpass is": every city with people in it. counts and blurred faces
// give people a reason to go somewhere, or at least to peek at its chat.
const ago = (iso) => {
  if (!iso) return ""
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 60) return `${Math.max(1, m)}m ${t("ago")}`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h ${t("ago")}` : `${Math.round(h / 24)}d ${t("ago")}`
}

export default function World({ token, onClose, onBrowse, onOpenRoom, onPaywall }) {
  const [data, setData] = useState(null)
  const [sel, setSel] = useState(null)
  const mapEl = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    fetch(`/api/world?t=${token}`)
      .then((r) => r.json())
      .then((d) => {
        registerCities(Object.fromEntries((d.cities || []).map((c) => [c.slug, { name: c.name, emoji: c.emoji }])))
        setData(d)
      })
      .catch(() => setData({ cities: [] }))
  }, [token])

  // the map library is heavy, so it only loads when someone opens the map
  useEffect(() => {
    if (!data?.cities?.length || !mapEl.current || mapRef.current) return
    let cancelled = false
    Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]).then(([{ default: maplibregl }]) => {
      if (cancelled || !mapEl.current) return
      const map = new maplibregl.Map({
        container: mapEl.current,
        style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        center: [-40, 20],
        zoom: 0.9,
        attributionControl: { compact: true },
        dragRotate: false,
      })
      mapRef.current = map
      for (const c of data.cities) {
        const el = document.createElement("button")
        el.className = "irl-pin"
        el.innerHTML = `<span>${c.emoji}</span><b>${c.people || "·"}</b>`
        el.onclick = (e) => { e.stopPropagation(); setSel(c.slug); map.flyTo({ center: [c.lng, c.lat], zoom: 4.5, speed: 1.4 }) }
        new maplibregl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map)
      }
    })
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null }
  }, [data])

  const city = data?.cities?.find((c) => c.slug === sel)
  const canWrite = city && (city.mine || data?.pass)

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        className="fixed inset-x-0 bottom-0 top-8 z-50 mx-auto flex max-w-[460px] flex-col overflow-hidden rounded-t-[2rem] bg-cream shadow-[0_-20px_60px_-20px_rgba(58,50,44,0.45)]"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">{t("right now")}</p>
            <h2 className="display text-[26px] font-bold leading-tight">{t("where irlpass is")}</h2>
          </div>
          <button onClick={onClose} aria-label={t("close")} className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"><X size={18} weight="bold" /></button>
        </div>

        <div className="relative mx-4 h-[38%] min-h-[210px] overflow-hidden rounded-[1.6rem] bg-cream-deep shadow-[inset_0_0_0_2px_rgba(58,50,44,0.06)]">
          <div ref={mapEl} className="absolute inset-0" />
          {!data && <div className="absolute inset-0 flex items-center justify-center"><CircleNotch size={22} className="animate-spin text-ink-soft" /></div>}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {city ? (
            <motion.div key={city.slug} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-[1.6rem] bg-white p-4 shadow-[0_1px_2px_rgba(58,50,44,0.06),0_12px_32px_-14px_rgba(58,50,44,0.35)]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="display text-[26px] font-bold leading-none">{city.emoji} {city.name}</p>
                  <p className="mt-1.5 text-[13px] font-semibold text-ink-soft">
                    {[
                      `${city.people} ${city.people === 1 ? t("person") : t("people")} ${t("in the next 2 months")}`,
                      city.locals ? `${city.locals} ${city.locals === 1 ? t("local") : t("locals")}` : null,
                      city.hereNow ? `${city.hereNow} ${t("there now")}` : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button onClick={() => setSel(null)} className="text-[12px] font-bold text-ink-soft underline">{t("all")}</button>
              </div>
              {city.faces.length > 0 && (
                <div className="mt-3 flex -space-x-2.5">
                  {city.faces.map((f) => (
                    <img key={f} src={f} alt="" onError={(e) => { e.currentTarget.style.display = "none" }} className="h-11 w-11 rounded-full border-2 border-white object-cover blur-[1.5px]" />
                  ))}
                </div>
              )}
              <p className="mt-3 text-[13px]">
                {city.outTonight > 0 && <span className="font-bold">🟢 {city.outTonight} {t("out tonight")} · </span>}
                {city.chatWeek > 0 ? `💬 ${city.chatWeek} ${t("messages this week")} · ${t("last")} ${ago(city.chatLast)}` : t("the chat is quiet. be the one who starts it.")}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => onBrowse?.(city.slug)} className="flex items-center justify-center gap-1.5 rounded-full border-2 border-ink bg-white py-3 text-[13.5px] font-bold">
                  <UsersThree size={16} weight="fill" /> {t("see who's there")}
                </button>
                <button
                  onClick={() => (canWrite ? onOpenRoom?.(city) : onPaywall?.(city))}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-ink py-3 text-[13.5px] font-bold text-cream"
                >
                  <ChatsCircle size={16} weight="fill" /> {canWrite ? t("open the chat") : t("join the chat")}
                </button>
              </div>
              {!canWrite && (
                <p className="mt-2 text-center text-[11.5px] text-ink-soft">{t("post dates there, or get the pass to chat in every city")}</p>
              )}
            </motion.div>
          ) : (
            <div className="space-y-2">
              {(data?.cities || []).map((c, i) => (
                <motion.button
                  key={c.slug}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}
                  onClick={() => { setSel(c.slug); mapRef.current?.flyTo({ center: [c.lng, c.lat], zoom: 4.5, speed: 1.4 }) }}
                  className="flex w-full items-center gap-3 rounded-[1.3rem] bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(58,50,44,0.06),0_8px_20px_-12px_rgba(58,50,44,0.3)] active:scale-[0.99]"
                >
                  <span className="text-[26px] leading-none">{c.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold leading-tight">{c.name}</p>
                    <p className="truncate text-[12px] text-ink-soft">
                      {c.people} {c.people === 1 ? t("person") : t("people")}
                      {c.outTonight ? ` · ${c.outTonight} ${t("out tonight")}` : ""}
                      {c.chatWeek ? ` · ${t("chat active")} ${ago(c.chatLast)}` : ""}
                    </p>
                  </div>
                  <div className="flex -space-x-2">
                    {c.faces.slice(0, 3).map((f) => <img key={f} src={f} alt="" onError={(e) => { e.currentTarget.style.display = "none" }} className="h-8 w-8 rounded-full border-2 border-white object-cover blur-[1px]" />)}
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}
