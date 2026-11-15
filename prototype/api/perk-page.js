import crypto from "crypto"
import { db } from "./_db.js"
import { glass, esc, send } from "./_page.js"
import { giveFromMention, mentionedRecently } from "./ig-webhook.js"
import { ASK, cleanHandle, okHandle, perksLeft, slots, standing, tellHostOut, useSlot } from "./_perks.js"

// the story perk, for anyone. no irlpass account needed.
// GET  /p/<event id>    -> claim page: what to post, type your instagram, get a pass
// GET  /pass/<code>     -> the pass: live clock, flips to given when staff tap give on their list
// POST { action: "claim", id, handle } -> { code }
// POST { action: "given", code }       -> { ok } (uses one of the host's story slots)
const TZ = { miami: "America/New_York", "new-york": "America/New_York", "los-angeles": "America/Los_Angeles", medellin: "America/Bogota", palermo: "Europe/Rome" }
const over = (e) => !standing(e) && Date.now() > Date.parse(e.ends_at || e.starts_at) + 12 * 3600e3
// the irlpass ticket tile, for passes without a venue picture
const MARK_TILE = `<svg viewBox="0 0 64 64" width="46" height="46" aria-hidden="true"><defs><linearGradient id="pt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a8dff"/><stop offset="1" stop-color="#2c45e6"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#pt)"/><path d="M17 22h30a3 3 0 0 1 3 3v4a4 4 0 0 0 0 8v4a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3v-4a4 4 0 0 0 0-8v-4a3 3 0 0 1 3-3z" fill="#fff"/><path d="M38 24v18" stroke="#4a66ff" stroke-width="2" stroke-dasharray="2.5 3"/></svg>`
const tagsOf = (e) => [...new Set([...(e.perk?.tags || []), "@irlpass.xyz"])]

async function getEvent(id) {
  const { data } = id ? await db.from("events").select("id, title, titles, city, venue, cover, starts_at, ends_at, perk, host_no, hidden, source").eq("id", id).maybeSingle() : { data: null }
  return data && !data.hidden && data.perk ? data : null
}

async function goingCount(id) {
  const { count } = await db.from("event_going").select("event_id", { count: "exact", head: true }).eq("event_id", id)
  return count || 0
}

const gone = (msg) => glass("irlpass", `<p class="k">irlpass</p><h1>${esc(msg)}</h1><a class="btn" href="/">see what's on</a>`)

const today = () => new Date().toISOString().slice(0, 10)
// a guest's claim: one per event, or one a day at a venue's always-on perk
const mine = (e, handle) => {
  const q = db.from("perk_claims").select("code").eq("event_id", e.id).eq("handle", handle)
  return (standing(e) ? q.eq("claim_day", today()) : q.order("created_at").limit(1)).maybeSingle()
}

function upsell(e, n) {
  if (standing(e)) return `<div class="card" style="text-align:center">
  <p style="margin:0 0 10px;font-weight:600">see what's on tonight near ${esc(e.venue || "you")}</p>
  <a class="btn" href="/">open irlpass</a>
  <p class="soft" style="font-size:13px;margin:10px 0 0">events, people and group chats in your city.</p>
</div>`
  return `<div class="card" style="text-align:center">
  <p style="margin:0 0 10px;font-weight:600">${n ? `${n} ${n === 1 ? "person" : "people"} from irlpass ${n === 1 ? "is" : "are"} going` : "meet the people here tonight"}</p>
  <a class="btn" href="/e/${e.id}">join the group chat</a>
  <p class="soft" style="font-size:13px;margin:10px 0 0">free, takes 30 seconds.</p>
</div>`
}

// the perk pages are picture-first: big perk, three icon steps, one button.
// guests skim on a phone in a loud room, so every screen says one thing.
const AVATAR = (e, px) => e.cover
  ? `<img src="${esc(e.cover)}" alt="" style="display:block;width:${px}px;height:${px}px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 3px rgba(255,255,255,.9)">`
  : MARK_TILE.replace(/width="46" height="46"/, `width="${px}" height="${px}"`)
