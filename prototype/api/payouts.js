import { db } from "./_db.js"

const TAKE = 0.2 // platform take-rate; host keeps the rest
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const money = (cents) => `$${(cents / 100).toFixed(2)}`

export default async function handler(req, res) {
  const key = req.query?.key
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" })
  }

  try {
    // mark a host's pending seats as paid out
    if (req.method === "POST") {
      const host = String(req.body?.host || "")
      if (!host) return res.status(400).json({ error: "host required" })
      await db.from("seat_payments").update({ paid_out: true }).eq("host_no", host).eq("paid_out", false)
      return res.status(200).json({ ok: true })
    }

    const { data: rows } = await db.from("seat_payments").select("*").order("paid_at", { ascending: false })
    const { data: members } = await db.from("members").select("member_no, name, ig")
    const nameOf = (no) => (members || []).find((m) => m.member_no === no)?.name || `nº ${no}`
    const igOf = (no) => (members || []).find((m) => m.member_no === no)?.ig || ""

    // group unpaid by host
    const owed = {}
    let lifetimeGross = 0
    let lifetimeTake = 0
    for (const r of rows || []) {
      lifetimeGross += r.amount_cents
      lifetimeTake += Math.round(r.amount_cents * TAKE)
      if (r.paid_out) continue
      const h = r.host_no
      owed[h] = owed[h] || { host: h, seats: 0, gross: 0 }
      owed[h].seats++
      owed[h].gross += r.amount_cents
    }

    const hostCards = Object.values(owed)
      .map((o) => {
        const hostNet = Math.round(o.gross * (1 - TAKE))
        return `<div class="card">
          <div class="row"><b>${esc(nameOf(o.host))}</b> <span class="muted">${esc(igOf(o.host))}</span></div>
          <div class="row muted">${o.seats} seat${o.seats > 1 ? "s" : ""} sold · gross ${money(o.gross)} · your cut ${money(Math.round(o.gross * TAKE))}</div>
          <div class="row owed">owe this host: <b>${money(hostNet)}</b></div>
          <button class="pay" data-host="${esc(o.host)}">mark paid out</button>
        </div>`
      })
      .join("")

    const ledger = (rows || [])
      .slice(0, 50)
      .map(
        (r) => `<tr>
          <td data-l="event">${esc(r.activity_title || "")}</td>
          <td data-l="buyer">${esc(r.buyer_name || r.buyer_no)}</td>
          <td data-l="host">${esc(nameOf(r.host_no))}</td>
          <td data-l="amount">${money(r.amount_cents)}</td>
          <td data-l="status">${r.paid_out ? '<span class="tag done">paid out</span>' : '<span class="tag pend">pending</span>'}</td>
          <td data-l="when">${esc(new Date(r.paid_at).toLocaleDateString("en-US", { timeZone: "America/Bogota", month: "short", day: "numeric" }))}</td>
        </tr>`
      )
      .join("")

    res.setHeader("content-type", "text/html; charset=utf-8")
    return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
      <title>irlpass payouts</title>
      <style>
        *{box-sizing:border-box} body{font-family:ui-monospace,Menlo,monospace;background:#f4f1ea;color:#1c1b17;padding:16px;font-size:13px;margin:0}
        h1{font-size:16px;margin:0 0 4px} h2{font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:#8a857a;margin:20px 0 8px}
        a{color:#1c1b17}
        .stats{display:flex;gap:8px;margin-top:10px}
        .stat{flex:1;background:#fff;border:1px solid #dcd6c8;border-radius:12px;padding:12px}
        .stat b{font-size:18px;display:block}
        .card{background:#fff;border:1px solid #dcd6c8;border-radius:12px;padding:14px;margin-bottom:10px}
        .row{margin:2px 0} .muted{color:#8a857a} .owed{margin-top:6px;font-size:15px}
        button.pay{margin-top:10px;background:#cdee45;border:0;border-radius:99px;padding:10px 16px;font-family:inherit;font-weight:600;width:100%}
        table{border-collapse:collapse;width:100%;margin-top:8px;background:#fff;border-radius:12px;overflow:hidden}
        th,td{border-bottom:1px solid #ebe6da;padding:8px 10px;text-align:left} th{background:#ebe6da;text-transform:uppercase;font-size:10px;letter-spacing:.1em}
        .tag{border-radius:99px;padding:2px 8px;font-size:11px} .tag.done{background:#cdee45} .tag.pend{background:#ebe6da}
        @media(max-width:640px){thead{display:none}table,tbody,tr,td{display:block;width:100%}tr{border:1px solid #dcd6c8;border-radius:12px;margin-bottom:10px;padding:6px;background:#fff}td{border:0;padding:5px 10px;display:flex;justify-content:space-between;gap:12px}td:before{content:attr(data-l);text-transform:uppercase;font-size:9px;color:#8a857a}}
      </style></head><body>
      <h1>irlpass — host payouts</h1>
      <a href="/api/applications?key=${esc(key)}">← applications</a>
      <div class="stats">
        <div class="stat"><span class="muted">lifetime gross</span><b>${money(lifetimeGross)}</b></div>
        <div class="stat"><span class="muted">your cut (20%)</span><b>${money(lifetimeTake)}</b></div>
      </div>
      <h2>owed to hosts (unpaid)</h2>
      ${hostCards || '<p class="muted">nothing owed right now.</p>'}
      <h2>recent seat sales</h2>
      <table><thead><tr><th>event</th><th>buyer</th><th>host</th><th>amount</th><th>status</th><th>when</th></tr></thead><tbody>${ledger || ""}</tbody></table>
      <script>
        const KEY = ${JSON.stringify(key)};
        document.querySelectorAll("button.pay").forEach((b) => b.addEventListener("click", async () => {
          if (!confirm("mark all pending seats for this host as paid out? (do this AFTER you've sent the nequi)")) return;
          b.disabled = true; b.textContent = "saving…";
          await fetch("/api/payouts?key=" + encodeURIComponent(KEY), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ host: b.dataset.host }) });
          location.reload();
        }));
      </script>
      </body></html>`)
  } catch (e) {
    console.error("payouts error:", e)
    return res.status(500).json({ error: "payouts failed" })
  }
}
