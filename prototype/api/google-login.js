// kicks off google sign-in on our own domain (consent screen shows irlpass.xyz)
export default async function handler(req, res) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: "https://irlpass.xyz/api/oauth-callback",
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
  })
  res.writeHead(302, { location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
  res.end()
}
