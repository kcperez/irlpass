import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { LockSimple } from "@phosphor-icons/react"
import { Logo } from "../components/bits"

const goToDashboard = (key) => {
  window.location.href = `/api/applications?key=${encodeURIComponent(key)}`
}

export default function Admin() {
  const [pw, setPw] = useState("")
  const [state, setState] = useState("idle") // idle | checking | wrong

  useEffect(() => {
    const saved = localStorage.getItem("irlpass_admin_key")
    if (saved) goToDashboard(saved)
  }, [])

  const login = async () => {
    if (!pw.trim()) return
    setState("checking")
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pw }),
      })
      if (!r.ok) throw new Error()
      const { key } = await r.json()
      localStorage.setItem("irlpass_admin_key", key)
      goToDashboard(key)
    } catch {
      setState("wrong")
    }
  }

  return (
    <div className="flex min-h-[var(--app-h)] flex-col items-start justify-center px-7">
      <Logo h="h-10" />
      <h1 className="display mt-6 text-[32px] font-bold leading-tight">founders only.</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-soft">the door behind the door.</p>

      <div className="mt-8 flex w-full max-w-[340px] items-center gap-2">
        <div className="flex w-full items-center gap-2 rounded-full border border-line bg-white/70 px-4 py-3 focus-within:border-lime-deep">
          <LockSimple size={16} className="shrink-0 text-ink-soft" />
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => { setPw(e.target.value); setState("idle") }}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="password"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-soft/40"
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={login}
          disabled={!pw.trim() || state === "checking"}
          className="shrink-0 rounded-full bg-ink px-5 py-3 text-[14px] font-semibold text-cream disabled:opacity-40"
        >
          {state === "checking" ? "…" : "in"}
        </motion.button>
      </div>
      {state === "wrong" && (
        <p className="mt-3 text-[12.5px] font-medium text-[#b3461f]">nope. try again.</p>
      )}
    </div>
  )
}
