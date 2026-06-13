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
            <td data-l="#">${apps.length - i}</td>
            <td data-l="name">${esc(a.name)}${a.country ? ` <small>(${esc(a.country)})</small>` : ""}</td>
            <td data-l="instagram"><a href="https://instagram.com/${esc(String(a.ig).replace(/^@/, ""))}" target="_blank">${esc(a.ig)}</a></td>
            <td data-l="email"><a href="mailto:${esc(a.email)}">${esc(a.email)}</a></td>
            <td data-l="dates">${esc(a.dates)}</td>
            <td data-l="here for">${esc((a.reasons || []).join(", "))}</td>
            <td data-l="submitted">${esc(new Date(a.submittedAt).toLocaleString("en-US", { timeZone: "America/Bogota" }))}</td>
            <td data-l="status">${status}</td>
          </tr>`
        })
        .join("")
      res.setHeader("content-type", "text/html; charset=utf-8")
      return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><title>irlpass applications</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex">
        <style>
          *{box-sizing:border-box}
          body{font-family:ui-monospace,Menlo,monospace;background:#f4f1ea;color:#1c1b17;padding:16px;font-size:13px;margin:0}
          h1{font-size:16px;margin:0 0 4px} .count{background:#cdee45;border-radius:99px;padding:2px 10px}
          .invite{margin:14px 0;padding:14px;background:#fff;border:1px solid #dcd6c8;border-radius:12px}
          .invite input{padding:10px;border:1px solid #dcd6c8;border-radius:8px;width:100%;margin:8px 0;font-family:inherit}
          .invite button,td button{background:#1c1b17;color:#f4f1ea;border:0;border-radius:99px;padding:10px 16px;font-family:inherit;font-size:13px;font-weight:600}
          table{border-collapse:collapse;width:100%;margin-top:8px;background:#fff;border-radius:12px;overflow:hidden}
          th,td{border-bottom:1px solid #ebe6da;padding:10px;text-align:left;vertical-align:top}
          th{background:#ebe6da;text-transform:uppercase;font-size:10px;letter-spacing:.1em}
          a{color:#1c1b17}
          .tag{display:inline-block;border-radius:99px;padding:4px 10px;font-size:11px}
          .tag.paid{background:#cdee45}
          .tag.accepted{background:#ebe6da}
          .tag.banned{background:#e8b09c}
          /* phone: each row becomes a stacked card with field labels */
          @media(max-width:640px){
            thead{display:none}
            table,tbody,tr,td{display:block;width:100%}
            tr{border:1px solid #dcd6c8;border-radius:12px;margin-bottom:12px;padding:6px;background:#fff}
            td{border:0;padding:6px 10px;display:flex;justify-content:space-between;gap:12px;align-items:center}
            td:before{content:attr(data-l);text-transform:uppercase;font-size:9px;letter-spacing:.1em;color:#8a857a;flex:0 0 auto}
            td:first-child{font-weight:700;border-bottom:1px solid #ebe6da;margin-bottom:4px}
            td button{width:100%}
          }
        </style></head><body>
        <h1>irlpass — applications <span class="count">${apps.length}</span></h1>
        <small style="color:#8a857a">times in Bogotá</small>
        <div class="invite">
          <b>free invite codes</b> — vouch a friend in past the paywall
          <input id="lbl" placeholder="label (optional, e.g. 'josh's friend')">
          <button id="gen">generate code</button>
          <div id="codeout" style="margin-top:8px"></div>
        </div>
        <table><thead><tr><th>#</th><th>name</th><th>instagram</th><th>email</th><th>dates</th><th>here for</th><th>submitted</th><th>status</th></tr></thead><tbody>${rows}</tbody></table>
        <script>
          const KEY = ${JSON.stringify(key)};
          document.getElementById("gen").addEventListener("click", async () => {
            const out = document.getElementById("codeout");
            out.textContent = " generating…";
            try {
              const r = await fetch("/api/invite-code?key=" + encodeURIComponent(KEY), {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ label: document.getElementById("lbl").value, maxUses: 1 }),
              });
              const d = await r.json();
              if (!d.code) throw new Error(d.error || "failed");
              await navigator.clipboard.writeText(d.url).catch(() => {});
              out.innerHTML = ' <b style="background:#cdee45;padding:2px 8px;border-radius:6px">' + d.code + '</b> — link copied, text it to your friend';
            } catch (e) { out.textContent = " error: " + e.message; }
          });
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
