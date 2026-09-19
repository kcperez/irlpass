const FROM = "irlpass <hello@irlpass.xyz>"

// full document + color-scheme:light-only stops Apple Mail / Gmail dark mode
// from inverting our palette and wrecking the branding
const shell = (inner) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  body, table { margin:0; padding:0; }
  u + .body .gmail-fix { display:none; }
  @media (prefers-color-scheme: dark) {
    .ink-bg { background:#1c1b17 !important; }
    .cream-card { background:#f4f1ea !important; }
    .ink-text { color:#1c1b17 !important; }
  }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#1c1b17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ink-bg" style="background:#1c1b17">
<tr><td align="center" style="padding:36px 16px">
  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%">
    <tr><td>
      <a href="https://irlpass.xyz" style="text-decoration:none">
        <img src="https://irlpass.xyz/logo.png" alt="irlpass" height="44" style="display:block;height:44px;width:auto;border:0" />
      </a>
    </td></tr>
    <tr><td style="height:20px;line-height:20px;font-size:0">&nbsp;</td></tr>
    <tr><td class="cream-card ink-text" style="background:#f4f1ea;border-radius:20px;padding:28px 24px;color:#1c1b17">
      ${inner}
    </td></tr>
    <tr><td style="padding-top:16px;text-align:center">
      <span style="color:#8a857a;font-size:11px;letter-spacing:1px;text-transform:uppercase">
        the vetted travel club · <a href="https://irlpass.xyz" style="color:#8a857a">irlpass.xyz</a>
      </span>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`

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

// v2: someone posted dates that overlap yours. the loop that brings people back.
export const matchEmail = ({ name, who, city, starts, ends, url }) => ({
  subject: `${who} will be in ${city} on your dates`,
  html: `
    <h1 style="font-size:26px;margin:0;letter-spacing:-0.5px">hey ${name ? name.toLowerCase() : "there"}.</h1>
    <p style="font-size:15px;line-height:1.6;color:#57544a;margin:12px 0 0">
      ${who} just posted <strong>${starts} to ${ends}</strong> in ${city}, which overlaps your trip.
    </p>
    <a href="${url}" style="display:block;background:#cdee45;color:#1c1b17;text-decoration:none;font-weight:700;font-size:16px;text-align:center;border-radius:999px;padding:15px;margin-top:20px">
      see who else is there
    </a>
    <p style="font-size:12px;color:#8a857a;text-align:center;margin:12px 0 0">
      <a href="https://irlpass.xyz/api/notify-off?t=" style="color:#8a857a">turn off these emails</a>
    </p>`,
})

// v2 launch email. deliberately not the plain login template: a big statement,
// real numbers, and a sample of the calendar people are about to see.
export const datesEmail = ({ name, memberNo, url, slotsLeft, members = 182, unsub }) => ({
  subject: "irlpass v2 is live. never travel alone.",
  html: `
    <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a857a;margin:0">irlpass v2 · live now</p>
    <h1 style="font-size:40px;line-height:0.98;margin:10px 0 0;letter-spacing:-1.2px;font-weight:800">
      never travel<br>alone.
    </h1>
    <p style="font-size:16px;line-height:1.6;color:#57544a;margin:16px 0 0">
      hey ${name ? name.toLowerCase() : "there"}, the whole app is one thing now: you post the dates
      you'll be in a city, and you see every one of the ${members} travelers whose trip overlaps yours.
    </p>

    <div style="background:#1c1b17;border-radius:18px;padding:18px;margin-top:22px">
      <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8a857a;margin:0">medellín · this week</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
        <tr>
          <td style="color:#f4f1ea;font-size:15px;font-weight:600;padding-bottom:9px">josh · mar 10 – 20<span style="color:#cdee45"> · surf, coffee</span></td>
        </tr>
        <tr>
          <td style="color:#57544a;font-size:15px;font-weight:600;padding-bottom:9px">a•••••  · mar 12 – 18 · hiking</td>
        </tr>
        <tr>
          <td style="color:#57544a;font-size:15px;font-weight:600">d••••• · mar 11 – 16 · climbing</td>
        </tr>
      </table>
    </div>

    <p style="font-size:16px;line-height:1.6;color:#1c1b17;margin:20px 0 0">
      <strong>the first ${slotsLeft || 40} people to post dates message everyone free, forever.</strong>
      after that it's $19 for a trip or $29 a month.
    </p>

    <a href="${url}" style="display:block;background:#cdee45;color:#1c1b17;text-decoration:none;font-weight:800;font-size:17px;text-align:center;border-radius:999px;padding:17px;margin-top:22px">
      post your dates
    </a>
    <p style="font-size:13px;color:#8a857a;text-align:center;margin:14px 0 0">
      takes 30 seconds · nº ${memberNo} is still yours
    </p>
    <p style="font-size:11px;color:#b3aea2;text-align:center;margin:16px 0 0">
      <a href="${unsub || "https://irlpass.xyz"}" style="color:#b3aea2">turn off these emails</a>
    </p>`,
})
