import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { t } from "../lib/i18n"
import { enablePush, pushState } from "../lib/push"

// shows right after a high-intent action ("get a ping when they reply").
// once a day at most, and never again after a no from the browser.
export default function PushPrompt({ token }) {
  const [why, setWhy] = useState(null)
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  // tell the shell a prompt is up, so the night prompt waits its turn
  useEffect(() => { window.dispatchEvent(new CustomEvent("irl:prompt", { detail: !!why })) }, [why])
  useEffect(() => {
    const on = (e) => {
      const st = pushState()
      if (st === "granted" || st === "denied" || st === "unsupported") return
      try {
        const last = Number(localStorage.getItem("irl:push-asked") || 0)
        if (Date.now() - last < 20 * 3600e3) return
        localStorage.setItem("irl:push-asked", String(Date.now()))
      } catch { /* private mode */ }
      setState(st)
      setWhy(e.detail || t("something happens"))
    }
    window.addEventListener("irl:ask-push", on)
    return () => window.removeEventListener("irl:ask-push", on)
  }, [])

  const turnOn = async () => {
    setBusy(true)
    await enablePush(token).catch(() => false)
    setBusy(false)
    setWhy(null)
  }

  return (
    <AnimatePresence>
      {why && (
        <motion.div
          initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 340, damping: 30 }}
          className="fixed inset-x-0 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-[70] mx-auto w-[calc(100%-1.5rem)] max-w-[436px] rounded-[1.6rem] bg-white p-4 shadow-[0_18px_40px_-14px_rgba(28,27,23,0.55)]"
        >
          <p className="text-[15px] font-bold leading-snug">🔔 {t("get a ping when")} {why}?</p>
          {state === "needs-install" ? (
            <>
              <p className="mt-1 text-[12.5px] text-ink-soft">{t("on iphone: tap share, then “add to home screen”, and open irlpass from there. pings work from the app.")}</p>
              <button onClick={() => setWhy(null)} className="mt-3 w-full rounded-full border-2 border-ink py-2.5 text-[13.5px] font-bold">{t("got it")}</button>
            </>
          ) : (
            <div className="mt-3 flex gap-2">
              <button onClick={turnOn} disabled={busy} className="flex-1 rounded-full bg-ink py-2.5 text-[13.5px] font-bold text-cream disabled:opacity-60">{t("turn on")}</button>
              <button onClick={() => setWhy(null)} className="rounded-full border-2 border-line px-4 text-[13px] font-bold text-ink-soft">{t("not now")}</button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
