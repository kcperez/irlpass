const FROM = "irlpass <hello@irlpass.xyz>"

const shell = (inner) => `
<div style="background:#1c1b17;padding:36px 16px;font-family:-apple-system,Helvetica,Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto">
    <a href="https://irlpass.xyz" style="text-decoration:none">
      <img src="https://irlpass.xyz/logo.png" alt="irlpass" height="44" style="display:block;height:44px;width:auto" />
    </a>
    <div style="background:#f4f1ea;border-radius:20px;padding:28px 24px;margin-top:20px;color:#1c1b17">
      ${inner}
    </div>
    <p style="color:#8a857a;font-size:11px;margin-top:16px;text-align:center;letter-spacing:1px;text-transform:uppercase">
      the vetted travel club · <a href="https://irlpass.xyz" style="color:#8a857a">irlpass.xyz</a>
    </p>
  </div>
</div>`

export async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) return { sent: false, reason: "no key" }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html: shell(html) }),
    })
    const d = await r.json()
    if (!r.ok) {
      console.error("email error:", d?.message)
      return { sent: false, reason: d?.message }
    }
    return { sent: true, id: d.id }
  } catch (e) {
    console.error("email error:", e)
    return { sent: false, reason: "network" }
  }
}

export const acceptanceEmail = ({ name, memberNo, url }) => ({
  subject: `you're in. founding member nº ${memberNo} of irlpass`,
  html: `
    <p style="font-size:13px;text-transform:uppercase;letter-spacing:2px;color:#7a9c0a;font-weight:700;margin:0">application approved</p>
    <h1 style="font-size:30px;margin:8px 0 0;letter-spacing:-0.5px">congrats, ${name.toLowerCase()}.</h1>
    <p style="font-size:15px;line-height:1.6;color:#57544a;margin:14px 0 0">
      a founder read your application and you're in. founding member nº ${memberNo} of 050 has your
      name on it: the vetted club, the activity board, the city lobby, the thursday tables.
    </p>
    <a href="${url}" style="display:block;background:#cdee45;color:#1c1b17;text-decoration:none;font-weight:700;font-size:16px;text-align:center;border-radius:999px;padding:15px;margin-top:22px">
      claim spot nº ${memberNo}
    </a>
    <p style="font-size:12px;color:#8a857a;text-align:center;margin:12px 0 0">
      this link is yours only. your spot is held for 24 hours.
    </p>`,
})

export const loginEmail = ({ name, url, label }) => ({
  subject: "your irlpass login link",
  html: `
    <h1 style="font-size:26px;margin:0;letter-spacing:-0.5px">hey ${name ? name.toLowerCase() : "there"}.</h1>
    <p style="font-size:15px;line-height:1.6;color:#57544a;margin:12px 0 0">
      tap below to get back in. this link signs you in on this device.
    </p>
    <a href="${url}" style="display:block;background:#1c1b17;color:#f4f1ea;text-decoration:none;font-weight:700;font-size:16px;text-align:center;border-radius:999px;padding:15px;margin-top:20px">
      ${label}
    </a>`,
})
