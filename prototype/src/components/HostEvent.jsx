import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Camera, CircleNotch } from "@phosphor-icons/react"
import { t } from "../lib/i18n"

// hosts (josh, venues, run clubs) put their own night on irlpass. free ones
// fill the chat, paid ones sell tickets through stripe.
const CATS = [["run", "🏃"], ["wellness", "🧘"], ["party", "🪩"], ["food", "🍷"], ["art", "🎨"], ["social", "💬"], ["tech", "💻"]]
const shrink = (file) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, 1400 / Math.max(img.width, img.height))
      const c = document.createElement("canvas")
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL("image/jpeg", 0.82))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
const field = "w-full rounded-[1rem] border border-line bg-white px-3 py-2.5 text-[15px] font-semibold outline-none focus:border-ink placeholder:font-medium placeholder:text-ink-soft/50"

export default function HostEvent({ token, city, open, onClose, onCreated }) {
  const [f, setF] = useState({ title: "", date: "", time: "20:00", venue: "", address: "", details: "", category: "", capacity: "", price: "" })
  const [image, setImage] = useState(null)
  // self-serve storytime: "1 story = 1 free smoothie, 50 of them"
  const [perkOn, setPerkOn] = useState(false)
  const [perk, setPerk] = useState({ item: "", qty: "50", ask: "story", tags: "" })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const set = (k) => (ev) => setF((x) => ({ ...x, [k]: ev.target.value }))

  const submit = async () => {
    setErr("")
    if (!f.date) return setErr(t("pick a day"))
    setBusy(true)
    const startsAt = new Date(`${f.date}T${f.time || "20:00"}`).toISOString()
    const r = await fetch("/api/event-host", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, action: "create", city, ...f, startsAt, image, perk: perkOn ? perk : null }),
    }).then((x) => x.json()).catch(() => ({ error: t("couldn't post it. try again.") }))
    setBusy(false)
    if (r.error) return setErr(r.error)
    setF({ title: "", date: "", time: "20:00", venue: "", address: "", details: "", category: "", capacity: "", price: "" })
    setImage(null)
    setPerkOn(false)
    setPerk({ item: "", qty: "50", ask: "story", tags: "" })
    onCreated?.(r.id)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] max-w-[460px] overflow-y-auto rounded-t-[2rem] bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
          >
            <div className="mx-auto h-1.5 w-11 rounded-full bg-line" />
            <h2 className="display mt-4 text-[28px] font-bold leading-tight">{t("host an event")}</h2>
            <p className="mt-0.5 text-[13px] text-ink-soft">{t("it goes to the top of the city, and everyone going lands in one chat.")}</p>

            <label className="mt-4 flex aspect-[16/9] w-full cursor-pointer items-center justify-center overflow-hidden rounded-[1.2rem] border border-dashed border-line bg-white/60">
              {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <span className="flex items-center gap-2 text-[13.5px] font-bold text-ink-soft"><Camera size={18} /> {t("add a cover")}</span>}
              <input type="file" accept="image/*" className="hidden" onChange={async (ev) => { const file = ev.target.files?.[0]; if (file) setImage(await shrink(file)) }} />
            </label>

            <div className="mt-3 space-y-2">
              <input value={f.title} onChange={set("title")} placeholder={t("name it: basel run and rave")} className={field} />
              <div className="flex gap-2">
                <input type="date" value={f.date} onChange={set("date")} className={field} />
                <input type="time" value={f.time} onChange={set("time")} className={`${field} max-w-[130px]`} />
              </div>
              <input value={f.venue} onChange={set("venue")} placeholder={t("where: venue or meeting point")} className={field} />
              <input value={f.address} onChange={set("address")} placeholder={t("address (optional)")} className={field} />
              <textarea value={f.details} onChange={set("details")} rows={3} placeholder={t("what's the plan? (optional)")} className={`${field} resize-none`} />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {CATS.map(([k, emoji]) => (
                <button key={k} onClick={() => setF((x) => ({ ...x, category: x.category === k ? "" : k }))} className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${f.category === k ? "bg-ink text-cream" : "bg-white/70 text-ink-soft"}`}>
                  {emoji} {t(k)}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <label className="flex-1">
                <span className="text-[12px] font-bold text-ink-soft">{t("ticket price (usd)")}</span>
                <input inputMode="decimal" value={f.price} onChange={set("price")} placeholder={t("free")} className={field} />
              </label>
              <label className="flex-1">
                <span className="text-[12px] font-bold text-ink-soft">{t("spots")}</span>
                <input inputMode="numeric" value={f.capacity} onChange={set("capacity")} placeholder={t("no limit")} className={field} />
              </label>
            </div>

            <div className="mt-4 rounded-[1.2rem] border border-line bg-white/60 p-3">
              <button onClick={() => setPerkOn((x) => !x)} className="flex w-full items-center justify-between text-left">
                <span>
                  <span className="block text-[14.5px] font-bold">🎁 {t("give perks for posts")}</span>
                  <span className="block text-[12.5px] text-ink-soft">{t("guests post a story tagging you, staff see it at the counter and give the perk. 20 free stories a month.")}</span>
                </span>
                <span className={`h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors ${perkOn ? "bg-ink" : "bg-line"}`}><span className={`block h-5 w-5 rounded-full bg-white transition-transform ${perkOn ? "translate-x-4" : ""}`} /></span>
              </button>
              {perkOn && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    <input value={perk.item} onChange={(ev) => setPerk((p) => ({ ...p, item: ev.target.value }))} placeholder={t("a free smoothie")} className={field} />
                    <input inputMode="numeric" value={perk.qty} onChange={(ev) => setPerk((p) => ({ ...p, qty: ev.target.value }))} className={`${field} max-w-[84px]`} />
                  </div>
                  <div className="flex gap-1.5">
                    {[["story", t("1 story")], ["post", t("1 post")], ["reel", t("1 reel")]].map(([k, label]) => (
                      <button key={k} onClick={() => setPerk((p) => ({ ...p, ask: k }))} className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${perk.ask === k ? "bg-ink text-cream" : "bg-white text-ink-soft"}`}>{label}</button>
                    ))}
                  </div>
                  <input value={perk.tags} onChange={(ev) => setPerk((p) => ({ ...p, tags: ev.target.value }))} placeholder={t("your instagram: @paraisomarket")} className={field} />
                </div>
              )}
            </div>

            {err && <p className="mt-2 text-[12.5px] font-semibold text-red-600">{err}</p>}
            <button disabled={busy || f.title.trim().length < 3 || !f.venue.trim()} onClick={submit} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-[15px] font-bold text-cream disabled:opacity-40">
              {busy && <CircleNotch size={16} className="animate-spin" />} {t("post it")}
            </button>
            <button onClick={onClose} className="mt-1 w-full py-2.5 text-[13.5px] font-bold text-ink-soft">{t("cancel")}</button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
