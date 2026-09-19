import { useState, lazy, Suspense } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Welcome from "./screens/Welcome"
import Join from "./screens/Join"
import CityPage from "./screens/CityPage"
import Apply from "./screens/Apply"
import Review from "./screens/Review"
import Received from "./screens/Received"
import Offer from "./screens/Offer"
import Pass from "./screens/Pass"
import Info from "./screens/Info"
const Club = lazy(() => import("./screens/Club"))
import Admin from "./screens/Admin"
import Auth from "./screens/Auth"
import Invite from "./screens/Invite"
import Redeem from "./screens/Redeem"

// filming helper: /?screen=pass&name=maya&ig=@maya.travels jumps straight to a screen
const params = new URLSearchParams(window.location.search)
const isAdminPath = window.location.pathname === "/admin"
const initialScreen = isAdminPath
  ? "admin"
  : ["city", "apply", "review", "received", "offer", "pass", "info", "app", "auth", "invite", "redeem", "join"].includes(params.get("screen"))
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
      <div className={`relative z-10 mx-auto w-full ${screen === "welcome" ? "max-w-[460px] lg:max-w-[1040px]" : "max-w-[460px]"}`}>
        <div className="grain h-full w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              {screen === "welcome" && (
                <Welcome onStart={(ig) => { setHandle(ig); setScreen("join") }} />
              )}
              {screen === "join" && (
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
              {screen === "auth" && <Auth />}
              {screen === "invite" && <Invite activityId={params.get("a")} onApply={() => setScreen("apply")} />}
              {screen === "redeem" && (
                <Redeem
                  code={params.get("code")}
                  onJoined={(t) => { window.location.href = `/?screen=pass&t=${t}` }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
