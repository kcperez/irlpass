import crypto from "crypto"
import QRCode from "qrcode"
import { db } from "./_db.js"
import { esc, glass, send } from "./_page.js"
import { sendEmail } from "./_email.js"
import { kindOf } from "./_events.js"
import { ASK, FREE, PACKS, addCredits, cleanHandle, monthStart, okHandle, slots, useSlot } from "./_perks.js"

// getty by irlpass (getty.irlpass.xyz, also irlpass.xyz/venues). a venue signs up in a minute, gets an
// always-on story perk with a qr for the counter, and the guestlist: every
// handle that posted for them. no irlpass account, no meta access.
// GET  ?view=landing|start|in          -> pages
// GET  ?view=dash&k=<owner token>      -> the guestlist (&json=1 for the live list, &session_id= back from stripe)
// GET  ?view=dash&k=&print=1          -> the counter card to print
// POST { action: "create", name, ig, city, email, item, qty }   -> { url }
// POST { action: "login", email }                              -> emails the dashboard link
// POST { k, action: "perk", item, qty, ask }                   -> edit the perk
// POST { k, action: "give", id }                               -> mark a claim given from the dashboard
// POST { k, action: "buy", slots }                             -> stripe checkout url
const SITE = "https://irlpass.xyz"
const CITIES = { miami: "Miami", "new-york": "New York", "los-angeles": "Los Angeles", medellin: "Medellín", palermo: "Palermo" }
const TZ = { miami: "America/New_York", "new-york": "America/New_York", "los-angeles": "America/Los_Angeles", medellin: "America/Bogota", palermo: "Europe/Rome" }
const stripeKey = () => (process.env.STRIPE_MODE === "test" ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_SECRET_KEY)
const slugify = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36)
const clean = (s, n = 80) => String(s || "").trim().slice(0, n)
const GETTY = "https://getty.irlpass.xyz"
const dashUrl = (k) => `${GETTY}/g/${k}`
const usd = (c) => `$${Math.round(c / 100)}`

const NAV = (right = `<a class="btn ghost" href="${GETTY}/in" style="padding:10px 16px;font-size:14px">sign in</a>`) =>
  `<nav class="nav"><a class="logo" href="${GETTY}/">getty<span>by irlpass</span></a>${right}</nav>`

async function byToken(k) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(k || ""))) return null
  const { data } = await db.from("venues").select("*").eq("owner_token", k).maybeSingle()
  return data && data.status !== "paused" ? data : null
}
async function perkEvent(v) {
  if (!v.perk_event_id) return null
  const { data } = await db.from("events").select("id, title, perk, city, host_no, source").eq("id", v.perk_event_id).maybeSingle()
  return data
}

// ---------- pages ----------

// the hero: not one story, a whole night of them. stories fly in, each with
// its own view count ticking, mentions stack up, one big number climbs.
const STORIES = [
  ["hero", "sofi.mtz", 2140, 6, 4, -7, 1],
  ["bar", "juanpa.rv", 1380, 54, 0, 5, 0.92],
  ["yoga2", "laura.en.med", 960, 30, 34, -3, 1.08],
  ["party", "cami.ospina", 3120, 68, 40, 8, 0.96],
  ["cafe2", "dani_vlz", 840, 2, 52, 4, 0.9],
  ["run", "mateo.runs", 1720, 40, 66, -6, 0.86],
]
function scatter() {
  const card = ([img, who, views, x, y, r, s], i) => `<div class="st" style="left:${x}%;top:${y}%;--r:${r}deg;--s:${s};animation-delay:${0.15 + i * 0.16}s,${1.2 + i * 0.3}s">
    <img src="/getty/${img}.jpg" alt="" loading="${i < 3 ? "eager" : "lazy"}">
    <span class="st-bars"><i style="--w:100%"></i><i style="--w:${40 + i * 9}%"></i><i></i></span>
    <span class="st-who"><b></b>${who}</span>
    <span class="st-tag">@yourplace</span>
    <span class="st-views"><svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7zm0 11a4 4 0 110-8 4 4 0 010 8z"/></svg><span class="cnt" data-to="${views}">0</span></span>
  </div>`
  return `<div class="scatter rise" aria-hidden="true">
  ${STORIES.map(card).join("")}
  <div class="pings" id="pings"></div>
  <div class="big card">
    <p class="faint" style="margin:0;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase">people who saw your place</p>
    <p class="num" style="margin:4px 0 0;font-size:44px;line-height:1"><span id="bigcnt">0</span></p>
    <svg viewBox="0 0 200 40" class="spark"><path id="sparkp" d="M0 38 C40 36 60 33 90 28 S150 12 200 2" fill="none" stroke="var(--lime)" stroke-width="2.5" stroke-linecap="round"/></svg>
    <p class="soft" style="margin:2px 0 0;font-size:12.5px">from 46 guest stories this week</p>
  </div>
</div>`
}

