import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Camera, CircleNotch, LinkSimple } from "@phosphor-icons/react"
import { t } from "../lib/i18n"

// "saw this on instagram": paste the link or a screenshot of the flyer and it's
// listed for everyone, with your name on it. hosts can make their own from here.
const shrink = (file) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.width, img.height))
      const c = document.createElement("canvas")
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL("image/jpeg", 0.85))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })

export default function AddEvent({ token, city, open, canHost, onClose, onHost, onAdded }) {
  const [url, setUrl] = useState("")
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const submit = async () => {
    setBusy(true); setErr("")
    const r = await fetch("/api/event-submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, city, url: url.trim() || null, image }),
    }).then((x) => x.json()).catch(() => ({ error: t("couldn't add it. try again.") }))
    setBusy(false)
    if (r.error) return setErr(r.error)
    setUrl(""); setImage(null)
    onAdded?.(r.id)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[460px] rounded-t-[2rem] bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
          >
            <div className="mx-auto h-1.5 w-11 rounded-full bg-line" />
            <h2 className="display mt-4 text-[28px] font-bold leading-tight">{t("add an event")}</h2>
            <p className="mt-0.5 text-[13px] text-ink-soft">{t("saw something on instagram? drop the link or a screenshot. we'll read it and list it with your name on it.")}</p>

            <div className="mt-4 flex items-center gap-2 rounded-[1rem] border border-line bg-white px-3">
              <LinkSimple size={17} className="shrink-0 text-ink-soft" />
              <input value={url} onChange={(ev) => setUrl(ev.target.value)} placeholder={t("paste a link")} inputMode="url" className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-ink-soft/50" />
            </div>
            <label className="mt-2 flex h-28 w-full cursor-pointer items-center justify-center overflow-hidden rounded-[1rem] border border-dashed border-line bg-white/60">
              {image ? <img src={image} alt="" className="h-full w-full object-contain" /> : <span className="flex items-center gap-2 text-[13.5px] font-bold text-ink-soft"><Camera size={18} /> {t("or a screenshot of the flyer")}</span>}
              <input type="file" accept="image/*" className="hidden" onChange={async (ev) => { const f = ev.target.files?.[0]; if (f) setImage(await shrink(f)) }} />
            </label>

            {err && <p className="mt-2 text-[12.5px] font-semibold text-red-600">{err}</p>}
            <button disabled={busy || (!url.trim() && !image)} onClick={submit} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-[15px] font-bold text-cream disabled:opacity-40">
              {busy && <CircleNotch size={16} className="animate-spin" />} {busy ? t("reading it…") : t("add it")}
            </button>
            {canHost && (
              <button onClick={onHost} className="mt-2 w-full rounded-full border border-line py-3 text-[14px] font-bold">
                {t("hosting it yourself? create your own")}
              </button>
            )}
            <button onClick={onClose} className="mt-1 w-full py-2.5 text-[13.5px] font-bold text-ink-soft">{t("cancel")}</button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
