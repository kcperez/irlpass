import { db } from "./_db.js"

// one-click unsubscribe from notification emails
export default async function handler(req, res) {
  const t = req.query?.t
  if (t && /^[a-f0-9]{32}$/.test(t)) {
    await db.from("members").update({ notify: false }).eq("token", t).then(() => {}, () => {})
  }
  res.setHeader("content-type", "text/html; charset=utf-8")
  return res.status(200).send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <div style="font-family:-apple-system,sans-serif;background:#1c1b17;color:#f4f1ea;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px">
      <p style="font-size:24px;font-weight:800">notifications off.</p>
      <p style="color:#8a857a;max-width:30ch">you won't get emails from irlpass anymore. you can turn them back on in your profile.</p>
      <a href="https://irlpass.xyz" style="margin-top:20px;background:#cdee45;color:#1c1b17;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 24px">back to irlpass</a>
    </div>`)
}
