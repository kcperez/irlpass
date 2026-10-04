// one place for stripe calls. STRIPE_MODE=test routes through the sandbox.
export const stripeKey = () =>
  process.env.STRIPE_MODE === "test" ? process.env.STRIPE_TEST_KEY : process.env.STRIPE_SECRET_KEY

export async function stripe(path, params = null, method = params ? "POST" : "GET") {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { authorization: `Bearer ${stripeKey()}`, "content-type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params).toString() : undefined,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error?.message || `stripe ${r.status}`)
  return d
}
