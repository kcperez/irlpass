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
