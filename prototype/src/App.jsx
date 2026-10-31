import { useState, lazy, Suspense } from "react"
const Welcome = lazy(() => import("./screens/Welcome"))
const Join = lazy(() => import("./screens/Join"))
const Ops = lazy(() => import("./screens/Ops"))
const InviteAccept = lazy(() => import("./screens/InviteAccept"))
import { cityChip } from "./lib/cities"
const CityPage = lazy(() => import("./screens/CityPage"))
const Apply = lazy(() => import("./screens/Apply"))
const Review = lazy(() => import("./screens/Review"))
const Received = lazy(() => import("./screens/Received"))
const Offer = lazy(() => import("./screens/Offer"))
const Pass = lazy(() => import("./screens/Pass"))
const Info = lazy(() => import("./screens/Info"))
const Club = lazy(() => import("./screens/Club"))
const Admin = lazy(() => import("./screens/Admin"))
const Auth = lazy(() => import("./screens/Auth"))
const Invite = lazy(() => import("./screens/Invite"))
const SharedDay = lazy(() => import("./components/DayPlan").then((m) => ({ default: m.SharedDay })))
const Redeem = lazy(() => import("./screens/Redeem"))
const Pro = lazy(() => import("./screens/Pro"))

// filming helper: /?screen=pass&name=maya&ig=@maya.travels jumps straight to a screen
const params = new URLSearchParams(window.location.search)
// an invite link (?ref=021) is remembered until they sign up, even if they browse first
try { if (/^\d{3}$/.test(params.get("ref") || "")) localStorage.setItem("irl:ref", params.get("ref")) } catch { /* private mode */ }
const isAdminPath = window.location.pathname === "/admin"
// a shared "my day" link (?day=abc123) opens the plan itself, members or not
const dayParam = (() => {
  const id = window.location.pathname.match(/^\/d\/([a-z0-9]{6,20})\/?$/)?.[1] || params.get("day") || ""
  return /^[a-z0-9]{6,20}$/.test(id) ? id : ""
})()
// irlpass for venues: its own landing + onboarding at /pro
const isProPath = /^\/pro\/?$/.test(window.location.pathname)
const initialScreen = isAdminPath
  ? "admin"
  : isProPath
  ? "pro"
  : ["pass", "info", "app", "auth", "invite", "redeem", "join", "offer", "ops"].includes(params.get("screen"))
    ? params.get("screen")
    : "welcome"
// demo mode (filming): review flows into the instant "you're in" pass reveal.
// real applicants land on the received screen — acceptance comes by dm/email after vetting.
const demoMode = params.get("demo") === "1" || params.get("screen") === "pass"
const initialApplicant = {
  name: params.get("name") || "maya",
  ig: params.get("ig") || "@maya.travels",
  memberNo: params.get("n") || null,
}

// an invite link carries the city, the dates and who sent it
const inviteFromUrl =
  params.get("by") && params.get("starts") && params.get("ends")
    ? { city: params.get("city") || "medellin", starts: params.get("starts"), ends: params.get("ends") }
    : null
const savedToken = (() => {
  try { return localStorage.getItem("irlpass_member_token") } catch { return null }
})()

// a member coming back to irlpass.xyz lands on their dates, never on onboarding.
// (?home=1 still shows the homepage, for us.)
// a shared plan link (?go=spot-12) opens that plan: right away for members,
// and after signup for everyone else
const goParam = /^((spot|dm)-\d+|now-[a-z]+)$/.test(params.get("go") || "") ? params.get("go") : ""
if (goParam && !savedToken) { try { localStorage.setItem("irl:go", goParam) } catch { /* private mode */ } }
if (savedToken && !dayParam && initialScreen === "welcome" && !inviteFromUrl && !params.get("home") && !params.get("by")) {
  window.location.replace(`/?screen=app&t=${savedToken}${goParam ? `&go=${goParam}` : ""}`)
}

export default function App() {
  const [screen, setScreen] = useState(initialScreen)
  const [applicant, setApplicant] = useState(initialApplicant)
  const [handle, setHandle] = useState(params.get("ig")?.replace(/^@+/, "") || "")

  return (
    // one layout everywhere: the app fills a phone, and on bigger screens it
    // stays a single centered column on the same ground (no second panel).
    <div className="relative min-h-[100dvh] overflow-hidden bg-cream">
      {/* the wash lives on the page, not on a column, so it reaches every edge */}
      <div aria-hidden className="wash pointer-events-none fixed inset-0 z-0" />
      <div className={`relative z-10 mx-auto w-full ${screen === "welcome" || screen === "pro" ? "max-w-[460px] lg:max-w-[1040px]" : "max-w-[460px]"}`}>
        <div className="grain h-full w-full">
          {/* everything but the homepage loads on demand: members never download signup */}
          <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-ink" /></div>}>
          {dayParam ? <SharedDay id={dayParam} /> : <div key={screen}>
              {/* already a member and handed an invite: one button, no signup */}
              {inviteFromUrl && savedToken && (screen === "welcome" || screen === "join") && (
                <InviteAccept token={savedToken} invite={inviteFromUrl} invitedBy={params.get("by")} />
              )}
              {!(inviteFromUrl && savedToken) && (screen === "welcome" || (screen === "join" && !handle)) && (
                <Welcome
                  invitedBy={params.get("by")}
                  invite={
                    params.get("by") && params.get("starts") && params.get("ends")
                      ? {
                          cityName: cityChip(params.get("city") || "medellin").name,
                          starts: params.get("starts"),
                          ends: params.get("ends"),
                        }
                      : null
                  }
                  onStart={(ig) => { setHandle(ig); setScreen("join") }}
                />
              )}
              {!(inviteFromUrl && savedToken) && screen === "join" && handle && (
                <Join
                  ig={handle}
                  onBack={() => setScreen("welcome")}
                  onDone={(token) => { window.location.href = `/?screen=app&t=${token}` }}
                />
              )}
              {screen === "city" && <CityPage onApply={() => setScreen("apply")} />}
              {screen === "apply" && (
                <Apply
                  onBack={() => setScreen("city")}
                  onSubmit={(data) => {
                    setApplicant(data)
                    setScreen("review")
                  }}
                />
              )}
              {screen === "review" && (
                <Review applicant={applicant} onAccepted={() => setScreen(demoMode ? "pass" : "received")} />
              )}
              {screen === "received" && <Received applicant={applicant} />}
              {screen === "offer" && <Offer token={params.get("t")} />}
              {screen === "pass" && <Pass applicant={applicant} />}
              {screen === "info" && <Info onBack={() => setScreen("city")} />}
              {screen === "app" && (
                <Suspense fallback={<div className="flex min-h-[var(--app-h)] items-center justify-center font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">opening the club…</div>}>
                  <Club token={params.get("t")} />
                </Suspense>
              )}
              {screen === "admin" && <Admin />}
              {screen === "pro" && <Pro />}
              {screen === "ops" && <Ops token={params.get("t")} />}
              {screen === "auth" && <Auth />}
              {screen === "invite" && <Invite activityId={params.get("a")} onApply={() => setScreen("apply")} />}
              {screen === "redeem" && (
                <Redeem
                  code={params.get("code")}
                  onJoined={(t) => { window.location.href = `/?screen=pass&t=${t}` }}
                />
              )}
          </div>}
          </Suspense>
        </div>
      </div>
    </div>
  )
}