// the demo: three beats that play like stories (progress bars and all)
async function demo() {
  const qr = await QRCode.toDataURL(`${GETTY}/`, { width: 300, margin: 1, color: { dark: "#15110f", light: "#ffffff" } })
  const beats = [
    ["set the perk", "pick what a story is worth: a smoothie, a shot, a free class. print the qr for the counter."],
    ["they post, you tap", "a guest posts a story tagging you and shows it at the counter. staff double tap their pass. done."],
    ["watch it spread", "every story lands with hundreds of locals who trust the person posting. it adds up fast."],
  ]
  return `<section id="demo" class="demo" style="padding:40px 0 56px">
  <div>
    <span class="tag" style="--dot:var(--lilac)">watch it work</span>
    <h2 style="margin-top:14px">from qr to <em>viral</em> in one night</h2>
    <div class="beats">${beats.map(([t, d], i) => `<button class="beat${i ? "" : " on"}" data-i="${i}"><span class="bar"><i></i></span><span class="bt">0${i + 1} · ${t}</span><span class="bd">${d}</span></button>`).join("")}</div>
  </div>
  <div class="phone">
    <div class="scr s0 on">
      <p class="faint" style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase">your perk</p>
      <div class="fake-in"><span id="typed"></span><i class="caret"></i></div>
      <p class="faint" style="margin:14px 0 6px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase">how many a month</p>
      <div class="chips"><span class="chip">20</span><span class="chip" id="c50">50</span><span class="chip">100</span></div>
      <div class="qrpop" id="qrpop"><img src="${qr}" alt=""><p>your counter qr is ready</p></div>
    </div>
    <div class="scr s1">
      <img src="/getty/cafe2.jpg" alt="" class="bg">
      <span class="st-bars" style="top:12px"><i style="--w:100%"></i><i style="--w:60%"></i></span>
      <span class="st-who" style="top:24px"><b></b>dani_vlz</span>
      <span class="st-tag" style="top:46%;font-size:17px">@yourplace</span>
      <div class="pass" id="pass">
        <p class="pk">unlocked</p>
        <p class="pi">free smoothie</p>
        <p class="ph">for @dani_vlz's story</p>
        <p class="pg" id="pg">staff: double tap</p>
      </div>
      <span class="tap" id="tap"></span>
    </div>
    <div class="scr s2">
      <p class="faint" style="margin:0;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase">this week at your place</p>
      <p class="num" style="margin:6px 0 0;font-size:48px;line-height:1" id="wk">0</p>
      <p class="soft" style="margin:4px 0 14px;font-size:13px">views from <b id="wkn" style="color:var(--ink)">0</b> guest stories</p>
      <div class="tiles" id="tiles"></div>
    </div>
  </div>
</section>`
}

// a no-brainer: their kind of place, their perk, already working
const USES = [
  ["yoga2", "wellness studio", "bring a friend free", "a class full of people posting the studio they love"],
  ["cafe2", "café", "a free oat latte", "every morning regular tells their friends where to go"],
  ["bar", "cocktail bar", "a round of shots", "the table tags you before the first drink is gone"],
  ["run", "run club", "a smoothie after", "fifty runners, fifty stories, every sunday"],
  ["party", "club night", "skip the line", "the line becomes your best promo"],
  ["cafe", "brunch spot", "a free pastry", "two friends, two stories, a full saturday"],
]
function uses() {
  return USES.map(([img, kind, perk, line]) => `<figure class="use" style="margin:0;position:relative;aspect-ratio:4/5;border-radius:26px;overflow:hidden;border:1px solid var(--line)">
  <img src="/getty/${img}.jpg" alt="${esc(kind)}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.85) contrast(1.05);transition:transform .6s">
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(21,17,15,.1) 30%,rgba(21,17,15,.88))"></div>
  <figcaption style="position:absolute;left:16px;right:16px;bottom:16px">
    <span class="tag" style="background:rgba(21,17,15,.45);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:var(--ink)">${esc(kind)}</span>
    <p class="serif" style="font-size:27px;line-height:1.02;margin:10px 0 6px">1 story = ${esc(perk)}</p>
    <p class="soft" style="margin:0;font-size:13.5px">${esc(line)}</p>
  </figcaption>
</figure>`).join("")
}

