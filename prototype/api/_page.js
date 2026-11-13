// a small standalone page in irlpass colors, for the venue pages that live
// outside the app (door qr, /pro, the ops report)
export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

export function page(title, body, script = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--cream:#f7f3ed;--deep:#efe8df;--ink:#3a322c;--soft:#837a70;--lime:#ddd0f6;--peach:#f8d9c6;--line:#e3dad0}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;color:var(--ink);font-family:Geist,system-ui,sans-serif;font-size:15px;line-height:1.45;
background:radial-gradient(62% 46% at 10% 6%,color-mix(in srgb,var(--lime) 85%,transparent) 0%,transparent 62%),radial-gradient(54% 42% at 94% 20%,color-mix(in srgb,var(--peach) 85%,transparent) 0%,transparent 64%),var(--cream)}
main{max-width:460px;margin:0 auto;padding:28px 16px 48px}
.wide{max-width:1000px}
h1{font-family:"Instrument Serif",serif;font-weight:400;font-size:40px;line-height:1.05;margin:8px 0 10px}
h2{font-family:"Instrument Serif",serif;font-weight:400;font-size:26px;margin:28px 0 8px}
.k{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft)}
.card{background:#fffdf9;border:1px solid var(--line);border-radius:20px;padding:18px;margin:14px 0}
.soft{color:var(--soft)}
button,.btn{display:block;width:100%;border:0;border-radius:999px;background:var(--ink);color:var(--cream);font:600 15px Geist,sans-serif;padding:14px 18px;text-align:center;text-decoration:none;cursor:pointer}
button.alt{background:transparent;color:var(--ink);border:1px solid var(--line)}
button:disabled{opacity:.5}
input,select{width:100%;font:15px Geist,sans-serif;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--ink);margin:4px 0 10px}
label{font-size:13px;color:var(--soft)}
.row{display:flex;gap:8px}.row>*{flex:1;min-width:0}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 12px}
.chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 14px;font-weight:600;cursor:pointer;width:auto;color:var(--ink)}
.chip.on{background:var(--ink);color:var(--cream)}
.perk{font-family:"Instrument Serif",serif;font-size:34px;line-height:1.1}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line)}th{color:var(--soft);font-weight:500}
.scroll{overflow-x:auto}
a{color:var(--ink)}
</style></head><body><main${title.startsWith("ops") ? ' class="wide"' : ""}>${body}</main>${script ? `<script>${script}</script>` : ""}</body></html>`
}

export function send(res, html, cache = "no-store") {
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.setHeader("cache-control", cache)
  return res.status(200).send(html)
}

// the new look: dark, frosted glass, film grain, serif titles, outlined dot
// labels. used by irlpass for venues first, the rest follows.
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.55'/></svg>")`
export function glass(title, body, { script = "", head = "", wide = false } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#15110f">
<title>${esc(title)}</title>${head}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600&display=swap" rel="stylesheet">
<style>
:root{--bg:#15110f;--ink:#f4eee7;--soft:rgba(244,238,231,.62);--faint:rgba(244,238,231,.38);--line:rgba(255,255,255,.12);--glass:rgba(255,255,255,.06);--glass2:rgba(255,255,255,.1);--lilac:#ddd0f6;--peach:#f8d9c6;--lime:#cdee45;--red:#ff8a7a}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;min-height:100dvh;color:var(--ink);background:transparent;font-family:Geist,system-ui,sans-serif;font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;overflow-x:hidden}
body:before{content:"";position:fixed;inset:-20%;z-index:-2;background:radial-gradient(40% 32% at 18% 12%,rgba(221,208,246,.32),transparent 70%),radial-gradient(36% 30% at 88% 26%,rgba(248,217,198,.24),transparent 70%),radial-gradient(40% 34% at 60% 96%,rgba(205,238,69,.12),transparent 70%);filter:blur(30px)}
body:after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:${GRAIN};opacity:.13;mix-blend-mode:overlay}
main{max-width:${wide ? "1080px" : "480px"};margin:0 auto;padding:22px 16px 64px}
a{color:inherit}
h1,h2,.serif{font-family:"Instrument Serif",serif;font-weight:400;letter-spacing:-.01em}
h1{font-size:clamp(42px,8vw,76px);line-height:.98;margin:14px 0 14px}
h2{font-size:clamp(32px,5vw,46px);line-height:1.02;margin:0 0 12px}
h1 em,h2 em{font-style:italic;color:var(--lilac)}
p{margin:0 0 12px}
.soft{color:var(--soft)}.faint{color:var(--faint)}
.num{font-family:"Clash Display",Geist,sans-serif;font-weight:600;letter-spacing:-.01em}
.tag{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--soft)}
.tag:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--dot,var(--lime));box-shadow:0 0 10px var(--dot,var(--lime))}
.card{background:var(--glass);border:1px solid var(--line);border-radius:24px;padding:20px;-webkit-backdrop-filter:blur(22px) saturate(140%);backdrop-filter:blur(22px) saturate(140%);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.btn,button{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;background:var(--ink);color:#15110f;font:600 15px Geist,sans-serif;padding:15px 22px;text-decoration:none;cursor:pointer;transition:transform .15s,opacity .15s}
.btn:active,button:active{transform:scale(.98)}
.btn.ghost,button.ghost{background:var(--glass);color:var(--ink);border:1px solid var(--line);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
.btn.block,button.block{display:flex;width:100%}
button:disabled{opacity:.5}
label{display:block;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin:14px 0 6px}
input,select,textarea{width:100%;font:16px Geist,sans-serif;padding:14px 16px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.05);color:var(--ink);outline:none;-webkit-appearance:none;appearance:none}
input:focus,select:focus{border-color:rgba(221,208,246,.6);background:rgba(255,255,255,.08)}
input::placeholder{color:var(--faint)}
select{background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8'><path d='M1 1l5 5 5-5' fill='none' stroke='%23f4eee7' stroke-opacity='.6' stroke-width='1.6'/></svg>");background-repeat:no-repeat;background-position:right 16px center;padding-right:40px}
select option{color:#15110f}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--glass);color:var(--ink);border-radius:999px;padding:10px 16px;font:600 14px Geist,sans-serif;cursor:pointer}
.chip.on{background:var(--ink);color:#15110f;border-color:var(--ink)}
.err{color:var(--red);font-size:13px;margin:10px 0 0}.err:empty{display:none}
.row{display:flex;gap:10px}.row>*{flex:1;min-width:0}
.nav{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
.logo{font-family:"Instrument Serif",serif;font-size:26px;text-decoration:none;letter-spacing:-.01em}
.logo span{font-family:Geist,sans-serif;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin-left:8px}
@keyframes mv{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.rise{animation:rise .7s cubic-bezier(.2,.7,.2,1) both}
.cols{display:grid;gap:0 18px;grid-template-columns:minmax(0,1fr)}
.desk{display:none}
@media(min-width:900px){.cols{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start}.side{position:sticky;top:20px}.side>:first-child{margin-top:0!important}.desk{display:block}.mob{display:none}}
</style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ""}</body></html>`
}
