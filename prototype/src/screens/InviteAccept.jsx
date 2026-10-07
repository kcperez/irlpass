import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, CircleNotch } from "@phosphor-icons/react"
import { cityChip } from "../lib/cities"
import { t } from "../lib/i18n"

// Someone already signed in opened an invite link. They don't need onboarding,
// they need one button that puts them on those days.
const fmtD = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

export default function InviteAccept({ token, invite, invitedBy }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const city = cityChip(invite.city)

  const add = async () => {
    setBusy(true)
    setErr("")
    try {
      const r = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, city: invite.city, starts: invite.starts, ends: invite.ends }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "could not add those dates")
      window.location.href = `/?screen=app&t=${token}`
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[var(--app-h)] flex-col justify-center px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex w-fit items-center gap-2 rounded-full bg-white shadow-[0_1px_2px_rgba(58,50,44,0.05),0_10px_28px_-16px_rgba(58,50,44,0.28)] px-3.5 py-1.5">
        <img src="/art/icon-people.png" alt="" className="h-5 w-5 object-contain" draggable="false" />
        <span className="text-[12.5px] font-bold">@{invitedBy} {t("invited you")}</span>
      </div>

      <h1 className="display mt-4 font-bold leading-[0.95] tracking-[-0.03em]" style={{ fontSize: "clamp(30px, 8vw, 46px)" }}>
        {city.emoji} {city.name.toLowerCase()}
      </h1>
      <p className="mt-2 text-[17px] font-semibold">
        {fmtD(invite.starts)} – {fmtD(invite.ends)}
      </p>
      <p className="mt-2 text-[15px] text-ink-soft">
        {t("add these days to your calendar and you'll both show up on each other's dates.")}
      </p>

      {err && <p className="mt-3 text-[13.5px] font-semibold text-[#8f2b2b]">{err}</p>}

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={add}
        disabled={busy}
        className="mt-6 flex items-center justify-center gap-2 rounded-full bg-ink py-4 text-[17px] font-bold text-cream disabled:opacity-50"
      >
        {busy ? <CircleNotch size={18} className="animate-spin" /> : null}
        {t("add these dates")} <ArrowRight size={18} weight="bold" />
      </motion.button>

      <a
        href={`/?screen=app&t=${token}`}
        className="mt-3 text-center text-[13.5px] text-ink-soft underline underline-offset-4"
      >
        {t("no thanks, just open the app")}
      </a>
    </div>
  )
}