async function landing() {
  const q = (t, d) => `<div style="padding:18px 0;border-top:1px solid var(--line)"><p style="font-weight:600;margin:0 0 6px">${t}</p><p class="soft" style="margin:0">${d}</p></div>`
  const cta = `<a class="btn" href="${GETTY}/start">get your free qr <span aria-hidden>→</span></a>`
  const body = `${NAV(`<span style="display:flex;gap:8px"><a class="btn ghost" href="${GETTY}/in" style="padding:10px 16px;font-size:14px">sign in</a><a class="btn" href="${GETTY}/start" style="padding:10px 16px;font-size:14px">get your free qr</a></span>`)}
<section class="hero" style="display:grid;gap:28px;align-items:center;padding:28px 0 40px">
  <div class="rise">
    <span class="tag">for bars, cafés, studios and clubs</span>
    <h1>your guests are the best <em>influencers</em> you'll ever book</h1>
    <p class="soft" style="font-size:18px;max-width:500px">every guest who posts a story tagging you gets a perk you pick. their friends see your place that night, from someone they trust. you get a list of every one of them.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">
      ${cta}
      <a class="btn ghost" href="#demo">watch it work</a>
    </div>
    <p class="faint" style="font-size:13px;margin-top:14px">20 stories free every month · no app for guests · works with any instagram</p>
  </div>
  ${scatter()}
</section>

${await demo()}

<section style="padding:30px 0 48px">
  <span class="tag" style="--dot:var(--peach)">works for any place people love</span>
  <h2 style="margin-top:14px">pick yours. it's live <em>tonight</em>.</h2>
  <div class="usegrid" style="display:grid;gap:12px">${uses()}</div>
</section>

<section style="padding:24px 0 48px;display:grid;gap:12px" class="duo">
  <div class="card" style="padding:28px">
    <span class="tag" style="--dot:var(--peach)">what you get</span>
    <p class="serif" style="font-size:32px;line-height:1.02;margin:16px 0 14px">nano influencers, already at your bar</p>
    <p class="soft">every story is a real person in your city telling their friends where they are right now. you get the guestlist: every handle that posted, ready to repost, follow back or invite to your next night.</p>
  </div>
  <div class="card" style="padding:28px">
    <span class="tag">pricing</span>
    <p style="margin:18px 0 4px"><span class="num" style="font-size:54px">20</span> <span class="soft">stories a month, free</span></p>
    <p class="soft" style="margin:0 0 18px">a story counts when staff tap a pass. need more?</p>
    <div class="row">
      ${Object.entries(PACKS).map(([n, c]) => `<div style="border:1px solid var(--line);border-radius:18px;padding:14px"><p class="num" style="font-size:26px;margin:0">+${n}</p><p class="soft" style="margin:0">${usd(c)}</p></div>`).join("")}
    </div>
  </div>
</section>

<section style="padding:24px 0 40px;max-width:680px">
  <span class="tag" style="--dot:var(--lilac)">questions</span>
  <h2 style="margin-top:14px">the stuff owners ask us</h2>
  <div style="margin-top:12px">
    ${q("how much does it cost?", "your first 20 stories every month are free. after that it's 50 more for $50, or 200 for $150. no subscription, no contract.")}
    ${q("do my guests need to download an app?", "no. they scan the qr on your counter, type their instagram and the pass opens on their phone. ten seconds.")}
    ${q("what does my staff actually do?", "look at the story on the guest's phone, see it tags you, tap the pass twice. that's the whole training.")}
    ${q("what if someone posts and deletes it right after?", "they have to post before they get anything, and you keep a list of every handle. most people leave it up anyway: it's their night out.")}
    ${q("can the same person keep coming back?", "once a day each. a regular who posts you every week is the best ad you'll ever run.")}
    ${q("what happens when we run out?", "the page tells guests it's all claimed for now and we let you know. top up in two taps.")}
  </div>
</section>

<section class="card" style="text-align:center;padding:44px 22px;margin-top:8px">
  <h2>put the first one on the counter <em>tonight</em></h2>
  <p class="soft">venue name, instagram, perk. your qr is ready before the next order.</p>
  <div style="margin-top:10px">${cta}</div>
</section>
<p class="faint" style="text-align:center;font-size:12px;margin-top:28px">getty by irlpass · <a href="https://irlpass.xyz" class="faint">meet people where you are</a></p>
<style>
.usegrid{grid-auto-flow:column;grid-auto-columns:78%;overflow-x:auto;scroll-snap-type:x mandatory;margin:20px 0 0;padding:0 0 6px;scrollbar-width:none}
.usegrid::-webkit-scrollbar{display:none}.usegrid>*{scroll-snap-align:start}
@media(min-width:700px){.usegrid{grid-auto-flow:row;grid-auto-columns:auto;grid-template-columns:repeat(3,1fr);overflow:visible;margin:20px 0 0;padding:0}}
.use:hover img{transform:scale(1.04)}
@media(min-width:860px){.hero{grid-template-columns:1fr 1.05fr}.duo{grid-template-columns:1fr 1fr}.demo{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}}

/* the scatter */
.scatter{position:relative;height:560px;max-width:600px;width:100%;margin:0 auto}
.st{position:absolute;width:31%;aspect-ratio:9/16;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.18);box-shadow:0 30px 60px -20px rgba(0,0,0,.75);opacity:0;transform:rotate(var(--r)) scale(var(--s));animation:fly .9s cubic-bezier(.2,.8,.2,1.15) both,bob 6s ease-in-out infinite}
.st img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.st:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45),transparent 25%,transparent 60%,rgba(0,0,0,.6))}
.st-bars{position:absolute;left:8px;right:8px;top:8px;display:flex;gap:3px;z-index:2}
.st-bars i{flex:1;height:2px;border-radius:2px;background:rgba(255,255,255,.35);position:relative;overflow:hidden}
.st-bars i:before{content:"";position:absolute;inset:0;width:var(--w,0%);background:#fff}
.st-who{position:absolute;left:9px;top:16px;z-index:2;display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600}
.st-who b{width:16px;height:16px;border-radius:50%;border:1.5px solid #fff;background:linear-gradient(135deg,var(--peach),var(--lilac))}
.st-tag{position:absolute;left:50%;top:52%;transform:translateX(-50%) rotate(-4deg);z-index:2;background:#fff;color:#15110f;border-radius:7px;padding:4px 8px;font:700 11.5px Geist,sans-serif;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.st-views{position:absolute;left:9px;bottom:9px;z-index:2;display:flex;align-items:center;gap:4px;font:600 12px Chillax,Geist,sans-serif}
@keyframes fly{from{opacity:0;transform:translate(var(--fx,40%),var(--fy,30%)) rotate(0) scale(.4)}to{opacity:1;transform:rotate(var(--r)) scale(var(--s))}}
@keyframes bob{0%,100%{translate:0 0}50%{translate:0 -8px}}
.big{position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);z-index:5;min-width:250px;padding:16px 18px;border-radius:22px;background:rgba(21,17,15,.72);text-align:left}
.spark{display:block;width:100%;height:30px;margin-top:6px}
#sparkp{stroke-dasharray:240;stroke-dashoffset:240;animation:draw 3.2s .6s ease-out forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.pings{position:absolute;right:-6px;top:-8px;z-index:6;display:flex;flex-direction:column;gap:6px;width:250px}
.ping{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:16px;background:rgba(21,17,15,.78);border:1px solid var(--line);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);font-size:12px;animation:pin .5s cubic-bezier(.2,.8,.2,1.1) both}
.ping b{font-weight:700}.ping i{width:22px;height:22px;flex:none;border-radius:50%;background:linear-gradient(135deg,var(--peach),var(--lilac))}
@keyframes pin{from{opacity:0;transform:translateY(-10px) scale(.96)}to{opacity:1;transform:none}}
.heart{position:absolute;z-index:4;font-size:20px;pointer-events:none;animation:up 2.4s ease-out forwards}
@keyframes up{0%{opacity:0;transform:translateY(0) scale(.6)}15%{opacity:1}100%{opacity:0;transform:translateY(-120px) scale(1.15)}}
@media(max-width:600px){.scatter{height:470px}.pings{width:200px;right:0}.ping{font-size:11px}.st-tag{font-size:10px}.big{min-width:220px}}

/* the demo */
.beats{display:flex;flex-direction:column;gap:8px;margin-top:20px}
.beat{display:block;width:100%;text-align:left;background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:20px;padding:14px 16px;cursor:pointer}
.beat .bar{display:block;height:2.5px;border-radius:2px;background:rgba(255,255,255,.15);overflow:hidden;margin-bottom:10px}
.beat .bar i{display:block;height:100%;width:0;background:var(--ink)}
.beat.on .bar i{animation:fill var(--dur,5s) linear forwards}
.beat.done .bar i{width:100%}
@keyframes fill{to{width:100%}}
.beat .bt{display:block;font:600 17px Chillax,Geist,sans-serif;letter-spacing:-.01em}
.beat .bd{display:none;color:var(--soft);font-size:14px;margin-top:4px}
.beat.on{background:var(--glass)}.beat.on .bd{display:block}
.phone{position:relative;width:300px;max-width:100%;aspect-ratio:9/18.5;margin:28px auto 0;border-radius:40px;border:1px solid rgba(255,255,255,.18);background:#1d1815;overflow:hidden;box-shadow:0 50px 120px -30px rgba(0,0,0,.85)}
.scr{position:absolute;inset:0;padding:54px 20px 20px;opacity:0;transition:opacity .4s;pointer-events:none}
.scr.on{opacity:1}
.s1{padding:0}.s1 .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.s1:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.4),transparent 25%,transparent 55%,rgba(0,0,0,.55))}
.s1 .st-bars,.s1 .st-who,.s1 .st-tag{z-index:3}
.fake-in{border:1px solid var(--line);border-radius:14px;padding:13px 14px;font-size:16px;background:rgba(255,255,255,.05);min-height:48px}
.caret{display:inline-block;width:2px;height:18px;background:var(--lilac);vertical-align:-3px;margin-left:1px;animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.chip.hot{background:var(--ink);color:#15110f;border-color:var(--ink)}
.qrpop{margin-top:18px;text-align:center;opacity:0;transform:scale(.8);transition:all .5s cubic-bezier(.2,.8,.2,1.2)}
.qrpop.on{opacity:1;transform:none}
.qrpop img{width:150px;border-radius:16px;background:#fff;padding:8px}
.qrpop p{font-size:13px;color:var(--soft);margin:8px 0 0}
.pass{position:absolute;left:16px;right:16px;bottom:18px;z-index:4;border-radius:22px;padding:16px 18px;color:#15110f;background:linear-gradient(110deg,var(--lilac),var(--peach),var(--lime),var(--lilac));background-size:300% 100%;animation:mv 5s linear infinite;transform:translateY(130%);transition:transform .6s cubic-bezier(.2,.8,.2,1.1)}
.pass.up{transform:none}
.pass.given{background:var(--lime);animation:none}
.pass p{margin:0}.pass .pk{font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.65}
.pass .pi{font:600 28px/1 Chillax,Geist,sans-serif;letter-spacing:-.02em;margin-top:6px}
.pass .ph{font-size:13px;font-weight:600;opacity:.75;margin-top:4px}
.pass .pg{font-size:12.5px;font-weight:700;margin-top:10px}
.tap{position:absolute;z-index:5;left:50%;bottom:80px;width:56px;height:56px;margin-left:-28px;border-radius:50%;border:2px solid #fff;opacity:0}
.tap.go{animation:tap .9s ease-out 2}
@keyframes tap{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(1.4)}}
.tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}
.tiles span{aspect-ratio:9/16;border-radius:6px;background-size:cover;background-position:center;animation:pin .35s ease-out both}
</style>`
  const script = `
var fmt=function(n){return Math.round(n).toLocaleString("en-US")};
function count(el,to,ms,from){from=from||0;var t0=performance.now();(function f(t){var p=Math.min(1,(t-t0)/ms),e=1-Math.pow(1-p,3);el.textContent=fmt(from+(to-from)*e);if(p<1)requestAnimationFrame(f)})(t0)}
// the scatter: views tick up, mentions stack, a heart floats now and then
var cnts=[].slice.call(document.querySelectorAll(".cnt"));var big=document.getElementById("bigcnt");var total=18240;
cnts.forEach(function(c,i){setTimeout(function(){count(c,+c.dataset.to,2600)},400+i*160)});
setTimeout(function(){count(big,total,3400)},600);
setTimeout(function(){setInterval(function(){var c=cnts[Math.floor(Math.random()*cnts.length)];var add=3+Math.floor(Math.random()*24);c.dataset.to=+c.dataset.to+add;c.textContent=fmt(+c.dataset.to);total+=add;big.textContent=fmt(total)},700)},4200);
var names=["sofi.mtz","juanpa.rv","laura.en.med","cami.ospina","dani_vlz","mateo.runs","vale.gomez","andres_k","isa.travels","nico.mde"];var pings=document.getElementById("pings"),pi=0;
function ping(){var d=document.createElement("div");d.className="ping";d.innerHTML="<i></i><span><b>"+names[pi++%names.length]+"</b> mentioned you in their story</span>";pings.insertBefore(d,pings.firstChild);while(pings.children.length>3)pings.removeChild(pings.lastChild)}
setTimeout(function(){ping();setInterval(ping,1700)},1200);
var sc=document.querySelector(".scatter");setInterval(function(){var s=document.querySelectorAll(".st");var c=s[Math.floor(Math.random()*s.length)];if(!c)return;var h=document.createElement("span");h.className="heart";h.textContent=["❤️","🔥","😍","🙌"][Math.floor(Math.random()*4)];h.style.left=(c.offsetLeft+c.offsetWidth*.6)+"px";h.style.top=(c.offsetTop+c.offsetHeight*.7)+"px";sc.appendChild(h);setTimeout(function(){h.remove()},2500)},900);
// the demo: three beats on a loop, like stories
var beats=[].slice.call(document.querySelectorAll(".beat")),scrs=[].slice.call(document.querySelectorAll(".scr")),cur=0,timer=null,DUR=5200,run=[];
run[0]=function(){var el=document.getElementById("typed"),txt="a free smoothie",i=0;el.textContent="";document.getElementById("c50").classList.remove("hot");document.getElementById("qrpop").classList.remove("on");
 var iv=setInterval(function(){el.textContent=txt.slice(0,++i);if(i>=txt.length){clearInterval(iv);setTimeout(function(){document.getElementById("c50").classList.add("hot")},350);setTimeout(function(){document.getElementById("qrpop").classList.add("on")},1000)}},75)};
run[1]=function(){var p=document.getElementById("pass"),g=document.getElementById("pg"),tap=document.getElementById("tap");p.classList.remove("up","given");g.textContent="staff: double tap";tap.classList.remove("go");
 setTimeout(function(){p.classList.add("up")},700);setTimeout(function(){void tap.offsetWidth;tap.classList.add("go")},2100);setTimeout(function(){p.classList.add("given");p.querySelector(".pk").textContent="given";g.textContent="✓ enjoy it · 9:41 pm"},3000)};
run[2]=function(){var imgs=["hero","bar","yoga2","party","cafe2","run","cafe","yoga"],t=document.getElementById("tiles");t.innerHTML="";document.getElementById("pass").querySelector(".pk").textContent="unlocked";count(document.getElementById("wk"),18240,3600);count(document.getElementById("wkn"),46,3600);
 for(var i=0;i<20;i++)(function(i){setTimeout(function(){var s=document.createElement("span");s.style.backgroundImage="url(/getty/"+imgs[i%imgs.length]+".jpg)";t.appendChild(s)},i*160)})(i)};
function go(i){cur=i;beats.forEach(function(b,j){b.classList.toggle("on",j===i);b.classList.toggle("done",j<i);var bar=b.querySelector(".bar i");bar.style.animation="none";void bar.offsetWidth;bar.style.animation=""});scrs.forEach(function(s,j){s.classList.toggle("on",j===i)});run[i]();clearTimeout(timer);timer=setTimeout(function(){go((cur+1)%3)},DUR)}
beats.forEach(function(b,i){b.addEventListener("click",function(){go(i)})});
document.documentElement.style.setProperty("--dur",DUR+"ms");
var started=false,io=new IntersectionObserver(function(es){if(es[0].isIntersecting&&!started){started=true;go(0)}},{threshold:.3});io.observe(document.getElementById("demo"));`
  return glass("getty by irlpass", body, {
    wide: true,
    script,
    head: `<meta name="description" content="guests post a story tagging you, staff check it at the counter, they get the perk you pick. 20 stories a month free.">
<meta property="og:title" content="your guests are the best influencers you'll ever book">
<meta property="og:description" content="story perks for bars, cafés, studios and clubs. 20 stories a month free.">
<meta property="og:image" content="${GETTY}/getty/hero.jpg">`,
  })
}

