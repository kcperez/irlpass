// google sign-in runs on our own domain via /api/google-login
export function signInWithGoogle() {
  window.location.href = "/api/google-login"
}
