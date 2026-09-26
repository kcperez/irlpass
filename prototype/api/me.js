import { getUser } from "./_lib.js"
import { db } from "./_db.js"
import { today } from "./_access.js"
import { refreshIfStale } from "./_instagram.js"
import { waitUntil } from "@vercel/functions"

export default async function handler(req, res) {
  // free tier: any accepted, non-banned user gets in. `paid` tells the client
  // which premium actions to lock behind the contextual paywall.
  const member = await getUser(req.query?.t)
  if (!member) return res.status(401).json({ error: "not a member" })
  // keep their instagram photo and follower count current, quietly
  waitUntil(refreshIfStale(member).catch(() => {}))

  // v2: where you are is where your next trip is
  const { data: trip } = await db
    .from("trips")
    .select("city")
    .eq("member_no", member.memberNo)
    .gte("ends", today())
    .order("starts")
    .limit(1)
    .maybeSingle()

  return res.status(200).json({
    name: member.name,
    ig: member.ig,
    memberNo: member.memberNo,
    city: trip?.city || member.city || "medellin",
    photo: member.photo || null,
    canHost: member.canHost,
    paid: !!member.paid,
    billing: !!member.stripeCustomer,
    gender: member.gender,
    verified: member.verified,
    igFollowers: member.igFollowers,
    repScore: member.repScore,
    repCount: member.repCount,
    allowDmFromMen: member.allowDmFromMen,
    showIgToMen: member.showIgToMen,
    foundingFree: !!member.foundingFree,
    foundingNo: member.foundingNo,
    interests: member.interests || [],
  })
}