function startPage() {
  const opts = Object.entries(CITIES).map(([s, n]) => `<option value="${s}">${n}</option>`).join("")
  const body = `${NAV()}
<div class="cols"><div>
<div class="rise" style="padding-top:18px">
  <span class="tag">about a minute</span>
  <h1 style="font-size:48px">set up your story perk</h1>
  <p class="soft">you'll get a qr for the counter and the guestlist link by email.</p>
</div>
<form id="f" class="card rise" style="margin-top:18px;animation-delay:.1s" autocomplete="on">
  <label for="name">venue name</label><input id="name" required maxlength="80" placeholder="paraiso market">
  <label for="ig">your instagram</label><input id="ig" required autocapitalize="none" spellcheck="false" placeholder="@paraisomarket">
  <label for="city">city</label><select id="city">${opts}</select>
  <label for="item">the perk</label><input id="item" required maxlength="60" placeholder="a free smoothie">
  <label>how many a month</label>
  <div class="chips" id="qty">${[20, 50, 100, 300].map((n) => `<button type="button" class="chip${n === 50 ? " on" : ""}" data-n="${n}">${n}</button>`).join("")}</div>
  <label for="email">your email</label><input id="email" type="email" required autocomplete="email" placeholder="you@yourplace.com">
  <button class="block" id="go" style="margin-top:20px">get my qr</button>
  <p class="err" id="err"></p>
</form>
<p class="faint" style="font-size:12.5px;text-align:center;margin-top:14px">first 20 stories every month are free. a story counts when staff tap a pass.</p>
</div><div class="side desk" style="padding-top:96px">
  <p class="faint" style="font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;margin:0 0 12px;text-align:center">what your guests see</p>
  <div class="card" style="padding:14px;border-radius:30px;max-width:360px;margin:0 auto">
    <div style="border-radius:22px;padding:22px;color:#15110f;background:linear-gradient(110deg,var(--lilac),var(--peach),var(--lime),var(--lilac));background-size:300% 100%;animation:mv 5s linear infinite">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.7" id="pv-venue">your venue</p>
      <p class="serif" style="margin:8px 0 4px;font-size:34px;line-height:1" id="pv-item">a free smoothie</p>
      <p style="margin:0;font-size:15px;font-weight:600;opacity:.8">for a story tagging <span id="pv-ig">@you</span></p>
    </div>
    <p class="faint" style="text-align:center;font-size:12.5px;margin:12px 0 2px">they scan your qr, type their instagram, show the story</p>
  </div>
</div></div>`
  const script = `
const pv=(i,o,f)=>{const el=document.getElementById(i);el&&el.addEventListener("input",()=>{document.getElementById(o).textContent=f(el.value)})};
pv("name","pv-venue",x=>x.trim()||"your venue");pv("item","pv-item",x=>x.trim()||"a free smoothie");pv("ig","pv-ig",x=>"@"+(x.trim().replace(/^@+/,"")||"you"));
let qty=50;document.querySelectorAll("#qty .chip").forEach(b=>b.onclick=()=>{qty=+b.dataset.n;document.querySelectorAll("#qty .chip").forEach(x=>x.classList.toggle("on",x===b))});
const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"";const guess={"America/Bogota":"medellin","America/Los_Angeles":"los-angeles","Europe/Rome":"palermo"}[tz]||(tz==="America/New_York"?"miami":"");if(guess)document.getElementById("city").value=guess;
const f=document.getElementById("f"),go=document.getElementById("go"),err=document.getElementById("err"),v=id=>document.getElementById(id).value;
f.onsubmit=async e=>{e.preventDefault();err.textContent="";go.disabled=true;go.textContent="one sec…";
const r=await fetch("/api/venues-hub",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"create",name:v("name"),ig:v("ig"),city:v("city"),item:v("item"),email:v("email"),qty})}).then(x=>x.json()).catch(()=>({error:"no signal. try again."}));
if(r.url){try{localStorage.setItem("venue-k",r.k)}catch(e){}location.href=r.url}else{err.textContent=r.error||"try again";go.disabled=false;go.textContent="get my qr"}};`
  return glass("set up · getty", body, { script, wide: true })
}

