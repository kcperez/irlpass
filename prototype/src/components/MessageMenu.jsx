import { useEffect, useRef, useState } from "react"
import { motion, useMotionValue, useTransform } from "framer-motion"
import { t } from "../lib/i18n"

// whatsapp-style: long-press a message and this sheet comes up: the message,
// a reaction row, then the actions. one place for every chat in the app.
const REACTS = ["❤️", "😂", "🔥", "👍", "😮", "🙏"]

export function MessageMenu({ m, mine, onReact, onReply, onCopy, onTranslate, translated, onEdit, onDeleteAll, onDeleteMe, onClose }) {
  const row = "flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-semibold active:bg-cream-deep/60"
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[55] bg-ink/40 backdrop-blur-[2px]" />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 420, damping: 36 }}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(e, i) => { if (i.offset.y > 80 || i.velocity.y > 500) onClose() }}
        className="fixed inset-x-0 bottom-0 z-[56] mx-auto max-w-[460px] rounded-t-[1.75rem] bg-cream pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-20px_50px_-20px_rgba(28,27,23,0.5)]"
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-line" />
        <p className="mx-5 mt-3 line-clamp-3 rounded-2xl bg-white px-4 py-3 text-[14px] leading-snug text-ink shadow-[0_1px_2px_rgba(58,50,44,0.08)]">{m.text}</p>
        <div className="mt-3 flex justify-between px-5">
          {REACTS.map((em) => (
            <motion.button key={em} whileTap={{ scale: 1.35 }} onClick={() => { onReact(em); onClose() }} className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[22px] shadow-sm">
              {em}
            </motion.button>
          ))}
        </div>
        <div className="mt-3 divide-y divide-line/60 border-t border-line/60">
          <button className={row} onClick={() => { onReply(); onClose() }}>↩︎ <span>{t("reply")}</span></button>
          <button className={row} onClick={() => { onCopy(); onClose() }}>⧉ <span>{t("copy")}</span></button>
          {onTranslate && <button className={row} onClick={() => { onTranslate(); onClose() }}>🌐 <span>{translated ? t("show original") : t("translate")}</span></button>}
          {mine && onEdit && <button className={row} onClick={() => { onEdit(); onClose() }}>✎ <span>{t("edit")}</span></button>}
          {mine && onDeleteAll && <button className={`${row} text-[#b3461f]`} onClick={() => { onDeleteAll(); onClose() }}>🗑 <span>{t("delete for everyone")}</span></button>}
          <button className={`${row} text-[#b3461f]`} onClick={() => { onDeleteMe(); onClose() }}>🙈 <span>{t("delete for me")}</span></button>
        </div>
      </motion.div>
    </>
  )
}

// swipe a bubble right to reply (the little arrow fades in as you pull)
export function SwipeToReply({ onReply, children, className = "" }) {
  const x = useMotionValue(0)
  const hint = useTransform(x, [0, 55], [0, 1])
  return (
    <div className={`relative ${className}`}>
      <motion.span style={{ opacity: hint }} className="pointer-events-none absolute left-0 top-1/2 -translate-x-7 -translate-y-1/2 text-[16px] text-ink-soft">↩︎</motion.span>
      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.45 }}
        dragSnapToOrigin
        onDragEnd={(e, i) => { if (i.offset.x > 55) { navigator.vibrate?.(8); onReply() } }}
      >
        {children}
      </motion.div>
    </div>
  )
}

// "delete for me": hidden on this phone only, like whatsapp
const HIDE = "irl:hidden-msgs"
export const hiddenMsgs = () => { try { return new Set(JSON.parse(localStorage.getItem(HIDE) || "[]")) } catch { return new Set() } }
export const hideMsg = (key) => {
  try {
    const s = hiddenMsgs(); s.add(String(key))
    localStorage.setItem(HIDE, JSON.stringify([...s].slice(-2000)))
  } catch { /* private mode */ }
}

// "delete chat": the conversation disappears from your list until a new message comes in
const CHATS = "irl:hidden-chats"
export const hiddenChats = () => { try { return JSON.parse(localStorage.getItem(CHATS) || "{}") } catch { return {} } }
export const hideChat = (memberNo) => {
  try { localStorage.setItem(CHATS, JSON.stringify({ ...hiddenChats(), [memberNo]: new Date().toISOString() })) } catch { /* private mode */ }
}

// chats stick to the bottom like whatsapp: new messages scroll into view when
// you're already at the bottom; if you scrolled up to read, a "↓ new" pill
// shows instead of yanking you down
export function useStickToBottom(count, lastIsMine) {
  const box = useRef(null)
  const atBottom = useRef(true)
  const [fresh, setFresh] = useState(0)
  const seen = useRef(count)
  const toBottom = (smooth) => {
    const el = box.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" })
    setFresh(0)
  }
  useEffect(() => {
    const added = count - seen.current
    seen.current = count
    if (added <= 0) return
    if (atBottom.current || lastIsMine) requestAnimationFrame(() => toBottom(added < 3))
    else setFresh((n) => n + added)
  }, [count, lastIsMine]) // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    const el = box.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottom.current) setFresh(0)
  }
  const Pill = () =>
    fresh > 0 ? (
      <button onClick={() => toBottom(true)} className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-bold text-cream shadow-lg">
        ↓ {fresh} {fresh === 1 ? "new message" : "new messages"}
      </button>
    ) : null
  return { box, onScroll, Pill, toBottom }
}
