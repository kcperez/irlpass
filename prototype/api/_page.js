// a small standalone page in irlpass colors, for the venue pages that live
// outside the app (door qr, /pro, the ops report)
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

// every standalone page (event links, door qr, day plans, ops) wears the same
// dark cobalt look as the app now
export function page(title, body, script = "") {
  return glass(title, body, { script, wide: title.startsWith("ops") })
}

export function send(res, html, cache = "no-store") {
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.setHeader("cache-control", cache)
  return res.status(200).send(html)
}

// the new look: dark, frosted glass, film grain, serif titles, outlined dot
// labels. used by irlpass for venues first, the rest follows.
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.55'/></svg>")`
export function glass(title, body, { script = "", head = "", wide = false, getty = false } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#15110f">
${getty ? `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%234a66ff'/%3E%3Ccircle cx='16' cy='16' r='8.2' fill='none' stroke='%23fff' stroke-width='2.6' stroke-dasharray='44 8' stroke-linecap='round' transform='rotate(-60 16 16)'/%3E%3Ccircle cx='16' cy='16' r='3.4' fill='%23fff'/%3E%3C/svg%3E">` : `<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png">`}
<title>${esc(title)}</title>${head}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://api.fontshare.com/v2/css?f[]=chillax@500,600,700&display=swap" rel="stylesheet">
<style>
:root{--bg:#15110f;--ink:#f4eee7;--soft:rgba(244,238,231,.62);--faint:rgba(244,238,231,.38);--line:rgba(255,255,255,.12);--glass:rgba(255,255,255,.06);--glass2:rgba(255,255,255,.1);--lilac:#8fa0ff;--peach:#c9d2ff;--lime:#4a66ff;--red:#ff8a7a}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;min-height:100dvh;color:var(--ink);background:transparent;font-family:Geist,system-ui,sans-serif;font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}
body:before{content:"";position:fixed;inset:-20%;z-index:-2;background:radial-gradient(40% 32% at 18% 12%,rgba(74,102,255,.28),transparent 70%),radial-gradient(36% 30% at 88% 26%,rgba(143,160,255,.14),transparent 70%),radial-gradient(40% 34% at 60% 96%,rgba(74,102,255,.12),transparent 70%);filter:blur(30px)}
body:after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:${GRAIN};opacity:.13;mix-blend-mode:overlay}
main{max-width:${wide ? "1080px" : "480px"};margin:0 auto;padding:22px 16px 64px}
a{color:inherit}
h1,h2,.serif{font-family:Chillax,Geist,sans-serif;font-weight:700;letter-spacing:-.035em}
h1{font-size:clamp(40px,5.4vw,64px);line-height:1;margin:14px 0 16px}
h2{font-size:clamp(30px,4.6vw,44px);line-height:1.04;margin:0 0 12px}
h1 em,h2 em{font-style:normal;display:inline-block;background:var(--lime);color:#fff;padding:0 .16em .02em;border-radius:.28em;transform:rotate(-2.5deg);line-height:1.05}
p{margin:0 0 12px}
.soft{color:var(--soft)}.faint{color:var(--faint)}
.num{font-family:Chillax,Geist,sans-serif;font-weight:700;letter-spacing:-.02em}
.tag{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}
.tag:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--dot,var(--lime));box-shadow:0 0 10px var(--dot,var(--lime))}
.card{background:var(--glass);border:1px solid var(--line);border-radius:24px;padding:20px;-webkit-backdrop-filter:blur(22px) saturate(140%);backdrop-filter:blur(22px) saturate(140%);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.btn,button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;background:var(--lime);color:#fff;box-shadow:0 10px 30px -10px rgba(74,102,255,.6);font:600 15px Geist,sans-serif;padding:15px 22px;text-decoration:none;cursor:pointer;transition:transform .15s,opacity .15s}
.btn:active,button:active{transform:scale(.98)}
.btn.ghost,button.ghost{background:var(--glass);color:var(--ink);border:1px solid var(--line);box-shadow:none;-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
.btn.block,button.block{display:flex;width:100%}
button:disabled{opacity:.5}
label{display:block;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:14px 0 6px}
input,select,textarea{width:100%;font:16px Geist,sans-serif;padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.05);color:var(--ink);outline:none;-webkit-appearance:none;appearance:none}
input:focus,select:focus{border-color:rgba(74,102,255,.7);background:rgba(255,255,255,.08)}
input::placeholder{color:var(--faint)}
select{background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8'><path d='M1 1l5 5 5-5' fill='none' stroke='%23f4eee7' stroke-opacity='.6' stroke-width='1.6'/></svg>");background-repeat:no-repeat;background-position:right 16px center;padding-right:40px}
select option{color:#15110f}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--glass);color:var(--ink);border-radius:999px;padding:10px 16px;font:600 14px Geist,sans-serif;cursor:pointer}
.chip.on{background:var(--lime);color:#fff;border-color:var(--lime)}
.err{color:var(--red);font-size:13px;margin:10px 0 0}.err:empty{display:none}
.row{display:flex;gap:10px}.row>*{flex:1;min-width:0}
.nav{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
.logo{display:inline-flex;align-items:center;gap:9px;font-family:Chillax,Geist,sans-serif;font-weight:700;font-size:24px;text-decoration:none;letter-spacing:-.03em}
.mark{display:inline-block;width:32px;height:32px;flex:none;filter:drop-shadow(0 6px 16px rgba(74,102,255,.45))}
.logo span{font-family:Geist,sans-serif;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-left:2px;align-self:flex-end;padding-bottom:4px}
@keyframes mv{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.rise{animation:rise .7s cubic-bezier(.2,.7,.2,1) both}
.k{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.perk{font-family:Chillax,Geist,sans-serif;font-weight:700;font-size:34px;line-height:1.02;letter-spacing:-.03em}
main>.card{margin:14px 0}
button.alt,.btn.alt{background:transparent;color:var(--ink);border:1px solid var(--line);box-shadow:none}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line)}th{color:var(--soft);font-weight:500}
.scroll{overflow-x:auto}
.cols{display:grid;gap:0 18px;grid-template-columns:minmax(0,1fr)}
.desk{display:none}
@media(min-width:900px){.cols{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start}.side{position:sticky;top:20px}.side>:first-child{margin-top:0!important}.desk{display:block}.mob{display:none}}
</style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ""}</body></html>`
}
