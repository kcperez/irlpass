import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { InstagramLogo, EnvelopeSimple, CircleNotch } from "@phosphor-icons/react"
import { Logo } from "../components/bits"

// friend redeems a free invite code -> straight into the club, no payment
export default function Redeem({ code, onJoined }) {
  const [valid, setValid] = useState(null) // null=checking, true, false
  const [name, setName] = useState("")
  const [ig, setIg] = useState("")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!code) return setValid(false)
    fetch(`/api/redeem?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => setValid(!!d.valid))
      .catch(() => setValid(false))
  }, [code])

  const ready = name.trim().length > 1 && ig.trim().length > 2 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  const redeem = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch("/api/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, name, ig, email }),
      })
      const d = await r.json()
      if (!d.token) throw new Error(d.error || "failed")
      localStorage.setItem("irlpass_member_token", d.token)
      onJoined(d.token)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  if (valid === null) {
    return <div className="flex min-h-[var(--app-h)] items-center justify-center bg-ink"><CircleNotch size={24} className="animate-spin text-lime" /></div>
  }

  if (!valid) {
    return (
      <div className="flex min-h-[var(--app-h)] flex-col items-start justify-center bg-ink px-7 text-cream">
        <Logo h="h-10" />
        <h1 className="display mt-5 text-[32px] font-bold leading-tight">this code's used up.</h1>
        <p className="mt-2 text-[14px] text-cream/60">codes are one-shot. ask whoever sent it for a fresh one, or apply yourself.</p>
        <a href="/" className="mt-6 rounded-full bg-lime px-6 py-3.5 text-[14px] font-semibold text-ink">apply to join</a>
      </div>
    )
  }

  return (
    <div className="flex min-h-[var(--app-h)] flex-col bg-ink px-6 text-cream">
      <header className="pt-[max(1.5rem,env(safe-area-inset-top))] md:pt-12"><Logo h="h-10" /></header>
      <main className="flex flex-1 flex-col justify-center pb-8">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-lime">
          you've been invited in
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="display mt-1.5 text-[34px] font-bold leading-[1.05]">
          someone vouched for you. no application, no fee.
        </motion.h1>
        <p className="mt-3 text-[14px] leading-relaxed text-cream/70">just tell us who you are so your pass has a name on it.</p>

        <div className="mt-7 space-y-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="first name"
            className="w-full border-b-2 border-cream/15 bg-transparent pb-2 text-[20px] font-medium outline-none placeholder:text-cream/30 focus:border-lime" />
          <div className="flex items-center gap-2 border-b-2 border-cream/15 pb-2 focus-within:border-lime">
            <InstagramLogo size={20} className="text-cream/50" />
            <input value={ig} onChange={(e) => setIg(e.target.value.replace(/\s/g, ""))} placeholder="@instagram"
              className="w-full bg-transparent text-[20px] font-medium outline-none placeholder:text-cream/30" />
          </div>
          <div className="flex items-center gap-2 border-b-2 border-cream/15 pb-2 focus-within:border-lime">
            <EnvelopeSimple size={20} className="text-cream/50" />
            <input type="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email"
              className="w-full bg-transparent text-[18px] font-medium outline-none placeholder:text-cream/30" />
          </div>
        </div>
      </main>
      <footer className="pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {error && <p className="mb-2.5 text-center text-[12.5px] font-medium text-[#e58a63]">{error}</p>}
        <motion.button whileTap={{ scale: 0.97 }} onClick={redeem} disabled={!ready || busy}
          className="w-full rounded-full bg-lime px-6 py-4 text-[15px] font-semibold text-ink shadow-[inset_0_-2px_0_rgba(28,27,23,0.18)] disabled:opacity-40">
          {busy ? "letting you in…" : "claim my pass"}
        </motion.button>
      </footer>
    </div>
  )
}