function signInPage() {
  const body = `${NAV("")}
<div class="rise" style="padding-top:18px"><span class="tag">sign in</span><h1 style="font-size:48px">open your guestlist</h1><p class="soft">we'll email you the link.</p></div>
<form id="f" class="card rise" style="margin-top:18px">
  <label for="email">the email you signed up with</label><input id="email" type="email" required autocomplete="email" placeholder="you@yourplace.com">
  <button class="block" id="go" style="margin-top:18px">email me the link</button>
  <p class="err" id="err"></p>
</form>
<p class="soft" style="text-align:center;margin-top:16px">new here? <a href="${GETTY}/start">set it up</a></p>`
  const script = `
try{const k=localStorage.getItem("venue-k");if(k)location.replace("/g/"+k)}catch(e){}
const f=document.getElementById("f"),go=document.getElementById("go"),err=document.getElementById("err");
f.onsubmit=async e=>{e.preventDefault();go.disabled=true;
const r=await fetch("/api/venues-hub",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"login",email:document.getElementById("email").value})}).then(x=>x.json()).catch(()=>({error:"no signal. try again."}));
if(r.ok){f.innerHTML='<p class="serif" style="font-size:30px;margin:0 0 6px">check your email</p><p class="soft" style="margin:0">if that email has a venue, the link is on its way.</p>'}else{err.textContent=r.error||"try again";go.disabled=false}};`
  return glass("sign in · getty", body, { script })
}