const STEP = (icon, word, sub) => `<div class="st"><div class="si">${icon}</div><b>${word}</b>${sub ? `<span>${sub}</span>` : ""}</div>`
const IC = {
  cam: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="4"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/></svg>`,
  at: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S9 9 12 9zm0 0c2-4 6-4 6-1.5S15 9 12 9z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="54" height="54" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
}
const CSS = `<style>
.hero{text-align:center;margin-top:8px}.hero .av{display:inline-block;margin-bottom:10px}
.big{font-family:Chillax,Geist,sans-serif;font-weight:700;font-size:44px;line-height:.98;letter-spacing:-.035em;margin:6px 0 4px;text-wrap:balance}
.steps{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:start;gap:4px;margin:22px 0 4px;text-align:center}
.st{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:13px;min-width:0}.st b{font-size:14px}.st span{font-size:11.5px;color:var(--faint);line-height:1.35}
.si{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:rgba(74,102,255,.16);color:#8fa0ff;border:1px solid rgba(122,141,255,.35)}
.ar{color:var(--faint);font-size:18px;margin-top:18px}
.hin{display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:18px;padding:0 16px;background:rgba(255,255,255,.04)}
.hin b{font-size:20px;color:var(--faint)}.hin input{border:0!important;background:transparent!important;padding:16px 0!important;font-size:18px!important;box-shadow:none!important;margin:0!important}
.chip{display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border-radius:999px;border:1px solid var(--line);font-weight:600;font-size:14px;background:rgba(255,255,255,.05);cursor:pointer}
.dot{width:10px;height:10px;border-radius:50%;background:#7a8dff;box-shadow:0 0 0 0 rgba(122,141,255,.7);animation:pl 1.6s infinite}
@keyframes pl{0%{box-shadow:0 0 0 0 rgba(122,141,255,.7)}100%{box-shadow:0 0 0 14px rgba(122,141,255,0)}}
@keyframes mv{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes pop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
.ok{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;margin:0 auto;background:#2fd27a;color:#fff;animation:pop .5s ease-out both;box-shadow:0 18px 40px -12px rgba(47,210,122,.7)}
</style>`

async function claimPage(e) {
  const title = e.titles?.en || e.title
  if (over(e)) return gone("this one's over")
  const [left, s] = await Promise.all([perksLeft(e), slots(e.host_no)])
  const tags = tagsOf(e)
  const open = left > 0 && s.left > 0
  if (left > 0 && s.left <= 0) await tellHostOut(e)
  const body = `${CSS}
<div class="hero">
  <div class="av">${AVATAR(e, 64)}</div>
  <p class="k" style="margin:0">${esc(e.venue || title)}</p>
  <p class="big">${esc(e.perk.item)}</p>
  <p class="soft" style="margin:0;font-weight:600">free, for 1 story</p>
</div>
<div class="steps">
  ${STEP(IC.cam, "post", "a story")}<span class="ar">→</span>
  ${STEP(IC.at, "tag", tags.map(esc).join("<br>"))}<span class="ar">→</span>
  ${STEP(IC.gift, "it's yours", process.env.IG_TOKEN ? "unlocks itself" : "show the counter")}
</div>
${open ? `
<div class="card" style="margin-top:20px">
  <div class="hin"><b>@</b><input id="h" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="your instagram"></div>
  <button id="go" class="block" style="margin-top:12px;font-size:17px;padding:16px">get my pass</button>
  <p id="err" class="err"></p>
  ${left < 20 ? `<p class="soft" style="font-size:13px;margin:10px 0 0;text-align:center">only ${left} left</p>` : ""}
</div>` : `<div class="card" style="text-align:center;margin-top:20px"><p style="margin:0;font-weight:700;font-size:18px">all claimed for now</p></div>`}`
  const script = `
const h=document.getElementById("h"),b=document.getElementById("go"),err=document.getElementById("err");
try{const q=new URLSearchParams(location.search).get("h");if(q&&h)h.value=q;const k=localStorage.getItem("perk-${e.id}${standing(e) ? `-${today()}` : ""}");if(k)location.replace("/pass/"+k)}catch(e){}
h&&h.addEventListener("keydown",x=>{if(x.key==="Enter")b.click()});
b&&b.addEventListener("click",async()=>{err.textContent="";b.disabled=true;
const r=await fetch("/api/perk-page",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"claim",id:${e.id},handle:h.value})}).then(x=>x.json()).catch(()=>({error:"no signal. try again."}));
if(r.code){try{localStorage.setItem("perk-${e.id}${standing(e) ? `-${today()}` : ""}",r.code)}catch(e){}location.href="/pass/"+r.code}else{err.textContent=r.error||"try again";b.disabled=false}});`
  let html = glass(`${e.perk.item} at ${e.venue || title}`, body, { script })
  html = html.replace("</title>", `</title>
<meta property="og:title" content="${esc(`${e.perk.item} for a story`)}">
<meta property="og:description" content="${esc(`${title}${e.venue ? ` at ${e.venue}` : ""}. post a story, get ${e.perk.item}.`)}">
${e.cover ? `<meta property="og:image" content="${esc(e.cover)}">` : ""}`)
  return html
}

async function passPage(code) {
  const { data: c } = await db.from("perk_claims").select("*").eq("code", code).maybeSingle()
  const e = c && (await getEvent(c.event_id))
  if (!e) return gone("that pass is gone")
  const given = c.status === "given"
  const auto = !!process.env.IG_TOKEN
  const tags = tagsOf(e)
  const at = given ? new Date(c.given_at).toLocaleTimeString("en-US", { timeZone: TZ[e.city] || "UTC", hour: "numeric", minute: "2-digit" }).toLowerCase() : ""
  const body = `${CSS}
<div id="pass" style="margin-top:6px;border-radius:28px;padding:26px 22px;text-align:center;box-shadow:0 30px 70px -20px rgba(74,102,255,.6);user-select:none;-webkit-user-select:none;
${given ? "background:#f4eee7;color:#15110f" : "color:#fff;background:linear-gradient(110deg,#3d5cff,#7a8dff,#2c45e6,#3d5cff);background-size:300% 100%;animation:mv 4s linear infinite"}">
  <div style="display:inline-block">${AVATAR(e, 58)}</div>
  <p class="big" style="font-size:40px;margin:12px 0 6px">${esc(e.perk.item)}</p>
  <p style="margin:0;font-size:18px;font-weight:700;opacity:.85">@${esc(c.handle)}</p>
</div>
<div id="wait" style="${given ? "display:none" : ""}">
  <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:22px 0 6px;font-weight:700;font-size:19px"><span class="dot"></span>${auto ? "waiting for your story" : "show this at the counter"}</div>
  <p class="soft" style="text-align:center;margin:0 0 16px">tag both, tap to copy</p>
  <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${tags.map((t) => `<span class="chip" data-t="${esc(t)}">${esc(t)}</span>`).join("")}</div>
  <a class="btn block" href="instagram://story-camera" style="margin-top:18px;font-size:17px;padding:16px;display:flex;justify-content:center;gap:10px;align-items:center">${IC.cam.replace(/width="26" height="26"/, 'width="22" height="22"')} open instagram</a>
</div>
<div id="done" style="${given ? "" : "display:none"};text-align:center;margin-top:24px">
  <div class="ok">${IC.check}</div>
  <p class="big" style="font-size:34px;margin:14px 0 2px">enjoy it</p>
  <p class="soft" style="margin:0" id="at">${at ? `given at ${at}` : ""}</p>
</div>
<div id="up" style="margin-top:22px;${given ? "" : "display:none"}">${upsell(e, await goingCount(e.id))}</div>`
  const script = `
document.querySelectorAll(".chip").forEach(c=>c.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(c.dataset.t)}catch(e){}const t=c.textContent;c.textContent="copied ✓";setTimeout(()=>c.textContent=t,1200)}));
${given ? "" : `
const pass=document.getElementById("pass");
const done=()=>{clearInterval(poll);pass.style.animation="none";pass.style.background="#f4eee7";pass.style.color="#15110f";document.getElementById("wait").style.display="none";document.getElementById("done").style.display="";document.getElementById("up").style.display="";document.getElementById("at").textContent="given at "+new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}).toLowerCase();try{navigator.vibrate&&navigator.vibrate([12,40,18])}catch(e){}};
const poll=setInterval(async()=>{if(document.hidden)return;const r=await fetch("/api/perk-page?code=${code}&json=1").then(x=>x.json()).catch(()=>null);if(r&&r.given)done()},3000);`}`
  return glass(`${e.perk.item} · your pass`, body, { script })
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      if (req.query?.code && req.query?.json) {
        const { data: c } = await db.from("perk_claims").select("status").eq("code", String(req.query.code).slice(0, 40)).maybeSingle()
        return res.status(200).json({ given: c?.status === "given" })
      }
      if (req.query?.code) return send(res, await passPage(String(req.query.code).slice(0, 40)))
      const e = await getEvent(Number(req.query?.id))
      if (!e) return send(res, gone("that perk is gone"))
      return send(res, await claimPage(e))
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
    const action = req.body?.action

    if (action === "claim") {
      const e = await getEvent(Number(req.body?.id))
      if (!e || over(e)) return res.status(404).json({ error: "this one's over" })
      const handle = cleanHandle(req.body?.handle)
      if (!okHandle(handle)) return res.status(400).json({ error: "type your instagram handle, like @yourname" })
      const { data: had } = await mine(e, handle)
      if (had) return res.status(200).json({ code: had.code })
      if ((await perksLeft(e)) <= 0) return res.status(409).json({ error: "they're all claimed" })
      if ((await slots(e.host_no)).left <= 0) { await tellHostOut(e); return res.status(409).json({ error: "all claimed for now. ask at the counter." }) }
      const code = crypto.randomBytes(8).toString("base64url")
      const { error } = await db.from("perk_claims").insert({ event_id: e.id, host_no: e.host_no, handle, code })
      if (error) {
        const { data: again } = await mine(e, handle)
        if (again) return res.status(200).json({ code: again.code })
        throw error
      }
      // story already up? instagram told us before they claimed: give it now
      if (await mentionedRecently(handle).catch(() => false)) await giveFromMention(handle).catch(() => 0)
      return res.status(200).json({ code })
    }

    // giving happens on the host's list only, never from the guest's phone
    if (action === "given") return res.status(403).json({ error: "staff give it from their list" })
    return res.status(400).json({ error: "unknown action" })
  } catch (err) {
    console.error("perk page error:", err)
    return res.status(500).json({ error: "something broke. try again." })
  }
}
