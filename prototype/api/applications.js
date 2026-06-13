import { list, get } from "@vercel/blob"
import { db } from "./_db.js"

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

export default async function handler(req, res) {
  const key = req.query?.key
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" })
  }

  try {
    const { blobs } = await list({ prefix: "applications/", limit: 1000 })
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))

    const apps = []
    for (const b of blobs) {
      try {
        const g = await get(b.pathname, { access: "private" })
        if (!g) continue
        const record = JSON.parse(await new Response(g.stream).text())
        apps.push(record)
      } catch {
        // skip unreadable blob
      }
    }

    if ((req.headers.accept || "").includes("text/html")) {
      // cross-check who's already accepted/paid so refreshes show real state
      const { data: memberRows } = await db.from("members").select("ig, email, member_no, paid, banned")
      const memberFor = (a) =>
        (memberRows || []).find(
          (m) => m.ig === a.ig || m.email === String(a.email).toLowerCase()
        )
      const rows = apps
        .map((a, i) => {
          const m = memberFor(a)
          const status = !m
            ? `<button class="accept" data-name="${esc(a.name)}" data-ig="${esc(a.ig)}" data-email="${esc(a.email)}">accept</button>`
            : m.banned
              ? `<span class="tag banned">banned</span>`
              : m.paid
                ? `<span class="tag paid">paid · nº ${esc(m.member_no)}</span>`
                : `<span class="tag accepted">accepted · nº ${esc(m.member_no)} · awaiting payment</span>`
          return `<tr>
            <td>${apps.length - i}</td>
            <td>${esc(a.name)}${a.country ? ` <small>(${esc(a.country)})</small>` : ""}</td>
            <td><a href="https://instagram.com/${esc(String(a.ig).replace(/^@/, ""))}" target="_blank">${esc(a.ig)}</a></td>
            <td><a href="mailto:${esc(a.email)}">${esc(a.email)}</a></td>
            <td>${esc(a.dates)}</td>
            <td>${esc((a.reasons || []).join(", "))}</td>
            <td>${esc(new Date(a.submittedAt).toLocaleString("en-US", { timeZone: "America/Bogota" }))}</td>
            <td>${status}</td>
          </tr>`
        })
        .join("")
      res.setHeader("content-type", "text/html; charset=utf-8")
      return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><title>irlpass applications</title>
        <meta name="robots" content="noindex">
        <style>
          body{font-family:ui-monospace,Menlo,monospace;background:#f4f1ea;color:#1c1b17;padding:24px;font-size:13px}
          h1{font-size:16px} .count{background:#cdee45;border-radius:99px;padding:2px 10px}
          table{border-collapse:collapse;width:100%;margin-top:16px;background:#fff}
          th,td{border:1px solid #dcd6c8;padding:8px 10px;text-align:left;vertical-align:top}
          th{background:#ebe6da;text-transform:uppercase;font-size:10px;letter-spacing:.1em}
          a{color:#1c1b17}
          .tag{border-radius:99px;padding:3px 10px;font-size:11px;white-space:nowrap}
          .tag.paid{background:#cdee45}
          .tag.accepted{background:#ebe6da}
          .tag.banned{background:#e8b09c}
        </style></head><body>
        <h1>irlpass — applications <span class="count">${apps.length}</span> <small>(times in Bogotá)</small></h1>
        <table><tr><th>#</th><th>name</th><th>instagram</th><th>email</th><th>dates</th><th>here for</th><th>submitted</th><th></th></tr>${rows}</table>
        <script>
          const KEY = ${JSON.stringify(key)};
          document.querySelectorAll("button.accept").forEach((btn) => {
            btn.addEventListener("click", async () => {
              btn.disabled = true; btn.textContent = "creating…";
              try {
                const r = await fetch("/api/accept?key=" + encodeURIComponent(KEY), {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ name: btn.dataset.name, ig: btn.dataset.ig, email: btn.dataset.email }),
                });
                const d = await r.json();
                if (!d.url) throw new Error(d.error || "failed");
                await navigator.clipboard.writeText(d.url).catch(() => {});
                btn.outerHTML = '<span>nº ' + d.memberNo + ' · <a href="' + d.url + '" target="_blank">offer link</a> (copied)</span>';
              } catch (e) {
                btn.disabled = false; btn.textContent = "accept";
                alert("could not accept: " + e.message);
              }
            });
          });
        </script>
        </body></html>`)
    }

    return res.status(200).json({ count: apps.length, applications: apps })
  } catch (e) {
    console.error("applications error:", e)
    return res.status(500).json({ error: "could not load applications" })
  }
}