async function dashData(v, e) {
  const [{ data: rows }, s] = await Promise.all([
    e ? db.from("perk_claims").select("id, handle, status, created_at, given_at, claim_day").eq("event_id", e.id).gte("created_at", monthStart()).order("created_at", { ascending: false }).limit(500) : { data: [] },
    slots(`v:${v.slug}`),
  ])
  const claims = rows || []
  const tz = TZ[v.city] || "UTC"
  const dayOf = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz })
  const today = dayOf(new Date().toISOString())
  const time = (iso) => new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).toLowerCase()
  const day = (iso) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).toLowerCase()
  const list = claims.map((c) => ({ id: c.id, handle: c.handle, given: c.status === "given", at: time(c.given_at || c.created_at), day: day(c.created_at), today: dayOf(c.created_at) === today }))
  return {
    list,
    todayPosted: list.filter((c) => c.today && c.given).length,
    monthPosted: list.filter((c) => c.given).length,
    claimed: list.length,
    slots: { free: s.free, credits: s.credits, left: s.left },
    qty: e?.perk?.qty || 0,
  }
}

async function dashPage(v, e, flash = "") {
  const d = await dashData(v, e)
  const link = e ? `${SITE}/p/${e.id}` : ""
  const qr = link ? await QRCode.toDataURL(link, { width: 720, margin: 1, color: { dark: "#15110f", light: "#ffffff" } }) : ""
  const perk = e?.perk || {}
  const stat = (n, l, id) => `<div class="card" style="padding:16px"><p class="num" id="${id}" style="font-size:34px;margin:0;line-height:1">${n}</p><p class="faint" style="margin:6px 0 0;font-size:12.5px">${l}</p></div>`
  const body = `${NAV(`<a class="btn ghost" href="${GETTY}/g/${v.owner_token}?print=1" target="_blank" style="padding:10px 16px;font-size:14px">counter card</a>`)}
${flash ? `<div class="card" style="border-color:rgba(205,238,69,.45);margin:10px 0">${esc(flash)}</div>` : ""}
<div class="rise" style="padding-top:10px">
  <span class="tag">the guestlist · ${esc(CITIES[v.city] || v.city)}</span>
  <h1 style="font-size:46px;margin-bottom:6px">${esc(v.name)}</h1>
  <p class="soft" style="margin:0">1 story = ${esc(perk.item || "your perk")} · tagging @${esc(v.instagram || "")} + @irlpass.xyz</p>
</div>

<div class="cols" style="margin-top:20px"><div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
  ${stat(d.todayPosted, "stories today", "st-today")}
  ${stat(d.monthPosted, "this month", "st-month")}
  ${stat(d.slots.left, "stories left", "st-left")}
</div>
<p id="low" class="err" style="${d.slots.left <= 5 ? "" : "display:none"}">${d.slots.left ? "almost out of stories for the month. top up below so guests can keep claiming." : "out of stories: guests can't claim until you top up."}</p>

<div class="card" style="margin-top:14px;padding:18px 18px 8px">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
    <p class="serif" style="font-size:28px;margin:0">tonight</p>
    <span class="faint" style="font-size:12px">updates on its own</span>
  </div>
  <div id="list" style="margin-top:6px;min-height:120px"></div>
</div>

</div><div class="side">
<div class="card" style="margin-top:14px;text-align:center">
  <span class="tag" style="--dot:var(--lilac)">the qr for your counter</span>
  ${qr ? `<a href="${qr}" download="${esc(v.slug)}-qr.png"><img src="${qr}" alt="qr code" style="display:block;width:220px;max-width:70%;margin:18px auto 10px;border-radius:18px;background:#fff;padding:10px"></a>` : ""}
  <p class="soft" style="font-size:13px;margin:0 0 14px">tap the qr to save it, or print the <a href="${GETTY}/g/${v.owner_token}?print=1" target="_blank">counter card</a>.</p>
  <a class="btn ghost block" href="${esc(link)}" target="_blank">see what guests see</a>
</div>

<div class="card" style="margin-top:14px">
  <span class="tag" style="--dot:var(--peach)">stories</span>
  <p style="margin:14px 0 4px"><span class="num" style="font-size:28px">${d.slots.free}</span> <span class="soft">free left this month</span>${d.slots.credits ? ` · <span class="num" style="font-size:20px">${d.slots.credits}</span> <span class="soft">bought</span>` : ""}</p>
  <p class="faint" style="font-size:12.5px;margin:0 0 14px">${FREE} free every month. a story counts when staff tap a pass.</p>
  <div class="row">${Object.entries(PACKS).map(([n, c]) => `<button class="ghost buy" data-n="${n}">+${n} · ${usd(c)}</button>`).join("")}</div>
  <p class="err" id="buyerr"></p>
</div>

<form class="card" id="pf" style="margin-top:14px">
  <span class="tag">your perk</span>
  <label for="item">what they get</label><input id="item" maxlength="60" value="${esc(perk.item || "")}">
  <div class="row">
    <div><label for="ask">they post</label><select id="ask">${Object.entries(ASK).map(([k, l]) => `<option value="${k}"${perk.ask === k ? " selected" : ""}>${l}</option>`).join("")}</select></div>
    <div><label for="qty">per month</label><input id="qty" type="number" min="1" max="5000" value="${d.qty}"></div>
  </div>
  <button class="ghost block" id="save" style="margin-top:16px">save</button>
  <p class="err" id="perr"></p>
</form>

<details class="card" style="margin-top:14px">
  <summary style="cursor:pointer;font-weight:600">how staff check a story</summary>
  <p class="soft" style="margin:12px 0 6px">1. the guest opens their pass and their instagram story.</p>
  <p class="soft" style="margin:0 0 6px">2. you see the story is live and tags @${esc(v.instagram || "you")}.</p>
  <p class="soft" style="margin:0">3. double tap the pass, or tap give next to their name here. that's it.</p>
</details>
</div></div>
<p class="faint" style="text-align:center;font-size:12px;margin-top:24px">bookmark this page. it's your sign in.</p>`

  const script = `
const K=${JSON.stringify(v.owner_token)};try{localStorage.setItem("venue-k",K)}catch(e){}
if(location.search.includes("session_id"))history.replaceState(null,"",location.pathname);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const post=b=>fetch("/api/venues-hub",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({k:K,...b})}).then(x=>x.json()).catch(()=>({error:"no signal. try again."}));
function draw(d){
  document.getElementById("st-today").textContent=d.todayPosted;document.getElementById("st-month").textContent=d.monthPosted;document.getElementById("st-left").textContent=d.slots.left;
  const low=document.getElementById("low");low.style.display=d.slots.left<=5?"":"none";low.textContent=d.slots.left?"almost out of stories for the month. top up below so guests can keep claiming.":"out of stories: guests can't claim until you top up.";
  const t=d.list.filter(c=>c.today),old=d.list.filter(c=>!c.today);
  const row=c=>'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-top:1px solid var(--line)"><a href="https://instagram.com/'+esc(c.handle)+'" target="_blank" rel="noreferrer" style="font-weight:600;text-decoration:none;overflow:hidden;text-overflow:ellipsis">@'+esc(c.handle)+'</a>'+(c.given?'<span class="faint" style="font-size:13px;white-space:nowrap"><span style="color:var(--lime)">●</span> posted '+(c.today?c.at:c.day)+'</span>':'<button class="ghost give" data-id="'+c.id+'" style="padding:8px 14px;font-size:13px">give</button>')+'</div>';
  document.getElementById("list").innerHTML=(t.length?t.map(row).join(""):'<p class="soft" style="padding:12px 0;margin:0;border-top:1px solid var(--line)">nobody yet tonight. put the qr where people wait.</p>')+(old.length?'<details style="padding:12px 0;border-top:1px solid var(--line)"><summary class="soft" style="cursor:pointer">earlier this month · '+old.length+'</summary>'+old.map(row).join("")+'</details>':"");
  document.querySelectorAll(".give").forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent="…";const r=await post({action:"give",id:+b.dataset.id});if(r.ok)refresh();else{b.disabled=false;b.textContent=r.error||"try again"}});
}
const first=${JSON.stringify(d)};draw(first);
async function refresh(){const d=await fetch("/api/venues-hub?view=dash&json=1&k="+K).then(x=>x.json()).catch(()=>null);if(d&&d.list)draw(d)}
setInterval(()=>{if(!document.hidden)refresh()},20000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
document.querySelectorAll(".buy").forEach(b=>b.onclick=async()=>{b.disabled=true;const r=await post({action:"buy",slots:+b.dataset.n});if(r.url)location.href=r.url;else{b.disabled=false;document.getElementById("buyerr").textContent=r.error||"try again"}});
document.getElementById("pf").onsubmit=async e=>{e.preventDefault();const s=document.getElementById("save"),er=document.getElementById("perr");s.disabled=true;er.textContent="";
const r=await post({action:"perk",item:document.getElementById("item").value,ask:document.getElementById("ask").value,qty:+document.getElementById("qty").value});
s.disabled=false;if(r.ok){s.textContent="saved";setTimeout(()=>s.textContent="save",1500)}else er.textContent=r.error||"try again"};`
  return glass(`${v.name} · the guestlist`, body, { script, wide: true, head: `<meta name="robots" content="noindex">` })
}

