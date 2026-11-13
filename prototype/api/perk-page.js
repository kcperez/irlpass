import crypto from "crypto"
import { db } from "./_db.js"
import { page, esc, send } from "./_page.js"
import { ASK, cleanHandle, okHandle, perksLeft, slots, standing, tellHostOut, useSlot } from "./_perks.js"

// the story perk, for anyone. no irlpass account needed.
// GET  /p/<event id>    -> claim page: what to post, type your instagram, get a pass
// GET  /pass/<code>     -> the pass: live clock, staff double tap to give it
// POST { action: "claim", id, handle } -> { code }
// POST { action: "given", code }       -> { ok } (uses one of the host's story slots)
const TZ = { miami: "America/New_York", "new-york": "America/New_York", "los-angeles": "America/Los_Angeles", medellin: "America/Bogota", palermo: "Europe/Rome" }
const over = (e) => !standing(e) && Date.now() > Date.parse(e.ends_at || e.starts_at) + 12 * 3600e3
const tagsOf = (e) => [...new Set([...(e.perk?.tags || []), "@irlpass.xyz"])]

async function getEvent(id) {
  const { data } = id ? await db.from("events").select("id, title, titles, city, venue, cover, starts_at, ends_at, perk, host_no, hidden, source").eq("id", id).maybeSingle() : { data: null }
  return data && !data.hidden && data.perk ? data : null
}

async function goingCount(id) {
  const { count } = await db.from("event_going").select("event_id", { count: "exact", head: true }).eq("event_id", id)
  return count || 0
}

const gone = (msg) => page("irlpass", `<p class="k">irlpass</p><h1>${esc(msg)}</h1><a class="btn" href="/">see what's on</a>`)

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
  <button id="go">get my pass</button>
  <p id="err" style="color:#c0392b;font-size:13px;margin:8px 0 0"></p>
  <p class="soft" style="font-size:13px;margin:10px 0 0;text-align:center">${left} left</p>` : `<p style="margin:0;font-weight:600">all claimed for now. ask at the counter.</p>`}
</div>
${upsell(e, await goingCount(e.id))}`
  const script = `
const h=document.getElementById("h"),b=document.getElementById("go"),err=document.getElementById("err");
try{const q=new URLSearchParams(location.search).get("h");if(q&&h)h.value=q;const k=localStorage.getItem("perk-${e.id}${standing(e) ? `-${today()}` : ""}");if(k)location.replace("/pass/"+k)}catch(e){}
b&&b.addEventListener("click",async()=>{err.textContent="";b.disabled=true;
const r=await fetch("/api/perk-page",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"claim",id:${e.id},handle:h.value})}).then(x=>x.json()).catch(()=>({error:"no signal. try again."}));
if(r.code){try{localStorage.setItem("perk-${e.id}${standing(e) ? `-${today()}` : ""}",r.code)}catch(e){}location.href="/pass/"+r.code}else{err.textContent=r.error||"try again";b.disabled=false}});`
  let html = page(`${e.perk.item} at ${e.venue || title}`, body, script)
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
<div id="pass" style="margin-top:10px;border-radius:24px;padding:22px;color:#3a322c;user-select:none;-webkit-user-select:none;touch-action:manipulation;cursor:pointer;
${given ? "background:#e7e1d9" : "background:linear-gradient(110deg,#ddd0f6,#f8d9c6,#cdee45,#ddd0f6);background-size:300% 100%;animation:mv 4s linear infinite"}">
  <p class="k" style="margin:0;color:#3a322c">${given ? "given" : "show this + your story"}</p>
  <p class="perk" style="margin:6px 0 2px">${esc(e.perk.item)}</p>
  <p style="margin:0;font-size:22px;font-weight:700">@${esc(c.handle)}</p>
  <p id="clock" style="margin:8px 0 0;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums">${given ? new Date(c.given_at).toLocaleTimeString("en-US", { timeZone: TZ[e.city] || "UTC", hour: "numeric", minute: "2-digit" }).toLowerCase() : ""}</p>
</div>
<p id="msg" style="text-align:center;font-weight:600;margin:14px 0 0">${given ? "enjoy it ✨" : `staff: check <b>@${esc(c.handle)}</b>'s story tagging ${tags.map(esc).join(" ")} in their instagram app, then double tap the pass`}</p>
${upsell(e, await goingCount(e.id))}
<style>@keyframes mv{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}</style>`
  const script = given ? "" : `
const clock=document.getElementById("clock"),pass=document.getElementById("pass"),msg=document.getElementById("msg");
const tick=()=>clock.textContent=new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit",second:"2-digit"}).toLowerCase();tick();const iv=setInterval(tick,1000);
let last=0,busy=false;
pass.addEventListener("click",async()=>{const now=Date.now();if(now-last>450){last=now;return}last=0;if(busy)return;busy=true;
msg.textContent="one sec…";
const r=await fetch("/api/perk-page",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"given",code:${JSON.stringify(code)}})}).then(x=>x.json()).catch(()=>({error:"no signal. try again."}));
busy=false;
if(r.ok){clearInterval(iv);pass.style.animation="none";pass.style.background="#e7e1d9";pass.querySelector(".k").textContent="given";msg.textContent="enjoy it ✨"}else{msg.textContent=r.error||"try again"}});`
  return page(`${e.perk.item} · your pass`, body, script)
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
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

    if (action === "given") {
      const { data: c } = await db.from("perk_claims").select("*").eq("code", String(req.body?.code || "")).maybeSingle()
      if (!c) return res.status(404).json({ error: "that pass is gone" })
      if (c.status === "given") return res.status(409).json({ error: "already given" })
      const e = await getEvent(c.event_id)
      if (!e) return res.status(404).json({ error: "that perk is gone" })
      if (!(await useSlot(e.host_no))) { await tellHostOut(e); return res.status(402).json({ error: "the venue is out of story slots. ask the host to add more." }) }
      const { data: done } = await db.from("perk_claims").update({ status: "given", given_at: new Date().toISOString() }).eq("id", c.id).eq("status", "claimed").select("id")
      if (!done?.length) return res.status(409).json({ error: "already given" })
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ error: "unknown action" })
  } catch (err) {
    console.error("perk page error:", err)
    return res.status(500).json({ error: "something broke. try again." })
  }
}
