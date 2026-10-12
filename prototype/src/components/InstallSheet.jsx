import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { t } from "../lib/i18n"
import { installPrompt } from "./HomeScreenCard"

// right after signup, once: put irlpass on the home screen. without the icon
// people lose the app (it's a browser tab) and iphone pings only work from it.
// two steps, drawn the way safari actually looks.
const KEY = "irl:install-shown"

export default function InstallSheet() {
  const [open, setOpen] = useState(false)
  const [menuSteps, setMenuSteps] = useState(false)
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true
    const mobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent)
    let shown = true
    try { shown = !!localStorage.getItem(KEY) || !!localStorage.getItem("irlpass_home_dismissed") } catch { /* private mode */ }
    if (standalone || !mobile || shown) return
    const id = setTimeout(() => {
      try { localStorage.setItem(KEY, "1") } catch { /* private mode */ }
      setOpen(true)
    }, 2500)
    return () => clearTimeout(id)
  }, [])
  // tell the shell a prompt is up, so other prompts wait their turn
  useEffect(() => { window.dispatchEvent(new CustomEvent("irl:prompt", { detail: open })) }, [open])

  const android = async () => {
    const ok = await installPrompt()
    if (ok) setOpen(false)
    else if (ok === null) setMenuSteps(true)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[2px]" />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-[81] mx-auto max-w-[460px] rounded-t-[2rem] bg-cream px-5 pb-[max(1.2rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-20px_60px_-20px_rgba(58,50,44,0.45)]"
          >
            <div className="flex items-center gap-3">
              <img src="/icon-192.png" alt="" className="h-14 w-14 rounded-[1rem] shadow-sm" draggable="false" />
              <div>
                <h2 className="display text-[24px] font-bold leading-[1.05] tracking-tight">{t("put irlpass on your home screen")}</h2>
                <p className="mt-0.5 text-[13px] text-ink-soft">{t("so you get pings when someone says hi, and find your people in one tap.")}</p>
              </div>
            </div>

            {ios ? (
              <div className="mt-5 space-y-2.5">
                <div className="flex items-center gap-3 rounded-[1.2rem] bg-white px-4 py-3 shadow-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-cream">1</span>
                  <p className="flex-1 text-[14px] font-semibold">{t("tap the share button in safari")}</p>
                  {/* safari's share icon */}
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3v12M8 7l4-4 4 4" /><path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H17" />
                  </svg>
                </div>
                <div className="flex items-center gap-3 rounded-[1.2rem] bg-white px-4 py-3 shadow-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-cream">2</span>
                  <p className="flex-1 text-[14px] font-semibold">{t("scroll down, tap “add to home screen”")}</p>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1c1b17" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                    <rect x="4" y="4" width="16" height="16" rx="3.5" /><path d="M12 8.5v7M8.5 12h7" />
                  </svg>
                </div>
                <p className="px-1 pt-1 text-[12px] text-ink-soft">{t("then open irlpass from the new icon. you stay logged in.")}</p>
                <motion.div animate={{ y: [0, 6, 0] }} transition={{ duration: 1.4, repeat: Infinity }} className="pt-1 text-center text-[22px]">↓</motion.div>
              </div>
            ) : menuSteps ? (
              <p className="mt-5 rounded-[1.2rem] bg-white px-4 py-3 text-[14px] font-semibold shadow-sm">{t("open your browser menu (⋮), then \"add to home screen\" or \"install app\".")}</p>
            ) : (
              <button onClick={android} className="mt-5 w-full rounded-full bg-ink py-3.5 text-[15px] font-bold text-cream">{t("add to home screen")}</button>
            )}
            <button onClick={() => setOpen(false)} className="mt-2 w-full py-2.5 text-[13.5px] font-bold text-ink-soft">{t("later")}</button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