async function printPage(v, e) {
  const link = `${SITE}/p/${e.id}`
  const qr = await QRCode.toDataURL(link, { width: 900, margin: 1, color: { dark: "#15110f", light: "#ffffff" } })
  const body = `<div style="text-align:center;padding:20px 0">
  <span class="tag">${esc(v.name)}</span>
  <p class="serif" style="font-size:54px;line-height:.98;margin:22px 0 10px">post a story,<br>get <em>${esc(e.perk.item)}</em></p>
  <p class="soft" style="font-size:17px;margin:0 0 22px">tag @${esc(v.instagram || "")} + @irlpass.xyz, then scan</p>
  <img src="${qr}" alt="qr code" style="width:300px;max-width:80%;border-radius:22px;background:#fff;padding:14px">
  <p class="faint" style="margin-top:18px;font-size:13px">no app needed · show your story at the counter</p>
  <button class="ghost noprint" onclick="print()" style="margin-top:18px">print</button>
</div>
<style>@media print{.noprint{display:none}body:before,body:after{display:none}html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>`
  return glass(`${v.name} · counter card`, body, { head: `<meta name="robots" content="noindex">` })
}

const gonePage = () => glass("getty", `${NAV()}<div style="padding-top:30px"><h1 style="font-size:46px">that link doesn't open anything</h1><p class="soft">sign in with your email and we'll send a fresh one.</p><a class="btn" href="${GETTY}/in">sign in</a></div>`)

// ---------- actions ----------

