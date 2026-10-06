import { useState } from "react"
import { motion } from "framer-motion"
import { t } from "../lib/i18n"

// right after a plan is born: the best moment to pull people in. one tap to
// whatsapp, imessage or instagram, the native sheet for anything else.
export default function InvitePrompt({ me, spot, when, onClose }) {
  const [copied, setCopied] = useState(false)
  const url = `https://irlpass.xyz/?ref=${me?.memberNo || ""}&go=spot-${spot.id}`
  const text = `${spot.name} ${when}. come through, it's on irlpass: ${url}`
  const enc = encodeURIComponent(text)
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true) } catch { /* blocked */ } }
  const btn = "flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-[12px] font-bold shadow-[0_1px_2px_rgba(58,50,44,0.08)] active:scale-95"
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 32 }}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(e, i) => { if (i.offset.y > 100 || i.velocity.y > 600) onClose() }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[460px] rounded-t-[2rem] bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto h-1.5 w-11 rounded-full bg-line" />
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">✓ {t("you're going")} · {when}</p>
        <h2 className="display text-[26px] font-bold leading-tight">{t("who else should come to")} {spot.name}?</h2>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <a href={`https://wa.me/?text=${enc}`} target="_blank" rel="noopener noreferrer" className={btn}><span className="text-[24px]">💬</span>whatsapp</a>
          <a href={`sms:&body=${enc}`} className={btn}><span className="text-[24px]">💭</span>imessage</a>
          <button
            onClick={async () => { await copy(); window.location.href = "instagram://direct-inbox"; setTimeout(() => window.open("https://www.instagram.com/direct/inbox/", "_blank"), 900) }}
            className={btn}
          >
            <span className="text-[24px]">📸</span>instagram
          </button>
          <button
            onClick={async () => { try { if (navigator.share) await navigator.share({ text, url }); else await copy() } catch { /* dismissed */ } }}
            className={btn}
          >
            <span className="text-[24px]">↗️</span>{t("more")}
          </button>
        </div>
        {copied && <p className="mt-2 text-center text-[12px] font-semibold text-ink-soft">{t("link copied. paste it in the chat")}</p>}
        <button onClick={onClose} className="mt-4 w-full rounded-full bg-ink py-3.5 text-[15px] font-bold text-cream">{t("done")}</button>
      </motion.div>
    </>
  )
}
