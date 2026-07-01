import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { notifyMemberNo } from "./_notify.js"

const bogotaToday = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)

// recompute a member's reputation from all reviews pointed at them
async function recomputeRep(memberNo) {
  const { data } = await db.from("reviews").select("rating").eq("target_no", memberNo)
  const ratings = (data || []).map((r) => r.rating)
  const count = ratings.length
  const score = count ? Math.round((ratings.reduce((a, b) => a + b, 0) / count) * 10) / 10 : null
  await db.from("members").update({ rep_score: score, rep_count: count }).eq("member_no", memberNo)
  return { score, count }
}

// GET  ?t=&member=<no>           -> reviews written about a member (their reputation)
// POST { t, activityId, targetNo, targetType, rating, note }
//   leave a review for a meetup you actually attended. host reviews build the
//   host's rep; attendee reviews build that attendee's rep. one per pair per plan.
export default async function handler(req, res) {
  const token = req.method === "GET" ? req.query?.t : req.body?.t
  const me = await getUser(token)
  if (!me) return res.status(401).json({ error: "not a member" })

  try {
    if (req.method === "GET") {
      const member = String(req.query?.member || "")
      if (!member) return res.status(400).json({ error: "member required" })
      const { data, error } = await db
        .from("reviews")
        .select("rating, note, target_type, activity_id, created_at")
        .eq("target_no", member)
        .order("created_at", { ascending: false })
        .limit(50)
      if (error) throw error
      const ratings = data.map((r) => r.rating)
      const score = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null
      return res.status(200).json({ score, count: ratings.length, reviews: data })
    }

    if (req.method === "POST") {
      const { activityId, targetNo, targetType = "host", rating, note } = req.body || {}
      const rt = parseInt(rating)
      if (!activityId || !/^[a-f0-9]{16}$/.test(activityId)) return res.status(400).json({ error: "bad activity" })
      if (!targetNo) return res.status(400).json({ error: "target required" })
      if (!(rt >= 1 && rt <= 5)) return res.status(400).json({ error: "rating 1-5" })
      if (targetNo === me.memberNo) return res.status(400).json({ error: "can't review yourself" })

      const { data: act } = await db.from("activities").select("*").eq("id", activityId).maybeSingle()
      if (!act) return res.status(404).json({ error: "not found" })
      // you can only review a meetup you joined, and only after it has happened
      const iWasThere = act.joined.some((j) => j.memberNo === me.memberNo)
      const targetWasThere = act.joined.some((j) => j.memberNo === targetNo) || act.creator.memberNo === targetNo
      if (!iWasThere) return res.status(403).json({ error: "review plans you actually joined" })
      if (!targetWasThere) return res.status(400).json({ error: "they weren't on this plan" })
      if (act.event_date >= bogotaToday()) return res.status(400).json({ error: "review it after it happens" })

      const type = targetNo === act.creator.memberNo ? "host" : "attendee"
      const { error } = await db.from("reviews").upsert(
        {
          activity_id: activityId,
          reviewer_no: me.memberNo,
          target_no: targetNo,
          target_type: type === "host" ? "host" : targetType === "attendee" ? "attendee" : type,
          rating: rt,
          note: note ? String(note).slice(0, 280) : null,
        },
        { onConflict: "activity_id,reviewer_no,target_no" }
      )
      if (error) throw error
      const rep = await recomputeRep(targetNo)
      if (rt >= 4) {
        notifyMemberNo(targetNo, {
          subject: `${me.name.toLowerCase()} vouched for you`,
          line: `${me.name.toLowerCase()} left you a good review from "${act.title}". your rep just went up.`,
          ctaLabel: "see your profile",
        })
      }
      return res.status(200).json({ ok: true, rep })
    }

    return res.status(405).json({ error: "method not allowed" })
  } catch (e) {
    console.error("reviews error:", e)
    return res.status(500).json({ error: "reviews failed" })
  }
}