async function create(b) {
  const name = clean(b.name, 80)
  const ig = cleanHandle(b.ig)
  const city = CITIES[b.city] ? b.city : null
  const item = clean(b.item, 60)
  const email = String(b.email || "").trim().toLowerCase()
  const qty = Math.min(5000, Math.max(1, Math.round(Number(b.qty) || 50)))
  if (name.length < 2) return { error: "what's the venue called?" }
  if (!okHandle(ig)) return { error: "type your instagram, like @yourplace" }
  if (!city) return { error: "pick your city" }
  if (item.length < 2) return { error: "what do guests get?" }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: "that email doesn't look right" }

  // one venue per instagram: signing up again just sends the link
  const { data: had } = await db.from("venues").select("slug, owner_token, contact_email").eq("instagram", ig).maybeSingle()
  if (had?.owner_token && had.contact_email === email && (await db.from("venues").select("perk_event_id").eq("slug", had.slug).maybeSingle()).data?.perk_event_id) {
    return { url: dashUrl(had.owner_token), k: had.owner_token }
  }
  if (had?.owner_token) return { error: "that instagram already has a guestlist. sign in with its email." }

  let slug = slugify(name) || ig.replace(/[^a-z0-9]+/g, "-")
  for (let i = 2; (await db.from("venues").select("slug").eq("slug", slug).maybeSingle()).data; i++) slug = `${slugify(name)}-${i}`
  const k = crypto.randomBytes(24).toString("base64url")
  const { error } = await db.from("venues").insert({
    slug, name, city, perk: item, instagram: ig, contact_email: email, owner_token: k, status: "active", plan: "stories",
  })
  if (error) throw error

  const { data: e, error: ee } = await db.from("events").insert({
    source: "venue",
    source_id: slug,
    city,
    title: name,
    venue: name,
    starts_at: new Date().toISOString(),
    ends_at: "2099-12-31T00:00:00Z",
    category: kindOf(`${name} ${item}`, ""),
    is_free: true,
    host: name,
    host_no: `v:${slug}`,
    featured: false,
    perk: { item, qty, ask: "story", tags: [`@${ig}`] },
  }).select("id").single()
  if (ee) throw ee
  await db.from("venues").update({ perk_event_id: e.id }).eq("slug", slug)

  await sendEmail({
    to: email,
    subject: `${name}'s guestlist is ready`,
    html: `<p>your story perk is live: 1 story = ${esc(item)}.</p><p><a href="${dashUrl(k)}">open your guestlist</a> to print the qr for the counter and see who posted. keep this email, the link is your sign in.</p><p>the first ${FREE} stories every month are on us.</p>`,
  }).catch(() => {})
  return { url: dashUrl(k), k }
}

async function buy(v, n) {
  if (!PACKS[n]) return { error: "pick a pack" }
  const back = dashUrl(v.owner_token)
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(PACKS[n]),
    "line_items[0][price_data][product_data][name]": `${n} stories for ${v.name}`,
    "line_items[0][quantity]": "1",
    success_url: `${back}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
    "metadata[kind]": "venue_slots",
    "metadata[slots]": String(n),
    "metadata[venue]": v.slug,
  })
  if (v.contact_email) params.set("customer_email", v.contact_email)
  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${stripeKey()}`, "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })
  const s = await r.json()
  return s.url ? { url: s.url } : { error: "checkout is down for a sec. try again." }
}

// back from stripe: add the stories once
async function bought(v, sid) {
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`, { headers: { authorization: `Bearer ${stripeKey()}` } })
  const s = await r.json()
  if (!r.ok || s.payment_status !== "paid" || s.metadata?.kind !== "venue_slots" || s.metadata?.venue !== v.slug) return ""
  const n = Number(s.metadata.slots) || 0
  const { error: dup } = await db.from("perk_purchases").insert({ session_id: sid, host_no: `v:${v.slug}`, slots: n, cents: s.amount_total || 0 })
  if (dup) return ""
  await addCredits(`v:${v.slug}`, n)
  await db.from("venues").update({ out_noticed_at: null }).eq("slug", v.slug)
  return `added ${n} stories. guests can keep claiming.`
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const view = String(req.query?.view || "landing")
      if (view === "start") return send(res, startPage())
      if (view === "in") return send(res, signInPage())
      if (view === "dash") {
        const v = await byToken(req.query?.k)
        if (!v) return req.query?.json ? res.status(404).json({ error: "gone" }) : send(res, gonePage())
        const e = await perkEvent(v)
        if (req.query?.json) return res.status(200).json(await dashData(v, e))
        if (req.query?.print && e) return send(res, await printPage(v, e))
        const flash = req.query?.session_id ? await bought(v, String(req.query.session_id)) : ""
        return send(res, await dashPage(v, e, flash))
      }
      return send(res, await landing(), "public, max-age=300")
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
    const b = req.body || {}

    if (b.action === "create") {
      const r = await create(b)
      return res.status(r.error ? 400 : 200).json(r)
    }
    if (b.action === "login") {
      const email = String(b.email || "").trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: "that email doesn't look right" })
      const { data: vs } = await db.from("venues").select("name, owner_token").eq("contact_email", email).not("owner_token", "is", null).limit(5)
      if (vs?.length) {
        await sendEmail({
          to: email,
          subject: "your guestlist link",
          html: vs.map((v) => `<p><a href="${dashUrl(v.owner_token)}">open ${esc(v.name)}'s guestlist</a></p>`).join(""),
        }).catch(() => {})
      }
      return res.status(200).json({ ok: true })
    }

    const v = await byToken(b.k)
    if (!v) return res.status(401).json({ error: "sign in again" })
    const e = await perkEvent(v)

    if (b.action === "buy") return res.status(200).json(await buy(v, Number(b.slots)))

    if (b.action === "perk") {
      if (!e) return res.status(404).json({ error: "no perk yet" })
      const item = clean(b.item, 60)
      if (item.length < 2) return res.status(400).json({ error: "what do guests get?" })
      const qty = Math.min(5000, Math.max(1, Math.round(Number(b.qty) || 0)))
      const perk = { ...e.perk, item, qty, ask: ASK[b.ask] ? b.ask : "story", tags: [`@${v.instagram}`] }
      await db.from("events").update({ perk }).eq("id", e.id)
      await db.from("venues").update({ perk: item }).eq("slug", v.slug)
      return res.status(200).json({ ok: true })
    }

    if (b.action === "give") {
      const { data: c } = await db.from("perk_claims").select("id, status, event_id").eq("id", Number(b.id)).maybeSingle()
      if (!c || !e || c.event_id !== e.id) return res.status(404).json({ error: "not on your list" })
      if (c.status === "given") return res.status(200).json({ ok: true })
      if (!(await useSlot(`v:${v.slug}`))) return res.status(402).json({ error: "out of stories" })
      await db.from("perk_claims").update({ status: "given", given_at: new Date().toISOString() }).eq("id", c.id).eq("status", "claimed")
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ error: "unknown action" })
  } catch (err) {
    console.error("venues hub error:", err)
    return res.status(500).json({ error: "something broke. try again." })
  }
}
