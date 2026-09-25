import { useEffect, useState } from "react"
import { X } from "@phosphor-icons/react"
import { t } from "../lib/i18n"

// irlpass is a web app, so there's no icon to come back to unless we ask for
// one. shown after someone has dates up, hidden once installed or dismissed.
const KEY = "irlpass_home_dismissed"

let deferred = null // android/chrome hands us an install prompt once
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferred = e
  })
}

export default function HomeScreenCard() {
  const [show, setShow] = useState(false)
  const [steps, setSteps] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true
    let dismissed = false
    try { dismissed = !!localStorage.getItem(KEY) } catch { /* private mode */ }
    setShow(!standalone && !dismissed)
  }, [])

  if (!show) return null

  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const dismiss = () => {
    try { localStorage.setItem(KEY, "1") } catch { /* private mode */ }
    setShow(false)
  }
  const add = async () => {
    if (deferred) {
      deferred.prompt()
      const choice = await deferred.userChoice.catch(() => null)
      deferred = null
      if (choice?.outcome === "accepted") dismiss()
      return
    }
    setSteps(true)
  }

  return (
    <div className="relative mt-3 rounded-[1.5rem] border-2 border-line bg-white/70 px-4 py-3.5">
      <button onClick={dismiss} aria-label={t("close")} className="absolute right-3 top-3 text-ink-soft">
        <X size={15} weight="bold" />
      </button>
      <div className="flex items-center gap-3 pr-5">
        <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-[0.8rem]" draggable="false" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-tight">{t("put irlpass on your home screen")}</p>
          <p className="text-[12.5px] text-ink-soft">{t("so you can find your dates and chats again in one tap")}</p>
        </div>
      </div>
      {steps ? (
        <p className="mt-2.5 rounded-[1rem] bg-cream-deep px-3 py-2 text-[12.5px] font-semibold leading-snug">
          {ios
            ? t("tap the share button at the bottom of safari, then \"add to home screen\".")
            : t("open your browser menu (⋮), then \"add to home screen\" or \"install app\".")}
        </p>
      ) : (
        <button onClick={add} className="mt-2.5 w-full rounded-full bg-ink py-2.5 text-[13px] font-bold text-cream">
          {t("add to home screen")}
        </button>
      )}
    </div>
  )
}
