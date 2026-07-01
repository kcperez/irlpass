import { getUser } from "./_lib.js"

export default async function handler(req, res) {
  // free tier: any accepted, non-banned user gets in. `paid` tells the client
  // which premium actions to lock behind the contextual paywall.
  const member = await getUser(req.query?.t)
  if (!member) return res.status(401).json({ error: "not a member" })
  return res.status(200).json({
    name: member.name,
    ig: member.ig,
    memberNo: member.memberNo,
    city: member.city || "medellin",
    photo: member.photo || null,
    canHost: member.canHost,
    paid: !!member.paid,
    gender: member.gender,
    verified: member.verified,
    repScore: member.repScore,
    repCount: member.repCount,
    allowDmFromMen: member.allowDmFromMen,
    showIgToMen: member.showIgToMen,
  })
}
