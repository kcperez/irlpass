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
const CITY = { miami: "Miami", "new-york": "New York", "los-angeles": "Los Angeles", medellin: "Medellín", palermo: "Palermo" }
const cityName = (c) => CITY[c] || String(c || "").replace(/-/g, " ")
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

// the guest perk pages: their own light, quiet design (think airbnb listing +
// apple wallet pass). one type family, one primary button, no decoration.
// guests skim this in a loud room, so each screen says exactly one thing.
const AV = (e, px) => e.cover
  ? `<img src="${esc(e.cover)}" alt="" width="${px}" height="${px}" style="display:block;width:${px}px;height:${px}px;border-radius:50%;object-fit:cover">`
  : `<span style="display:grid;place-items:center;width:${px}px;height:${px}px;border-radius:50%;background:#4a66ff;color:#fff;font-weight:600;font-size:${Math.round(px * 0.42)}px">${esc(String(e.venue || e.title || "?")[0]).toLowerCase()}</span>`
const CHECK = (px, sw = 2.6) => `<svg viewBox="0 0 24 24" width="${px}" height="${px}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`

function shell(title, body, { script = "", head = "" } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#15110f">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>${esc(title)}</title>${head}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet"><link href="https://api.fontshare.com/v2/css?f[]=chillax@600,700&display=swap" rel="stylesheet">
<style>
:root{--bg:#15110f;--ink:#f4eee7;--soft:rgba(244,238,231,.62);--faint:rgba(244,238,231,.38);--line:rgba(244,238,231,.1);--fill:rgba(244,238,231,.07);--blue:#4a66ff;--cream:#f4eee7}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{background:var(--bg)}
body:before{content:"";position:fixed;left:-20%;right:-20%;top:-30%;height:70%;z-index:-1;background:radial-gradient(50% 50% at 50% 50%,rgba(74,102,255,.22),transparent 70%);filter:blur(20px);pointer-events:none}
body{margin:0;color:var(--ink);font-family:Geist,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;font-size:16px;line-height:1.45;-webkit-font-smoothing:antialiased}
.d{font-family:Chillax,Geist,sans-serif;letter-spacing:-.03em}
main{max-width:440px;margin:0 auto;padding:max(20px,env(safe-area-inset-top)) 20px max(28px,env(safe-area-inset-bottom));min-height:100dvh;display:flex;flex-direction:column}
p{margin:0}
.venue{display:flex;align-items:center;gap:12px}
.venue b{font-weight:600;font-size:15px}.venue span{display:block;color:var(--soft);font-size:13px}
.title{font-family:Chillax,Geist,sans-serif;font-size:40px;line-height:1;font-weight:700;letter-spacing:-.035em;margin:28px 0 6px;text-wrap:balance}
.sub{color:var(--soft);font-size:17px}
.how{margin:26px 0 0;border-top:1px solid var(--line)}
.row{display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line);font-size:16px}
.n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--fill);display:grid;place-items:center;font-size:13px;font-weight:600;color:var(--soft)}
.row b{font-weight:600}
.dock{margin-top:auto;padding-top:28px}
.field{display:flex;align-items:center;height:56px;border-radius:14px;background:var(--fill);padding:0 16px;gap:4px;border:1.5px solid transparent;transition:border-color .15s}
.field:focus-within{border-color:var(--blue);background:rgba(74,102,255,.08)}
.field i{font-style:normal;color:var(--faint);font-size:17px}
.field input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:17px;color:var(--ink)}
.cta{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:56px;margin-top:10px;border:0;border-radius:14px;background:var(--blue);color:#fff;font:inherit;font-size:17px;font-weight:600;box-shadow:0 10px 26px -10px rgba(74,102,255,.75);text-decoration:none;cursor:pointer;transition:transform .1s,opacity .15s}
.cta:active{transform:scale(.985)}.cta:disabled{opacity:.4}
.ghost{background:var(--fill);color:var(--ink)}
.err{color:#ff8a7a;font-size:14px;margin-top:10px;min-height:1px}
.fine{color:var(--faint);font-size:13px;text-align:center;margin-top:14px}
.cw{perspective:1100px;margin:6px auto 0;max-width:400px;width:100%}
.pass{position:relative;aspect-ratio:1.586;border-radius:20px;overflow:hidden;color:#fff;padding:18px 20px 16px;display:flex;flex-direction:column;transform-style:preserve-3d;backface-visibility:hidden;-webkit-font-smoothing:antialiased;
background:radial-gradient(130% 150% at 0% 0%,#8c9cff 0%,#4a66ff 34%,#2a3fd6 66%,#141d6e 100%);
box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 -1px 0 rgba(0,0,0,.3),0 34px 60px -22px rgba(28,44,190,.95),0 14px 26px -14px rgba(0,0,0,.7);
transition:background .6s,color .6s,box-shadow .6s;animation:fl 7s ease-in-out infinite}
.pass:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.16;mix-blend-mode:overlay;background:repeating-radial-gradient(circle at 115% 120%,rgba(255,255,255,.7) 0 .6px,transparent .6px 6px)}
background:repeating-radial-gradient(circle at 115% 120%,rgba(255,255,255,.55) 0 1px,transparent 1px 7px),${"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.6'/></svg>\")"}}
.pass:after{content:"";position:absolute;inset:-40%;pointer-events:none;background:linear-gradient(115deg,transparent 38%,rgba(255,255,255,.38) 48%,rgba(255,255,255,.08) 54%,transparent 62%);transform:translateX(var(--sx,-60%));mix-blend-mode:soft-light;animation:sh 6s ease-in-out infinite}
.pass>*{position:relative;z-index:1}
@keyframes fl{0%,100%{transform:rotateX(5deg) rotateY(-7deg)}50%{transform:rotateX(3deg) rotateY(6deg)}}
@keyframes sh{0%,100%{transform:translateX(-55%)}50%{transform:translateX(35%)}}
.pass.live{animation:none}.pass.live:after{animation:none}
.pass .top{display:flex;align-items:center;gap:9px;font-weight:600;font-size:14px}
.pass .top img,.pass .top span:first-child{box-shadow:0 0 0 2px rgba(255,255,255,.7)}
.pass .brand{margin-left:auto;font-family:Chillax,Geist,sans-serif;font-weight:700;font-size:15px;letter-spacing:-.02em;opacity:.9}
.chip{width:40px;height:30px;border-radius:7px;margin:14px 0 0;background:linear-gradient(135deg,#f6f1e7 0%,#c9c0b1 38%,#fbf8f1 55%,#b7ad9c 100%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.18),0 1px 2px rgba(0,0,0,.3);position:relative}
.chip:before{content:"";position:absolute;inset:6px 8px;border:1px solid rgba(0,0,0,.22);border-radius:3px;border-left:0;border-right:0}
.chip:after{content:"";position:absolute;left:50%;top:5px;bottom:5px;border-left:1px solid rgba(0,0,0,.22)}
.pass .perk{font-family:Chillax,Geist,sans-serif;font-size:clamp(22px,7.2vw,30px);line-height:1;font-weight:700;letter-spacing:-.03em;margin:auto 0 12px;text-wrap:balance;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-shadow:0 1px 0 rgba(255,255,255,.18),0 -1px 0 rgba(0,0,0,.35)}
.fields{display:flex;gap:22px;align-items:flex-end}.fields div{min-width:0}
.fields small{display:block;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;opacity:.6;font-weight:600;margin-bottom:1px}
.fields b{font-weight:600;font-size:14.5px;display:flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.fields .no{margin-left:auto;text-align:right}
.pass.done{color:#15110f;background:radial-gradient(130% 150% at 0% 0%,#ffffff 0%,#f4eee7 40%,#e3d9ca 75%,#cfc3b0 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),inset 0 -1px 0 rgba(0,0,0,.12),0 34px 60px -22px rgba(0,0,0,.85),0 14px 26px -14px rgba(0,0,0,.6)}
.pass.done:before{mix-blend-mode:multiply;opacity:.12}
.pass.done .perk{text-shadow:0 1px 0 rgba(255,255,255,.9),0 -1px 0 rgba(0,0,0,.12)}
.pass.done .top img,.pass.done .top span:first-child{box-shadow:0 0 0 2px rgba(21,17,15,.12)}
.pass.lock .fields b{opacity:.75}
.state{text-align:center;margin:30px 0 0}
.state h2{font-family:Chillax,Geist,sans-serif;font-size:26px;font-weight:700;letter-spacing:-.025em;margin:14px 0 4px}
.state p{color:var(--soft)}
.spin{width:36px;height:36px;margin:0 auto;border-radius:50%;border:3px solid var(--line);border-top-color:var(--blue);animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.seal{width:56px;height:56px;margin:0 auto;border-radius:50%;background:var(--blue);color:#fff;display:grid;place-items:center;box-shadow:0 12px 28px -10px rgba(74,102,255,.8);animation:pop .45s cubic-bezier(.2,1.4,.4,1) both}
@keyframes pop{from{transform:scale(.3);opacity:0}to{transform:scale(1);opacity:1}}
.tags{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px}
.tags button{height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--fill);font:inherit;font-size:14px;font-weight:600;color:var(--ink);cursor:pointer}
.more{display:block;text-align:center;margin-top:18px;color:var(--soft);font-size:14px;text-decoration:none}
.more b{color:var(--ink);font-weight:600}
</style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ""}</body></html>`
}


// the pass, as a real card: chip, engraved lines, a sheen, a slow 3d float
const CARD = (e, { handle = "you", status = "locked", done = false, no = "", id = "pass", lock = false } = {}) => `<div class="cw"><div id="${id}" class="pass${done ? " done" : ""}${lock ? " lock" : ""}">
  <div class="top">${AV(e, 28)}<span>${esc(e.venue || e.title)}</span><span class="brand">irlpass</span></div>
  <div class="chip"></div>
  <p class="perk">${esc(e.perk.item)}</p>
  <div class="fields">
    <div><small>guest</small><b>@${esc(handle)}</b></div>
    <div><small>status</small><b id="${id}-st">${status}</b></div>
    ${no ? `<div class="no"><small>nº</small><b>${esc(no)}</b></div>` : ""}
  </div>
</div></div>`
// tilt with a finger or mouse; the card settles back into its float on release
const TILT = `(()=>{const p=document.querySelector(".pass");if(!p)return;const m=(x,y)=>{const r=p.getBoundingClientRect();const dx=(x-r.left)/r.width-.5,dy=(y-r.top)/r.height-.5;p.classList.add("live");p.style.transform="rotateX("+(-dy*12)+"deg) rotateY("+(dx*14)+"deg)";p.style.setProperty("--sx",(dx*90)+"%")};
const off=()=>{p.classList.remove("live");p.style.transform="";p.style.removeProperty("--sx")};
p.addEventListener("pointermove",ev=>m(ev.clientX,ev.clientY));p.addEventListener("pointerleave",off);p.addEventListener("touchmove",ev=>{const t=ev.touches[0];m(t.clientX,t.clientY)},{passive:true});p.addEventListener("touchend",off)})();`

async function claimPage(e) {
  const title = e.titles?.en || e.title
  if (over(e)) return gone("this one's over")
  const [left, s] = await Promise.all([perksLeft(e), slots(e.host_no)])
  const tags = tagsOf(e)
  const open = left > 0 && s.left > 0
  if (left > 0 && s.left <= 0) await tellHostOut(e)
  const auto = !!process.env.IG_TOKEN
  const body = `
<div class="venue">${AV(e, 44)}<div><b>${esc(e.venue || title)}</b><span>${e.city === "online" ? "online" : esc(cityName(e.city))}</span></div></div>
<p class="title">${esc(e.perk.item)}</p>
<p class="sub">free for one instagram story</p>
<div style="margin-top:22px">${CARD(e, { lock: true })}</div>
<div class="how">
  <div class="row"><span class="n">1</span><span>${e.perk.link ? "post a story about it" : "post a story here"}</span></div>
  <div class="row"><span class="n">2</span><span>tag <b>${tags.map(esc).join("</b> and <b>")}</b></span></div>
  <div class="row"><span class="n">3</span><span>${e.perk.link ? "it unlocks on your pass, right away" : auto ? "your pass unlocks on its own" : "show your pass at the counter"}</span></div>
</div>
<div class="dock">${open ? `
  <label class="field"><i>@</i><input id="h" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="instagram username" enterkeyhint="go"></label>
  <button id="go" class="cta">get my pass</button>
  <p id="err" class="err"></p>
  <p class="fine">${left < 20 ? `${left} left · ` : ""}no app needed</p>` : `<p class="sub" style="text-align:center">all claimed for now. check back soon.</p>`}
</div>`
  const script = `
const h=document.getElementById("h"),b=document.getElementById("go"),err=document.getElementById("err");
try{const q=new URLSearchParams(location.search).get("h");if(q&&h)h.value=q;const k=localStorage.getItem("perk-${e.id}${standing(e) ? `-${today()}` : ""}");if(k)location.replace("/pass/"+k)}catch(e){}
h&&h.addEventListener("keydown",x=>{if(x.key==="Enter")b.click()});
b&&b.addEventListener("click",async()=>{err.textContent="";b.disabled=true;
const r=await fetch("/api/perk-page",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"claim",id:${e.id},handle:h.value})}).then(x=>x.json()).catch(()=>({error:"no signal. try again."}));
if(r.code){try{localStorage.setItem("perk-${e.id}${standing(e) ? `-${today()}` : ""}",r.code)}catch(e){}location.href="/pass/"+r.code}else{err.textContent=r.error||"try again";b.disabled=false}});
${TILT}`
  return shell(`${e.perk.item} at ${e.venue || title}`, body, { script, head: `
<meta property="og:title" content="${esc(`${e.perk.item} for a story`)}">
<meta property="og:description" content="${esc(`${title}${e.venue ? ` at ${e.venue}` : ""}. post a story, get ${e.perk.item}.`)}">
${e.cover ? `<meta property="og:image" content="${esc(e.cover)}">` : ""}` })
}

async function passPage(code) {
  const { data: c } = await db.from("perk_claims").select("*").eq("code", code).maybeSingle()
  const e = c && (await getEvent(c.event_id))
  if (!e) return gone("that pass is gone")
  const given = c.status === "given"
  const auto = !!process.env.IG_TOKEN
  const tags = tagsOf(e)
  const at = given ? new Date(c.given_at).toLocaleTimeString("en-US", { timeZone: TZ[e.city] || "UTC", hour: "numeric", minute: "2-digit" }).toLowerCase() : ""
  const n = await goingCount(e.id)
  const body = `
${CARD(e, { handle: c.handle, status: given ? `${CHECK(14, 3)} redeemed` : "waiting", done: given, no: String(c.id || "").padStart(4, "0").slice(-4) })}
<div id="wait" class="state" style="${given ? "display:none" : ""}">
  <div class="spin"></div>
  <h2>${auto ? "waiting for your story" : "show this at the counter"}</h2>
  <p>${auto ? "this unlocks a few seconds after you post" : "staff will check your story"}</p>
  <div class="tags">${tags.map((t) => `<button data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
</div>
<div id="done" class="state" style="${given ? "" : "display:none"}">
  <div class="seal">${CHECK(28, 3)}</div>
  <h2>${e.perk.link ? "it's yours" : "you're all set"}</h2>
  <p id="at">${given ? (e.perk.link ? `unlocked · ${at}` : `show this to staff · ${at}`) : ""}</p>
</div>
<div class="dock">
  <a id="dl" class="cta" href="${given && e.perk.link ? esc(e.perk.link) : "#"}" target="_blank" rel="noopener" style="${given && e.perk.link ? "" : "display:none"};margin-bottom:6px">open ${esc(e.perk.item)} →</a>
  <a id="ig" class="cta" href="instagram://story-camera" style="${given ? "display:none" : ""}">open instagram</a>
  <a id="more" class="more" href="${standing(e) ? "/" : `/e/${e.id}`}" style="${given ? "" : "display:none"}">${n > 1 ? `<b>${n} people</b> from irlpass are here · ` : ""}<b>see what's on tonight →</b></a>
</div>`
  const script = `
${TILT}
document.querySelectorAll(".tags button").forEach(c=>c.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(c.dataset.t)}catch(e){}const t=c.textContent;c.textContent="copied";setTimeout(()=>c.textContent=t,1200)}));
${given ? "" : `
const done=(link)=>{clearInterval(poll);if(link){const d=document.getElementById("dl");d.href=link;d.style.display=""}document.getElementById("pass").classList.add("done");document.getElementById("pass-st").innerHTML='${CHECK(16, 3)} redeemed';document.getElementById("wait").style.display="none";document.getElementById("done").style.display="";document.getElementById("ig").style.display="none";document.getElementById("more").style.display="";document.getElementById("at").textContent=(link?"unlocked · ":"show this to staff · ")+new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}).toLowerCase();try{navigator.vibrate&&navigator.vibrate([12,40,18])}catch(e){}};
const poll=setInterval(async()=>{if(document.hidden)return;const r=await fetch("/api/perk-page?code=${code}&json=1").then(x=>x.json()).catch(()=>null);if(r&&r.given)done(r.link)},3000);`}`
  return shell(`${e.perk.item} · your pass`, body, { script })
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      if (req.query?.code && req.query?.json) {
        const { data: c } = await db.from("perk_claims").select("status, event_id").eq("code", String(req.query.code).slice(0, 40)).maybeSingle()
        const given = c?.status === "given"
        // a digital perk's link only leaves the server once the story is verified
        const link = given ? (await getEvent(c.event_id))?.perk?.link || null : null
        return res.status(200).json({ given, link })
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
