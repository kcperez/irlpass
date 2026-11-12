import { db } from "./_db.js"
import { stripe } from "./_stripe.js"

// ops: who paid, straight from stripe. every recent charge + every payout broken
// down to the charges inside it, matched to a member by stripe customer or email.
// /api/revenue?key=ADMIN_KEY   (add &format=json for raw)
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
const money = (cents) => `$${(cents / 100).toFixed(2)}`
const day = (t) =>
  new Date(t * 1000).toLocaleDateString("en-US", { timeZone: "America/Bogota", month: "short", day: "numeric" })

export default async function handler(req, res) {
  if (!process.env.ADMIN_KEY || req.query?.key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" })
  }
  try {
    const { data: members } = await db.from("members").select("member_no, name, email, city, stripe_customer")
    const who = (customer, email) => {
      const m =
        (members || []).find((x) => customer && x.stripe_customer === customer) ||
        (members || []).find((x) => email && x.email && x.email.toLowerCase() === email.toLowerCase())
      return m ? `nº ${m.member_no} ${m.name}` : null
    }
    const row = (c) => ({
      id: c.id,
      when: day(c.created),
      amount: c.amount,
      refunded: c.amount_refunded,
      status: c.status,
      what: c.description || c.calculated_statement_descriptor || "",
      email: c.billing_details?.email || c.receipt_email || "",
      name: c.billing_details?.name || "",
      member: who(c.customer, c.billing_details?.email || c.receipt_email),
    })

    const charges = (await stripe("charges?limit=50")).data.map(row)

    const payouts = []
    for (const p of (await stripe("payouts?limit=6")).data) {
      const txns = (await stripe(`balance_transactions?payout=${p.id}&limit=100&expand[]=data.source`)).data
      payouts.push({
        id: p.id,
        amount: p.amount,
        status: p.status,
        sent: day(p.created),
        arrives: day(p.arrival_date),
        items: txns
          .filter((t) => t.type !== "payout")
          .map((t) => ({
            type: t.type,
            gross: t.amount,
            fee: t.fee,
            net: t.net,
            ...(t.source?.object === "charge" ? row(t.source) : {}),
          })),
      })
    }

    if (req.query?.format === "json") return res.status(200).json({ payouts, charges })

    const person = (r) => esc(r.member || r.name || r.email || "unknown")
    const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>irlpass revenue</title>
<style>body{font:14px/1.45 -apple-system,system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#111;background:#faf8f3}
h1{font-size:22px}h2{font-size:16px;margin-top:28px}table{width:100%;border-collapse:collapse;margin:8px 0}
td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #e6e1d6}th{font-weight:600;color:#666}.r{text-align:right}.m{color:#666}</style>
<h1>irlpass revenue</h1>
<h2>payouts</h2>
${payouts
  .map(
    (p) => `<p><b>${money(p.amount)}</b> <span class=m>sent ${p.sent} · arrives ${p.arrives} · ${esc(p.status)}</span></p>
<table><tr><th>who</th><th>what</th><th>paid</th><th class=r>gross</th><th class=r>fee</th><th class=r>net</th></tr>
${p.items
  .map(
    (i) =>
      `<tr><td>${person(i)}</td><td>${esc(i.what || i.type)}</td><td>${esc(i.when || "")}</td><td class=r>${money(i.gross)}</td><td class=r>${money(i.fee)}</td><td class=r>${money(i.net)}</td></tr>`
  )
  .join("")}</table>`
  )
  .join("")}
<h2>every charge (last 50)</h2>
<table><tr><th>when</th><th>who</th><th>email</th><th>what</th><th class=r>amount</th><th>status</th></tr>
${charges
  .map(
    (c) =>
      `<tr><td>${c.when}</td><td>${person(c)}</td><td class=m>${esc(c.email)}</td><td>${esc(c.what)}</td><td class=r>${money(c.amount)}${c.refunded ? ` <span class=m>(−${money(c.refunded)})</span>` : ""}</td><td>${esc(c.status)}</td></tr>`
  )
  .join("")}</table>`
    res.setHeader("content-type", "text/html; charset=utf-8")
    res.setHeader("x-robots-tag", "noindex")
    return res.status(200).send(html)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
