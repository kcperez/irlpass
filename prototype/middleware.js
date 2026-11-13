// getty.irlpass.xyz is the venue site. its home page has to win over the app's
// index.html, so the root is rewritten here (the other paths are in vercel.json).
export const config = { matcher: "/" }

export default function middleware(req) {
  const url = new URL(req.url)
  if (!url.hostname.startsWith("getty.")) return
  return new Response(null, { headers: { "x-middleware-rewrite": new URL("/api/venues-hub?view=landing", url).toString() } })
}
