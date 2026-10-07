import { useEffect, useState } from "react"
import { t } from "./i18n"

// no endless scrolling: long lists show a first batch and a clear button for
// the next one. resets when the list itself changes (new filter, new city).
export function useMore(list, step = 12, resetKey) {
  const [n, setN] = useState(step)
  useEffect(() => { setN(step) }, [resetKey, step])
  const all = list || []
  const shown = all.slice(0, n)
  const left = all.length - shown.length
  const More = ({ className = "" }) =>
    left > 0 ? (
      <button
        onClick={() => setN((x) => x + step)}
        className={`col-span-full mt-3 w-full rounded-full border border-line bg-white py-3 text-[13.5px] font-bold active:scale-[0.99] ${className}`}
      >
        {t("show")} {Math.min(step, left)} {t("more")} · {left} {t("left")}
      </button>
    ) : null
  return [shown, More, left]
}

// same thing as a component, for lists rendered after an early return.
// wrap: the element the shown items go in (a grid, a list...)
export function MoreList({ items, step = 12, resetKey, wrap, render }) {
  const [shown, More] = useMore(items, step, resetKey)
  return (
    <>
      {wrap ? wrap(shown.map(render)) : shown.map(render)}
      <More />
    </>
  )
}
