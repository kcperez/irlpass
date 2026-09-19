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
    // one responsive app: full screen on phones, a centered column beside a
    // brand panel on desktop. no fake phone bezel.
    <div className="min-h-[100dvh] bg-cream md:flex md:items-stretch md:justify-center md:gap-10 md:bg-cream-deep/40 md:p-8">
      {/* desktop-only brand panel */}
      <aside className="relative hidden w-[420px] shrink-0 flex-col justify-center overflow-hidden rounded-[2rem] bg-cream px-10 py-12 lg:flex">
        <div aria-hidden className="pointer-events-none absolute -left-16 top-10 h-64 w-64 rounded-full bg-lime/60 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-16 bottom-16 h-64 w-64 rounded-full bg-peach/60 blur-3xl" />
        <span className="display relative text-[26px] font-bold lowercase tracking-tight">
          irl<span className="ml-[3px] inline-block -rotate-3 rounded-[0.45em] bg-lime px-[0.3em] pb-[0.06em] leading-none">pass</span>
        </span>
        <h2 className="display relative mt-4 text-[44px] font-bold leading-[0.95] tracking-tight">
          never travel<br />alone
        </h2>
        <p className="relative mt-3 max-w-[26ch] text-[16px] text-ink-soft">
          post the dates you'll be in a city, see who else is there, say hi.
        </p>
        <img src="/art/hero.png" alt="" className="relative mt-6 w-full select-none" draggable="false" />
      </aside>

      {/* the app itself */}
      <div className="relative mx-auto w-full max-w-[430px] overflow-hidden bg-cream md:h-[min(900px,calc(100dvh-4rem))] md:rounded-[2rem] md:shadow-[0_40px_90px_-50px_rgba(58,50,44,0.55)]">
        <div className="grain h-full w-full overflow-y-auto overscroll-contain">
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
