import { db } from "./_db.js"
import { stripe } from "./_stripe.js"
import { setting } from "./_access.js"

// classpass-style referrals: your friend joins through your link, and once you
// are both on the monthly plan, you each get a free month (a stripe credit on
// your next bill, amount editable in ops). each pair is rewarded once.
export async function rewardReferrals(memberNo) {
  const { data: pairs } = await db
    .from("referrals")
    .select("referee, referrer, rewarded_at")
    .or(`referee.eq.${memberNo},referrer.eq.${memberNo}`)
    .is("rewarded_at", null)
  if (!pairs?.length) return 0
  const cents = Number(await setting("referral_reward_cents", "2900")) || 2900
  let done = 0
  for (const p of pairs) {
    const { data: rows } = await db
      .from("members")
      .select("member_no, paid, stripe_customer")
      .in("member_no", [p.referee, p.referrer])
    const both = (rows || []).filter((r) => r.paid && r.stripe_customer)
    if (both.length < 2) continue
    // claim the pair first so a double activation can't pay out twice
    const { data: claimed } = await db
      .from("referrals")
      .update({ rewarded_at: new Date().toISOString() })
      .eq("referee", p.referee)
      .is("rewarded_at", null)
      .select("referee")
    if (!claimed?.length) continue
    for (const r of both) {
      await stripe(`customers/${r.stripe_customer}/balance_transactions`, {
        amount: String(-cents),
        currency: "usd",
        description: `irlpass referral: a free month (${p.referrer} invited ${p.referee})`,
      })
    }
    done++
  }
  return done
}
