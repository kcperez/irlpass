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
    .paper { background:#f7f3ed !important; }
    .card { background:#fffdfa !important; }
    .ink { color:#3a322c !important; }
    .muted { color:#837a70 !important; }
  }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#f7f3ed">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="paper" style="background:#f7f3ed">
<tr><td align="center" style="padding:28px 16px 40px">
  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%">
    <tr><td style="padding-bottom:14px">
      <span style="font:800 22px/1 Archivo,'Helvetica Neue',Arial,sans-serif;letter-spacing:-0.6px;color:#3a322c">irl<span style="background:#ddd0f6;border-radius:7px;padding:1px 6px">pass</span></span>
    </td></tr>
    <tr><td class="card ink" style="background:#fffdfa;border-radius:24px;padding:26px 24px;color:#3a322c">
      ${inner}
    </td></tr>
    <tr><td style="padding-top:14px;text-align:center">
      <span class="muted" style="color:#837a70;font:400 11px/1.6 -apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;letter-spacing:1px;text-transform:uppercase">
        the hostel's on your phone · <a href="https://irlpass.xyz" style="color:#837a70">irlpass.xyz</a>
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
    <p style="font-size:15px;line-height:1.6;color:#655c53;margin:14px 0 0">
      a founder read your application and you're in. founding member nº ${memberNo} of 050 has your
      name on it: the vetted club, the activity board, the city lobby, the thursday tables.
    </p>
    <a href="${url}" style="display:block;background:#3a322c;color:#fdfaf6;text-decoration:none;font-weight:700;font-size:16px;text-align:center;border-radius:999px;padding:15px;margin-top:22px">
      claim spot nº ${memberNo}
    </a>
    <p style="font-size:12px;color:#837a70;text-align:center;margin:12px 0 0">
      this link is yours only. your spot is held for 24 hours.
    </p>`,
})

export const loginEmail = ({ name, url, label }) => ({
  subject: "your irlpass login link",
  html: `
    <h1 style="font-size:26px;margin:0;letter-spacing:-0.5px">hey ${name ? name.toLowerCase() : "there"}.</h1>
    <p style="font-size:15px;line-height:1.6;color:#655c53;margin:12px 0 0">
      tap below to get back in. this link signs you in on this device.
    </p>
    <a href="${url}" style="display:block;background:#3a322c;color:#fdfaf6;text-decoration:none;font-weight:700;font-size:16px;text-align:center;border-radius:999px;padding:15px;margin-top:20px">
      ${label}
    </a>`,
})

// v2: someone posted dates that overlap yours. the loop that brings people back.
// "someone's coming": the overlap email. a face and a first name, human dates,
// locals called locals, and the city's pulse at send time (the button opens the
// live board, since out status is gone by the time most people read email).
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const humanDate = (iso) => {
  const [, m, d] = String(iso).split("-").map(Number)
  return `${MONTHS[m - 1]} ${d}`
}
const firstOf = (n) => String(n || "").trim().split(/\s+/)[0] || ""

export const matchEmail = ({ name, who, whoPhoto, local, city, starts, ends, onDates, outTonight, url, unsub }) => {
  const them = firstOf(who) || "someone"
  const headline = local ? `${them} lives in ${city}` : `${them} will be in ${city} on your dates`
  return {
    subject: local ? `${them} lives in ${city}` : `${them} is coming to ${city} on your dates`,
    html: `
    <p style="font:400 16px/1.5 -apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#655c53;margin:0">hey ${firstOf(name).toLowerCase() || "there"},</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr>
      ${whoPhoto ? `<td style="padding-right:14px;vertical-align:middle"><img src="${whoPhoto}" alt="" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:32px;object-fit:cover;border:0" /></td>` : ""}
      <td style="vertical-align:middle">
        <p style="font:800 24px/1.1 Archivo,'Helvetica Neue',Arial,sans-serif;letter-spacing:-0.6px;color:#3a322c;margin:0">${headline}</p>
        ${local ? "" : `<p style="font:600 15px/1.4 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#837a70;margin:6px 0 0">${humanDate(starts)} – ${humanDate(ends)}</p>`}
      </td>
    </tr></table>
    <div style="background:#f2ecfc;border-radius:16px;padding:14px 16px;margin-top:20px">
      <p style="font:700 15px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#3a322c;margin:0">
        ${onDates} ${onDates === 1 ? "person" : "people"} in ${city} on your dates${outTonight ? ` · ${outTonight} going out tn` : ""}
      </p>
    </div>
    <a href="${url}" style="display:block;background:#3a322c;color:#fdfaf6;text-decoration:none;font:700 17px/1 -apple-system,BlinkMacSystemFont,Arial,sans-serif;text-align:center;border-radius:999px;padding:17px;margin-top:20px">
      see who's out
    </a>
    <p style="font:400 11px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#b8afa5;text-align:center;margin:14px 0 0">
      <a href="${unsub || "https://irlpass.xyz"}" style="color:#b8afa5">turn off these emails</a>
    </p>`,
  }
}

// v2 launch email. hook is CC-2 negative framing: people act on "you're
// invisible" far faster than on "we shipped something".
export const datesEmail = ({ name, memberNo, url, members = 200, unsub }) => ({
  subject: "you're on irlpass, but nobody can see you",
  html: `
    <img src="https://irlpass.xyz/art/hero.png" alt="" width="240" style="display:block;margin:0 auto 6px;width:240px;max-width:100%;height:auto;border:0" />
    <h1 style="font:800 34px/0.98 Archivo,'Helvetica Neue',Arial,sans-serif;letter-spacing:-1.1px;margin:0;color:#3a322c">
      you're invisible<br>until you post<br>your dates.
    </h1>
    <p style="font:400 16px/1.6 -apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#655c53;margin:16px 0 0">
      hey ${name ? name.toLowerCase() : "there"}, irlpass is one thing now. you put up where you'll be and when,
      and you see every traveler whose trip crosses yours.
    </p>
    <p style="font:400 16px/1.6 -apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#655c53;margin:12px 0 0">
      the catch: people with no dates up don't show anywhere. ${members} of us are in here and the calendar is still empty,
      so whoever goes first gets found first.
    </p>

    <div style="background:#f2ecfc;border-radius:18px;padding:16px;margin-top:20px">
      <p style="font:700 11px/1 -apple-system,BlinkMacSystemFont,Arial,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:#837a70;margin:0">medellín · your week</p>
      <p style="font:700 16px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#3a322c;margin:10px 0 0">
        you · <span style="background:#ddd0f6;border-radius:6px;padding:1px 6px">the days you pick</span>
      </p>
      <p style="font:700 16px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#b8afa5;margin:6px 0 0">
        a•••••  · whoever lands those days
      </p>
      <p style="font:700 16px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#b8afa5;margin:6px 0 0">
        d•••••  · and whoever's already there
      </p>
    </div>

    <a href="${url}" style="display:block;background:#3a322c;color:#fdfaf6;text-decoration:none;font:700 17px/1 -apple-system,BlinkMacSystemFont,Arial,sans-serif;text-align:center;border-radius:999px;padding:17px;margin-top:20px">
      post your dates
    </a>
    <p style="font:400 13px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#837a70;text-align:center;margin:12px 0 0">
      takes 30 seconds · nº ${memberNo} is still yours
    </p>
    <p style="font:400 11px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#b8afa5;text-align:center;margin:14px 0 0">
      <a href="${unsub || "https://irlpass.xyz"}" style="color:#b8afa5">turn off these emails</a>
    </p>`,
})

// a city hit critical mass: everyone who put dates there hears it first
export const cityOpenEmail = ({ name, city, count, url }) => ({
  subject: `${city} is live on irlpass`,
  html: `
    <p style="font:700 11px/1 -apple-system,BlinkMacSystemFont,Arial,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:#837a70;margin:0">it's open</p>
    <h1 style="font:800 32px/1 Archivo,'Helvetica Neue',Arial,sans-serif;letter-spacing:-1px;margin:10px 0 0;color:#3a322c">${city}<br>is live.</h1>
    <p style="font:400 16px/1.6 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#655c53;margin:16px 0 0">
      hey ${name ? name.toLowerCase() : "there"}, you put dates in for ${city} when nobody was there yet.
      ${count} people have now, so it's open.
    </p>
    <a href="${url}" style="display:block;background:#3a322c;color:#fdfaf6;text-decoration:none;font:700 17px/1 -apple-system,BlinkMacSystemFont,Arial,sans-serif;text-align:center;border-radius:999px;padding:17px;margin-top:20px">
      see who's there
    </a>`,
})

// EDC weekend reactivation (josh's sprint #2): the pre-v2 list, pointed at the
// mood tab. descriptive only: no festival logos, nothing that implies we're official.
export const edcEmail = ({ name, memberNo, url, unsub }) => ({
  subject: "EDC weekend in medellín: see who's going",
  html: `
    <p style="font:700 11px/1 -apple-system,BlinkMacSystemFont,Arial,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:#837a70;margin:0">medellín · oct 10–11</p>
    <h1 style="font:800 34px/0.98 Archivo,'Helvetica Neue',Arial,sans-serif;letter-spacing:-1.1px;margin:10px 0 0;color:#3a322c">
      EDC weekend<br>is in your<br>city.
    </h1>
    <p style="font:400 16px/1.6 -apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#655c53;margin:16px 0 0">
      hey ${name ? String(name).toLowerCase() : "there"}, the festival lands in medellín on october 10 and 11,
      and a lot of irlpass will be in town for it.
    </p>
    <p style="font:400 16px/1.6 -apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#655c53;margin:12px 0 0">
      there's a new mood tab. pick pregame, afters or something chill, tap "i'm going" on a spot,
      and see who else from irlpass is headed there that night.
    </p>

    <div style="background:#f2ecfc;border-radius:18px;padding:16px;margin-top:20px">
      <p style="font:700 16px/1.7 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#3a322c;margin:0">
        🍸 pregame · rooftops, bars, dinner<br>
        🪩 afters · the clubs, late<br>
        ☕ something chill · coffee, a gym, a walk the day after
      </p>
    </div>

    <a href="${url}" style="display:block;background:#3a322c;color:#fdfaf6;text-decoration:none;font:700 17px/1 -apple-system,BlinkMacSystemFont,Arial,sans-serif;text-align:center;border-radius:999px;padding:17px;margin-top:20px">
      pick your mood
    </a>
    <p style="font:400 13px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#837a70;text-align:center;margin:12px 0 0">
      the link opens your account · nº ${memberNo} is still yours
    </p>
    <p style="font:400 11px/1.5 -apple-system,BlinkMacSystemFont,Arial,sans-serif;color:#b8afa5;text-align:center;margin:14px 0 0">
      irlpass is independent and has no connection to the festival or its organizers ·
      <a href="${unsub || "https://irlpass.xyz"}" style="color:#b8afa5">turn off these emails</a>
    </p>`,
})
