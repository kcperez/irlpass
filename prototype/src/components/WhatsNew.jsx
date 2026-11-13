import { motion } from "framer-motion"
import { t } from "../lib/i18n"

// shown once after an update: what changed, and a button that takes you
// straight to each thing. close it and it's gone (the dots stay until visited).
export const WHATS_NEW = "whatsnew-2026-11-city"

const ITEMS = [
  { key: "city", emoji: "🧭", title: "ask your city anything", body: "dinner tonight, the airport, techno. michelin picks, real answers, what's on." },
  { key: "events", emoji: "🎟️", title: "everything on this week", body: "swipe through what's happening. tap i'm going and you're in the group chat." },
  { key: "dms", emoji: "💬", title: "your events, one inbox", body: "every event you're going to has its own chat, next to your city's group." },
]

export default function WhatsNew({ onGo, onClose }) {
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px]" />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 32 }}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(e, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose() }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[460px] rounded-t-[2rem] bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_60px_-20px_rgba(58,50,44,0.45)]"
      >
        <div className="mx-auto h-1.5 w-11 rounded-full bg-line" />
        <p className="mt-4 text-[12px] text-ink-soft font-semibold">{t("new on irlpass")}</p>
        <h2 className="display text-[28px] font-bold leading-tight">{t("meet people tonight, wherever you are")}</h2>
        <div className="mt-4 space-y-2">
          {ITEMS.map((it, i) => (
            <motion.button
              key={it.key}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 + i * 0.06 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onGo(it.key)}
              className="flex w-full items-center gap-3 rounded-[1.4rem] bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(58,50,44,0.06),0_8px_24px_-12px_rgba(58,50,44,0.25)]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime text-[22px]">{it.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold leading-tight">{t(it.title)}</span>
                <span className="block text-[12.5px] leading-snug text-ink-soft">{t(it.body)}</span>
              </span>
              <span className="shrink-0 text-[12px] font-bold text-ink-soft">{t("try it")} →</span>
            </motion.button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-full bg-ink py-3.5 text-[15px] font-bold text-cream">{t("got it")}</button>
      </motion.div>
    </>
  )
}
