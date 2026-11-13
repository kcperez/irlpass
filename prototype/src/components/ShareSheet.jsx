import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChatCircleDots, DotsThree, LinkSimple, WhatsappLogo } from "@phosphor-icons/react"
import { t } from "../lib/i18n"

// share anything to wherever people actually talk. every link carries ?ref so
// whoever joins from it is credited to the sharer: this is how irlpass grows.
export default function ShareSheet({ share, onClose }) {
  const [copied, setCopied] = useState(false)
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
