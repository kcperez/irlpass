// Josh runs support and moderation, so he is in every city room and can always
// be messaged, free, by anyone. Kevin too.
export const MODS = String(process.env.MOD_MEMBER_NOS || "001,002")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

export const isMod = (memberNo) => MODS.includes(String(memberNo))
