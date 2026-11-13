import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { ArrowSquareOut, CheckCircle, CircleNotch, Gift, QrCode } from "@phosphor-icons/react"
import { t } from "../lib/i18n"

// the story perk on a hosted event. guests get it on a public page (no
// account needed): post a story, type your instagram, show the story + pass at
// the counter, staff double tap. hosts see who claimed, their story slots, the
// qr to print, and can top up slots.
const ASK = { story: "a story", post: "a post", reel: "a reel" }
const usd = (c) => `$${Math.round(c / 100)}`

export default function PerkCard({ token, e, me }) {
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(0)
  const [err, setErr] = useState("")
  const [qr, setQr] = useState("")
  const load = () => fetch(`/api/perks?t=${token}&id=${e.id}`).then((r) => r.json()).then((x) => !x.error && setD(x)).catch(() => {})
  useEffect(() => { load() }, [e.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const perk = d?.perk || e.perk
  const link = d?.link || `https://irlpass.xyz/p/${e.id}`
  const tags = [...new Set([...(perk.tags || []), "@irlpass.xyz"])]
  const handle = String(me?.ig || "").replace(/^@+/, "")

  const buy = async (slots) => {
    setBusy(slots); setErr("")
    const r = await fetch("/api/perks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ t: token, action: "buy", slots, id: e.id }) }).then((x) => x.json()).catch(() => ({ error: t("something broke. try again.") }))
    if (r.url) { window.location.href = r.url; return }
    setBusy(0); setErr(r.error || t("something broke. try again."))
  }
  const showQr = async () => setQr(qr ? "" : await QRCode.toDataURL(link, { width: 640, margin: 1 }))

  const h = d?.host
  const given = h ? h.claims.filter((c) => c.status === "given").length : 0

  return (
    <div className="mt-4 overflow-hidden rounded-[1.4rem] border border-white/70 bg-white/80 shadow-[0_10px_30px_-18px_rgba(58,50,44,0.4)]">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime"><Gift size={19} weight="fill" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">{perk.item}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{t("post")} {t(ASK[perk.ask] || ASK.story)} {t("tagging")} {tags.join(" ")}</p>
        </div>
        {d && <span className="shrink-0 rounded-full bg-cream-deep px-2 py-1 text-[11.5px] font-bold">{d.left} {t("left")}</span>}
      </div>

      {!h && (
        <div className="border-t border-line/70 px-4 py-3">
          {d?.mine?.status === "given" ? (
            <p className="flex items-center gap-1.5 text-[14px] font-bold"><CheckCircle size={18} weight="fill" className="text-lime-deep" /> {t("enjoy it")} · {perk.item}</p>
          ) : d?.mine ? (
            <a href={`/pass/${d.mine.code}`} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-[14.5px] font-bold text-cream">{t("open my pass")}</a>
          ) : d?.left === 0 ? (
            <p className="text-[13.5px] font-semibold text-ink-soft">{t("they're all gone. next time come early.")}</p>
          ) : (
            <a href={`/p/${e.id}${handle ? `?h=${encodeURIComponent(handle)}` : ""}`} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-[14.5px] font-bold text-cream">{t("i posted: get my pass")}</a>
          )}
          <p className="mt-2 text-center text-[12px] text-ink-soft">{t("show your story at the counter with the pass.")}</p>
        </div>
      )}

      {h && (
        <div className="border-t border-line/70 px-4 py-3">
          <p className="text-[12px] font-bold text-ink-soft">
            {h.claims.length} {t("claimed")} · {given} {t("given")} · {h.slots.free} {t("free left this month")}{h.slots.credits ? ` · ${h.slots.credits} ${t("bought")}` : ""}
          </p>
          {h.slots.left <= 5 && (
            <p className="mt-1.5 text-[12.5px] font-semibold text-red-600">{h.slots.left ? t("almost out of story slots") : t("out of story slots: guests can't claim until you add more")}</p>
          )}
          <div className="mt-2.5 flex gap-2">
            {h.packs.map((p) => (
              <button key={p.slots} disabled={!!busy} onClick={() => buy(p.slots)} className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-white py-2.5 text-[13px] font-bold">
                {busy === p.slots ? <CircleNotch size={14} className="animate-spin" /> : null}+{p.slots} {t("stories")} · {usd(p.cents)}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={showQr} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink py-2.5 text-[13px] font-bold text-cream"><QrCode size={15} weight="bold" /> {qr ? t("hide qr") : t("qr for the counter")}</button>
            <a href={link} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-white py-2.5 text-[13px] font-bold"><ArrowSquareOut size={15} weight="bold" /> {t("guest page")}</a>
          </div>
          {qr && (
            <a href={qr} download={`perk-${e.id}-qr.png`} className="mt-3 block">
              <img src={qr} alt="" className="mx-auto w-48 rounded-[0.8rem] bg-white p-2" />
              <p className="mt-1 text-center text-[12px] text-ink-soft">{t("tap to save, print it for the counter")}</p>
            </a>
          )}
          {err && <p className="mt-2 text-[12.5px] font-semibold text-red-600">{err}</p>}
          <div className="mt-3 space-y-1.5">
            {!h.claims.length && <p className="text-[13px] text-ink-soft">{t("nobody's claimed yet.")}</p>}
            {h.claims.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-[13.5px]">
                <a href={`https://instagram.com/${c.handle}`} target="_blank" rel="noreferrer" className="truncate font-bold">@{c.handle}</a>
                <span className={`shrink-0 text-[12px] font-semibold ${c.status === "given" ? "text-lime-deep" : "text-ink-soft"}`}>
                  {c.status === "given" ? `${t("given")} ${new Date(c.given_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()}` : t("claimed")}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-snug text-ink-soft">{t("first 20 verified stories each month are free. a story is used when staff double tap a pass.")}</p>
        </div>
      )}
    </div>
  )
}
