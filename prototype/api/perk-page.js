import crypto from "crypto"
import { db } from "./_db.js"
import { glass, esc, send } from "./_page.js"
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

async function claimPage(e) {
  const title = e.titles?.en || e.title
  const when = new Date(e.starts_at).toLocaleString("en-US", { timeZone: TZ[e.city] || "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toLowerCase()
  if (over(e)) return gone("this one's over")
  const [left, s] = await Promise.all([perksLeft(e), slots(e.host_no)])
  const tags = tagsOf(e)
  const open = left > 0 && s.left > 0
  if (left > 0 && s.left <= 0) await tellHostOut(e)
  const body = `
${e.cover ? `<img src="${esc(e.cover)}" alt="" style="width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:22px;display:block">` : ""}
<p class="k" style="margin-top:18px">${standing(e) ? "every day" : esc(when)}${e.venue ? ` · ${esc(e.venue)}` : ""}</p>
<h1>${esc(title)}</h1>
<div class="card">
  <p class="k" style="margin:0">free for you</p>
  <p class="perk" style="margin:4px 0 14px">${esc(e.perk.item)}</p>
  ${open ? `
  <p style="margin:0 0 6px"><b>1.</b> post ${esc(ASK[e.perk.ask] || ASK.story)} tagging <b>${tags.map(esc).join(" ")}</b></p>
  <p style="margin:0 0 6px"><b>2.</b> type your instagram below</p>
  <p style="margin:0 0 14px"><b>3.</b> show your story at the counter</p>
  <label for="h">your instagram</label>
  <input id="h" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="@yourhandle">
  <button id="go" class="block" style="margin-top:12px">get my pass</button>
  <p id="err" class="err"></p>
  <p class="soft" style="font-size:13px;margin:10px 0 0;text-align:center">${left} left</p>` : `<p style="margin:0;font-weight:600">all claimed for now. ask at the counter.</p>`}
</div>
${upsell(e, await goingCount(e.id))}`
  const script = `
const h=document.getElementById("h"),b=document.getElementById("go"),err=document.getElementById("err");
try{const q=new URLSearchParams(location.search).get("h");if(q&&h)h.value=q;const k=localStorage.getItem("perk-${e.id}${standing(e) ? `-${today()}` : ""}");if(k)location.replace("/pass/"+k)}catch(e){}
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
  const tags = tagsOf(e)
  const body = `
<p class="k">${esc(e.venue || e.titles?.en || e.title)}</p>
<div id="pass" style="margin-top:10px;border-radius:24px;padding:22px;box-shadow:0 30px 70px -20px rgba(74,102,255,.6);user-select:none;-webkit-user-select:none;touch-action:manipulation;cursor:pointer;
${given ? "background:#f4eee7;color:#15110f" : "color:#fff;background:linear-gradient(110deg,#3d5cff,#7a8dff,#2c45e6,#3d5cff);background-size:300% 100%;animation:mv 4s linear infinite"}">
  <div style="float:right;margin:0 0 8px 12px">${e.cover ? `<img src="${esc(e.cover)}" alt="" style="display:block;width:76px;height:76px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 3px rgba(255,255,255,.95)">` : MARK_TILE.replace(/width="46" height="46"/, 'width="76" height="76"')}</div>
  <p class="k" style="margin:0;color:inherit;opacity:.75">${given ? "given" : "unlocked · show this + your story"}</p>
  <p class="perk" style="margin:6px 0 2px">${esc(e.perk.item)}</p>
  <p style="margin:0;font-size:22px;font-weight:700">@${esc(c.handle)}</p>
  <p id="clock" style="clear:both;margin:8px 0 0;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums">${given ? new Date(c.given_at).toLocaleTimeString("en-US", { timeZone: TZ[e.city] || "UTC", hour: "numeric", minute: "2-digit" }).toLowerCase() : ""}</p>
</div>
<p id="msg" style="text-align:center;font-weight:600;margin:14px 0 0">${given ? "enjoy it ✨" : `show staff this pass and your story tagging ${tags.map(esc).join(" ")}. they give it from their list.`}</p>
${upsell(e, await goingCount(e.id))}
<style>@keyframes mv{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}</style>`
  const script = given ? "" : `
const clock=document.getElementById("clock"),pass=document.getElementById("pass"),msg=document.getElementById("msg");
const tick=()=>clock.textContent=new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit",second:"2-digit"}).toLowerCase();tick();const iv=setInterval(tick,1000);
// staff give it from their list: watch for it and flip the pass
const done=()=>{clearInterval(iv);clearInterval(poll);pass.style.animation="none";pass.style.background="#f4eee7";pass.style.color="#15110f";pass.querySelector(".k").textContent="given";clock.textContent=new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}).toLowerCase();msg.textContent="enjoy it ✨";try{navigator.vibrate&&navigator.vibrate([12,40,18])}catch(e){}};
const poll=setInterval(async()=>{if(document.hidden)return;const r=await fetch("/api/perk-page?code=${code}&json=1").then(x=>x.json()).catch(()=>null);if(r&&r.given)done()},3000);`
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
