export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" })
  const { pw } = req.body || {}
  if (!process.env.ADMIN_PW || !pw || pw !== process.env.ADMIN_PW) {
    return res.status(401).json({ error: "wrong password" })
  }
  return res.status(200).json({ key: process.env.ADMIN_KEY })
}
