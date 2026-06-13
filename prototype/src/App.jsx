import { useState, lazy, Suspense } from "react"
import { AnimatePresence, motion } from "framer-motion"
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

// filming helper: /?screen=pass&name=maya&ig=@maya.travels jumps straight to a screen
const params = new URLSearchParams(window.location.search)
const isAdminPath = window.location.pathname === "/admin"
const initialScreen = isAdminPath
  ? "admin"
  : ["city", "apply", "review", "received", "offer", "pass", "info", "app", "auth", "invite"].includes(params.get("screen"))
    ? params.get("screen")
    : "city"
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

  return (
    // dark studio backdrop on desktop, invisible on phones
    <div className="md:flex md:min-h-[100dvh] md:items-center md:justify-center md:bg-[#12110d] md:py-6">
      {/* phone bezel (desktop only) */}
      <div className="relative w-full max-w-[430px] md:h-[var(--app-h)] md:w-[396px] md:overflow-hidden md:rounded-[3.2rem] md:shadow-[0_50px_120px_-30px_rgba(0,0,0,0.9)] md:ring-[10px] md:ring-[#26241e]">
        {/* dynamic island */}
        <div className="absolute left-1/2 top-2.5 z-50 hidden h-[26px] w-[110px] -translate-x-1/2 rounded-full bg-black md:block" />
        <div className="grain mx-auto h-full w-full bg-cream md:overflow-y-auto md:overscroll-contain">
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
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
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
