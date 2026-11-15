// the web manifest, with the member's token in start_url so the home-screen
// app opens signed in (iphone gives installed apps separate storage from safari).
// GET /api/manifest?t=TOKEN . keep in step with public/manifest.webmanifest
const BASE = {
  "name": "irlpass",
  "short_name": "irlpass",
  "description": "meet people where you are. events, who's going and a chat for each.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#15110f",
  "theme_color": "#15110f",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}

export default function handler(req, res) {
  const t = String(req.query?.t || "")
  const start = /^[A-Za-z0-9]{16,64}$/.test(t) ? `/?screen=app&t=${t}` : "/"
  res.setHeader("content-type", "application/manifest+json")
  res.setHeader("cache-control", "private, no-store")
  res.setHeader("x-robots-tag", "noindex")
  return res.status(200).send(JSON.stringify({ ...BASE, id: "/", start_url: start }))
}
