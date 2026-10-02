import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { ChatsCircle, CircleNotch, UsersThree, X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"
import { registerCities } from "../lib/cities"
import { cachedJson } from "../lib/cached"

// "where irlpass is": every city with people in it. counts and blurred faces
// give people a reason to go somewhere, or at least to peek at its chat.
const ago = (iso) => {
  if (!iso) return ""
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 60) return `${Math.max(1, m)}m ${t("ago")}`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h ${t("ago")}` : `${Math.round(h / 24)}d ${t("ago")}`
}

const fmtDay = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).toLowerCase()

export default function World({ token, onClose, onBrowse, onOpenRoom, onPaywall, onOpenPerson }) {
  const [data, setData] = useState(null)
  const [sel, setSel] = useState(null)
  const mapEl = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    // last answer instantly, then the fresh one (the map keeps its first pins)
    cachedJson(`/api/world?t=${token}`, (d) => {
      registerCities(Object.fromEntries((d.cities || []).map((c) => [c.slug, { name: c.name, emoji: c.emoji }])))
      setData((prev) => (prev ? { ...d, cities: d.cities?.length ? d.cities : prev.cities } : d))
    }).catch(() => setData((d) => d || { cities: [] }))
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
      // start framed on wherever people are, instead of the whole globe
      const pts = data.cities.map((c) => [c.lng, c.lat])
      if (pts.length > 1) {
        const lngs = pts.map((p) => p[0]), lats = pts.map((p) => p[1])
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 36, maxZoom: 4, duration: 0 })
      }
      const esc = (x) => String(x).replace(/[&<>"']/g, "")
      // big cities and your people's cities get full pins, the rest stay small
      const busy = new Set(data.cities.slice(0, 8).map((c) => c.slug))
      for (const c of [...data.cities].reverse()) {
        const el = document.createElement("button")
        const faces = c.friendFaces || []
        el.className = `irl-pin${faces.length ? " face" : busy.has(c.slug) ? "" : " small"}`
        el.innerHTML = faces.length
          ? `${faces.map((f) => `<img src="${esc(f)}" alt="">`).join("")}<b>${esc(c.name)}</b>`
          : `<span>${c.emoji}</span><b>${c.people || "·"}</b>`
        el.onclick = (e) => { e.stopPropagation(); setSel(c.slug); map.flyTo({ center: [c.lng, c.lat], zoom: 4.5, speed: 1.4 }) }
        new maplibregl.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map)
      }
    })
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data?.cities?.length])

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
          {/* inline position: maplibre's own .maplibregl-map class sets position:relative,
              which beat "absolute inset-0" and collapsed the map to 0px tall (josh's blank box) */}
          <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />
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
              {/* the travel map: where the people you've met are headed */}
              {data?.friends?.length > 0 ? (
                <section className="mb-3 rounded-[1.6rem] bg-ink p-4 text-cream">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cream/60">{t("travel map")}</p>
                  <p className="display mt-0.5 text-[19px] font-bold leading-tight">
                    {data.friends.length} {data.friends.length === 1 ? t("trip coming up from your people") : t("trips coming up from your people")}
                  </p>
                  <div className="mt-3 space-y-2">
                    {data.friends.slice(0, 6).map((f, i) => (
                      <motion.button
                        key={`${f.memberNo}-${f.city}-${f.starts}`}
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        onClick={() => { mapRef.current?.flyTo({ center: [f.lng, f.lat], zoom: 4.5, speed: 1.4 }); onOpenPerson?.(f.memberNo) }}
                        className="flex w-full items-center gap-3 rounded-[1.1rem] bg-cream/10 px-3 py-2 text-left active:scale-[0.99]"
                      >
                        <img src={f.photo} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden" }} className={`h-10 w-10 shrink-0 rounded-full border-2 border-cream object-cover ${f.locked ? "blur-[1.5px]" : ""}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14.5px] font-bold">{f.first} {t("in")} {f.cityName} {f.emoji}</p>
                          <p className="truncate text-[12px] text-cream/70">
                            {f.now ? t("there now") : `${fmtDay(f.starts)} – ${fmtDay(f.ends)}`}
                            {f.nights > 0 ? ` · ${f.nights} ${f.nights === 1 ? t("night out together") : t("nights out together")}` : ""}
                          </p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </section>
              ) : data && (
                <p className="mb-2 rounded-[1.3rem] border-2 border-dashed border-line px-4 py-3 text-[12.5px] text-ink-soft">
                  {t("people you talk to or go out with show up here, with where they're headed next.")}
                </p>
              )}
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
