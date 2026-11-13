import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Camera, CheckCircle, CircleNotch, Gift } from "@phosphor-icons/react"
import { t } from "../lib/i18n"

// the perk on a hosted event: post, send the screenshot, get approved (by
// claude or the host), show the live pass at the counter. hosts see every
// claim here too and approve with a tap.
const ASK = { story: "a story", post: "a post", reel: "a reel or tiktok" }
const shrink = (file) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, 1600 / Math.max(img.width, img.height))
      const c = document.createElement("canvas")
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL("image/jpeg", 0.85))
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })

function LivePass({ perk, me, onGiven }) {
  const [now, setNow] = useState(new Date())
  const [sure, setSure] = useState(false)
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  return (
    <div className="overflow-hidden rounded-[1.4rem] bg-ink p-4 text-cream">
      {/* moving light + ticking clock: a screenshot of this doesn't pass */}
      <motion.div animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        className="rounded-[1rem] p-4 text-ink" style={{ backgroundImage: "linear-gradient(110deg,#ddd0f6,#f8d9c6,#cdee45,#ddd0f6)", backgroundSize: "300% 100%" }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]">{t("show this at the counter")}</p>
        <p className="display mt-1 text-[30px] font-bold leading-none">{perk.item}</p>
        <p className="mt-2 text-[13px] font-bold">{String(me?.name || "").split(/\s+/)[0].toLowerCase()} · nº {me?.memberNo}</p>
        <p className="mt-1 tabular-nums text-[22px] font-bold">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }).toLowerCase()}</p>
      </motion.div>
      <button onClick={() => (sure ? onGiven() : setSure(true))} className="mt-3 w-full rounded-full border border-cream/30 py-3 text-[14px] font-bold">
        {sure ? t("staff: tap again to confirm") : t("staff: tap when you've given it")}
      </button>
    </div>
  )
}

export default function PerkCard({ token, e, me }) {
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const load = () => fetch(`/api/perks?t=${token}&id=${e.id}`).then((r) => r.json()).then((x) => !x.error && setD(x)).catch(() => {})
  useEffect(() => { load() }, [e.id, e.going]) // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (body) => {
    setBusy(true); setErr("")
    const r = await fetch("/api/perks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, ...body }) }).then((x) => x.json()).catch(() => ({ error: t("something broke. try again.") }))
    setBusy(false)
    if (r.error) setErr(r.error)
    await load()
    return r
  }
  const send = async (file) => {
    if (!file) return
    const image = await shrink(file)
    await post({ action: "submit", id: e.id, image })
  }

  const perk = d?.perk || e.perk
  const mine = d?.mine
  const ask = `${t("post")} ${t(ASK[perk.ask] || ASK.story)} ${t("tagging")} ${(perk.tags || []).join(" ")}`

  return (
    <div className="mt-4 overflow-hidden rounded-[1.4rem] border border-white/70 bg-white/80 shadow-[0_10px_30px_-18px_rgba(58,50,44,0.4)]">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime"><Gift size={19} weight="fill" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">{perk.item}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{ask}</p>
        </div>
        {d && <span className="shrink-0 rounded-full bg-cream-deep px-2 py-1 text-[11.5px] font-bold">{d.left} {t("left")}</span>}
      </div>

      <div className="border-t border-line/70 px-4 py-3">
        {!e.going ? (
          <p className="text-[13px] font-semibold text-ink-soft">{t("tap i'm going, then send your post here.")}</p>
        ) : mine?.status === "approved" ? (
          <LivePass perk={perk} me={me} onGiven={() => post({ action: "given", claim: mine.id })} />
        ) : mine?.status === "given" ? (
          <p className="flex items-center gap-1.5 text-[14px] font-bold"><CheckCircle size={18} weight="fill" className="text-lime-deep" /> {t("enjoy it")} · {perk.item}</p>
        ) : mine?.status === "pending" ? (
          <p className="text-[13.5px] font-semibold">{t("got it. the host is checking your post.")}</p>
        ) : d?.left === 0 ? (
          <p className="text-[13.5px] font-semibold text-ink-soft">{t("they're all gone. next time come early.")}</p>
        ) : (
          <>
            {mine?.status === "rejected" && <p className="mb-2 text-[12.5px] font-semibold text-red-600">{mine.note || t("that one didn't count.")} {t("try another.")}</p>}
            <label className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-ink py-3 text-[14.5px] font-bold text-cream ${busy ? "opacity-60" : ""}`}>
              {busy ? <CircleNotch size={16} className="animate-spin" /> : <Camera size={17} weight="fill" />}
              {busy ? t("checking your post…") : t("i posted: send the screenshot")}
              <input type="file" accept="image/*" disabled={busy} className="hidden" onChange={(ev) => send(ev.target.files?.[0])} />
            </label>
          </>
        )}
        {err && <p className="mt-2 text-[12.5px] font-semibold text-red-600">{err}</p>}
      </div>

      {d?.claims && (
        <div className="border-t border-line/70 px-4 py-3">
          <p className="text-[12px] font-bold text-ink-soft">
            {t("posts")} · {d.claims.filter((c) => c.status === "approved" || c.status === "given").length} {t("approved")} · {d.claims.filter((c) => c.status === "given").length} {t("given")}
          </p>
          {!d.claims.length && <p className="mt-1 text-[13px] text-ink-soft">{t("nobody's posted yet.")}</p>}
          <div className="mt-2 space-y-2">
            {d.claims.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5">
                <a href={c.image} target="_blank" rel="noreferrer" className="h-14 w-10 shrink-0 overflow-hidden rounded-[0.5rem] bg-cream-deep">
                  {c.image && <img src={c.image} alt="" className="h-full w-full object-cover" />}
                </a>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold">{c.name.toLowerCase()} {c.ig && <span className="font-medium text-ink-soft">{c.ig}</span>}</p>
                  <p className="truncate text-[12px] text-ink-soft">{c.followers ? `${c.followers.toLocaleString()} ${t("followers")} · ` : ""}{t(c.status)}{c.note ? ` · ${c.note}` : ""}</p>
                </div>
                {c.status === "pending" && (
                  <div className="flex shrink-0 gap-1">
                    <button disabled={busy} onClick={() => post({ action: "decide", claim: c.id, ok: false })} className="rounded-full border border-line px-2.5 py-1.5 text-[12px] font-bold">{t("no")}</button>
                    <button disabled={busy} onClick={() => post({ action: "decide", claim: c.id, ok: true })} className="rounded-full bg-ink px-2.5 py-1.5 text-[12px] font-bold text-cream">{t("approve")}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
