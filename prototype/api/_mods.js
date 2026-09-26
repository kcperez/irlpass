// Josh runs support and moderation, so he is in every city room and can always
// be messaged, free, by anyone. Kevin too.
export const MODS = String(process.env.MOD_MEMBER_NOS || "001,002")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

export const isMod = (memberNo) => MODS.includes(String(memberNo))

// a mod who flipped to member view gets treated like any free member, so they
// can test the real experience. use this for anything the viewer can or can't do.
export const actsAsMod = (me) => !!me && isMod(me.memberNo) && !me.modOff
