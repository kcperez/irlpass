import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChatCircleDots, DotsThree, LinkSimple, WhatsappLogo } from "@phosphor-icons/react"
import { t } from "../lib/i18n"

// share anything to wherever people actually talk. every link carries ?ref so
// whoever joins from it is credited to the sharer: this is how irlpass grows.
export default function ShareSheet({ share, onClose, token, onPaywall, onSent }) {
  const [copied, setCopied] = useState(false)
  const [people, setPeople] = useState([])
  const [sent, setSent] = useState(null)
  // your irlpass chats first: tap someone and it lands in your dm as a card
  useEffect(() => {
    if (!share || !token) return
    setSent(null)
    fetch(`/api/dm?t=${token}`).then((r) => r.json()).then((d) => setPeople((d.threads || []).map((x) => x.with).filter(Boolean).slice(0, 12))).catch(() => {})
  }, [share, token])
  const sendTo = async (p) => {
    setSent(p.memberNo)
    const text = share.url.replace(/\?ref=\d+$/, "")
    const r = await fetch("/api/dm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, to: p.memberNo, text }) }).then((x) => x.json()).catch(() => null)
    if (r?.ok) { setTimeout(() => { onClose(); onSent?.(p) }, 500); return }
    setSent(null)
    if (r?.gate === "deliver") {
      try { localStorage.setItem("irl:pending-dm", JSON.stringify({ to: p.memberNo, text, name: p.name, photo: p.photo })) } catch { /* private mode */ }
      onClose(); return onPaywall?.({ reason: "deliver", next: `deliver-${p.memberNo}`, draft: text })
    }
    if (r?.gate) { onClose(); onPaywall?.(r.gate) }
  }
  const msg = share ? `${share.title} ${share.url}` : ""
  const go = (href) => { window.open(href, "_blank", "noopener"); onClose() }
  const opts = share && [
    { key: "wa", label: "whatsapp", icon: <WhatsappLogo size={26} weight="fill" />, bg: "#25d366", run: () => go(`https://wa.me/?text=${encodeURIComponent(msg)}`) },
    { key: "sms", label: t("messages"), icon: <ChatCircleDots size={26} weight="fill" />, bg: "#34c759", run: () => { window.location.href = `sms:&body=${encodeURIComponent(msg)}`; onClose() } },
    { key: "copy", label: copied ? t("copied") : t("copy link"), icon: <LinkSimple size={24} weight="bold" />, bg: "#4a66ff", run: async () => { try { await navigator.clipboard.writeText(share.url) } catch { /* old browser */ } setCopied(true); setTimeout(onClose, 700) } },
    ...(typeof navigator !== "undefined" && navigator.share ? [{ key: "more", label: t("more"), icon: <DotsThree size={26} weight="bold" />, bg: "rgba(255,255,255,.12)", run: async () => { try { await navigator.share({ title: share.title, url: share.url }) } catch { /* closed */ } onClose() } }] : []),
  ]
  return (
    <AnimatePresence>
      {share && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 lg:items-center">
          <motion.div initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} transition={{ type: "spring", stiffness: 340, damping: 32 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[420px] rounded-t-[1.8rem] border border-line bg-cream px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] pt-3 lg:rounded-[1.8rem]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
            <p className="serif-display text-[22px]">{t("share")}</p>
            {people.length > 0 && (
              <div className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1">
                {people.map((p) => (
                  <button key={p.memberNo} onClick={() => sendTo(p)} disabled={!!sent} className="flex w-[60px] shrink-0 flex-col items-center gap-1">
                    <span className="relative">
                      {p.photo ? <img src={p.photo} alt="" className="h-14 w-14 rounded-full object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-full bg-ink/10 text-[18px] font-bold">{String(p.name || "?")[0]}</span>}
                      {sent === p.memberNo && <span className="absolute inset-0 grid place-items-center rounded-full bg-lime/90 text-[20px] font-bold text-white">✓</span>}
                    </span>
                    <span className="w-full truncate text-center text-[11.5px] font-semibold">{String(p.name || "").split(/\s+/)[0].toLowerCase()}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 grid grid-cols-4 gap-2">
              {opts.map((o) => (
                <button key={o.key} onClick={o.run} className="flex flex-col items-center gap-1.5">
                  <span className="grid h-14 w-14 place-items-center rounded-full text-white" style={{ background: o.bg }}>{o.icon}</span>
                  <span className="text-[12px] font-semibold">{o.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
