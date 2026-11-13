import { ImageResponse } from "@vercel/og"

// a share card for events without a photo: the event's name as a poster in
// our colours, with when and where. whatsapp and imessage show it as the preview.
// GET /api/og?id=<event id>
export const config = { runtime: "edge" }
const TZ = { miami: "America/New_York", "new-york": "America/New_York", "los-angeles": "America/Los_Angeles", medellin: "America/Bogota", palermo: "Europe/Rome" }
const h = (type, style, ...children) => ({ type, props: { style, children: children.length > 1 ? children : children[0] } })

export default async function handler(req) {
  const id = Number(new URL(req.url).searchParams.get("id"))
  let e = null
  if (id) {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/events?id=eq.${id}&select=title,titles,venue,city,starts_at`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
    }).catch(() => null)
    e = (await r?.json().catch(() => null))?.[0] || null
  }
  const title = String(e?.titles?.en || e?.title || "irlpass").toLowerCase()
  const when = e ? new Date(e.starts_at).toLocaleString("en-US", { timeZone: TZ[e.city] || "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).toLowerCase() : ""
  const where = [e?.venue, e?.city].filter(Boolean).join(" · ").toLowerCase()
  const size = title.length > 60 ? 64 : title.length > 36 ? 80 : 100
  const font = await fetch("https://cdn.jsdelivr.net/fontsource/fonts/poppins@latest/latin-700-normal.ttf").then((r) => r.arrayBuffer()).catch(() => null)
  return new ImageResponse(
    h("div", { width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", color: "#fff", fontFamily: "P", background: "radial-gradient(90% 90% at 85% 10%, #4a66ff 0%, #2c45e6 35%, #15110f 85%)" },
      h("div", { display: "flex", fontSize: 30, opacity: 0.85, letterSpacing: 2 }, when.toUpperCase()),
      h("div", { display: "flex", fontSize: size, lineHeight: 1, letterSpacing: -2, maxWidth: 1000 }, title.slice(0, 110)),
      h("div", { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30 },
        h("div", { display: "flex", opacity: 0.85 }, where.slice(0, 60)),
        h("div", { display: "flex", alignItems: "center", background: "#fff", color: "#2c45e6", borderRadius: 999, padding: "10px 26px" }, "irlpass")
      )
    ),
    { width: 1200, height: 630, fonts: font ? [{ name: "P", data: font, weight: 700 }] : [], headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } }
  )
}
