import { db } from "./_db.js"
import { sendEmail } from "./_email.js"

const COOLDOWN_MS = 90_000 // don't email the same member more than once per 90s

// notify a member by member_no if they're opted in and not in cooldown. fire-and-forget.
export async function notifyMemberNo(memberNo, { subject, line, ctaLabel = "open irlpass" }) {
  try {
    const { data: m } = await db
      .from("members")
      .select("token, name, email, notify, last_notified_at")
      .eq("member_no", memberNo)
      .maybeSingle()
    if (!m || !m.notify || !m.email) return
    if (m.last_notified_at && Date.now() - new Date(m.last_notified_at).getTime() < COOLDOWN_MS) return

    await sendEmail({
      to: m.email,
      subject,
      html: `
        <h1 style="font-size:26px;margin:0;letter-spacing:-0.5px;color:#1c1b17">hey ${m.name.toLowerCase()}.</h1>
        <p style="font-size:15px;line-height:1.6;color:#57544a;margin:12px 0 0">${line}</p>
        <a href="https://irlpass.xyz/?screen=app&t=${m.token}" style="display:block;background:#cdee45;color:#1c1b17;text-decoration:none;font-weight:700;font-size:15px;text-align:center;border-radius:999px;padding:14px;margin-top:20px">${ctaLabel}</a>
        <p style="font-size:11px;color:#8a857a;text-align:center;margin:14px 0 0">
          <a href="https://irlpass.xyz/api/notify-off?t=${m.token}" style="color:#8a857a">turn off these emails</a>
        </p>`,
    })
    await db.from("members").update({ last_notified_at: new Date().toISOString() }).eq("member_no", memberNo)
  } catch (e) {
    console.error("notify error:", e)
  }
}
