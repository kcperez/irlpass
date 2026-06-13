import { getMember } from "./_lib.js"

export default async function handler(req, res) {
  const member = await getMember(req.query?.t)
  if (!member) return res.status(401).json({ error: "not a member" })
  return res.status(200).json({
    name: member.name,
    ig: member.ig,
    memberNo: member.memberNo,
    city: member.city || "medellin",
    photo: member.photo || null,
  })
}
