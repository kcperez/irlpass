import { db } from "./_db.js"
import { getUser } from "./_lib.js"
import { page, send, esc } from "./_page.js"

// the partner venue's door qr (irlpass.xyz/v/<slug>). a member scans it, says
// how many came, and gets the perk on screen. every scan is a logged visit,
// which is what the venue's monthly report counts.
const SLUG = /^[a-z0-9-]{2,40}$/
const today = () => new Date().toISOString().slice(0, 10)

export default async function handler(req, res) {
  const slug = String(req.query?.slug || req.body?.slug || "").toLowerCase()
  if (!SLUG.test(slug)) return res.status(404).json({ error: "not found" })
  const { data: venue } = await db.from("venues").select("*").eq("slug", slug).maybeSingle()
  if (!venue || venue.status === "paused") {
    if (req.method === "GET") return send(res, page("irlpass", `<p class="k">irlpass</p><h1>this spot isn't on irlpass right now</h1><a class="btn" href="/">open irlpass</a>`))
    return res.status(404).json({ error: "not found" })
  }

  if (req.method === "GET") return send(res, doorPage(venue))
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })

  const { t, action } = req.body || {}
  const me = await getUser(t)
  if (!me || me.banned) return res.status(401).json({ error: "sign in to irlpass first" })

  try {
    if (action === "checkin") {
      const group = Math.max(1, Math.min(30, Number(req.body.group) || 1))
      const { error } = await db
        .from("venue_checkins")
        .upsert({ venue_slug: slug, member_no: me.memberNo, group_size: group, day: today() }, { onConflict: "venue_slug,member_no,day" })
      if (error) throw error
      return res.status(200).json({ ok: true, perk: venue.perk, storyPerk: venue.story_perk, name: me.name, memberNo: me.memberNo })
    }
    if (action === "story") {
      const url = String(req.body.url || "").trim().slice(0, 300)
      if (!/^https:\/\/(www\.)?instagram\.com\//.test(url)) return res.status(400).json({ error: "paste the instagram link to your story" })
      const { error } = await db.from("venue_stories").insert({ venue_slug: slug, member_no: me.memberNo, url })
      if (error) throw error
      return res.status(200).json({ ok: true })
    }
    if (action === "spend") {
      const usd = Math.max(0, Math.min(10000, Math.round(Number(req.body.usd) || 0)))
      await db.from("venue_checkins").update({ spend_usd: usd }).eq("venue_slug", slug).eq("member_no", me.memberNo).eq("day", today())
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ error: "unknown action" })
  } catch (e) {
    console.error("venue:", e.message)
    return res.status(500).json({ error: "something broke, show the bar this screen and try again" })
  }
}

function doorPage(v) {
  const ig = v.instagram ? `@${esc(String(v.instagram).replace(/^@/, ""))}` : esc(v.name)
  const body = `
<p class="k">irlpass partner · ${esc(v.city)}</p>
<h1>you're at ${esc(v.name)}</h1>
<div id="out" class="card">
  <p class="soft">sign in to irlpass to get your perk here.</p>
  <a class="btn" href="/?screen=auth">sign in</a>
</div>
<div id="in" class="card" hidden>
  <p><b>how many of you came?</b></p>
  <div class="chips" id="sizes">${[1, 2, 3, 4, 5, 6, 8, 10].map((n) => `<button class="chip" data-n="${n}">${n === 10 ? "10+" : n}</button>`).join("")}</div>
  <button id="go" disabled>get my perk</button>
</div>
<div id="perk" class="card" hidden>
  <p class="k">show this at the bar</p>
  <p class="perk">${esc(v.perk)}</p>
  <p class="soft" id="who"></p>
  <p class="soft" id="clock"></p>
</div>
<div id="story" class="card" hidden>
  <p><b>post a story</b></p>
  <p class="soft">tag ${ig} and @irlpass.xyz${v.story_perk ? `, and you also get ${esc(v.story_perk)}` : ""}. paste the link to your story here.</p>
  <input id="url" placeholder="https://instagram.com/stories/..." inputmode="url">
  <button id="save" class="alt">save my story</button>
  <p class="soft" id="saved"></p>
</div>
<div id="spend" class="card" hidden>
  <p><b>roughly what did your group spend?</b></p>
  <p class="soft">optional, it helps us bring more people here.</p>
  <div class="chips" id="spends">${[25, 50, 100, 200, 400].map((n) => `<button class="chip" data-n="${n}">$${n}${n === 400 ? "+" : ""}</button>`).join("")}</div>
</div>
<p class="soft" style="text-align:center;margin-top:24px"><a href="/">open irlpass</a></p>`
  const script = `
const slug=${JSON.stringify(v.slug)};let t=null;try{t=localStorage.getItem("irlpass_member_token")}catch(e){}
const $=(id)=>document.getElementById(id);let n=0
const post=(b)=>fetch("/api/venue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug,t,...b})}).then(r=>r.json())
if(t){$("out").hidden=true;$("in").hidden=false}
$("sizes").onclick=(e)=>{const b=e.target.closest(".chip");if(!b)return;n=+b.dataset.n;[...$("sizes").children].forEach(c=>c.classList.toggle("on",c===b));$("go").disabled=false}
$("go").onclick=async()=>{$("go").disabled=true;const r=await post({action:"checkin",group:n});if(!r.ok){alert(r.error);$("go").disabled=false;return}
$("in").hidden=true;$("perk").hidden=false;$("story").hidden=false;$("spend").hidden=false;$("who").textContent=r.name+" · member "+r.memberNo
const tick=()=>{$("clock").textContent=new Date().toLocaleString([], {weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit"})};tick();setInterval(tick,1000)}
$("save").onclick=async()=>{const r=await post({action:"story",url:$("url").value.trim()});$("saved").textContent=r.ok?"saved, thank you":r.error}
$("spends").onclick=async(e)=>{const b=e.target.closest(".chip");if(!b)return;[...$("spends").children].forEach(c=>c.classList.toggle("on",c===b));await post({action:"spend",usd:+b.dataset.n})}`
  return page(`${v.name} · irlpass`, body, script)
}
