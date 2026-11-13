// a light tap you can feel. android has navigator.vibrate; iphone safari (18+)
// gives a system tick when a hidden switch toggles, so we keep one around.
let sw = null
function iosTick() {
  if (!sw) {
    const label = document.createElement("label")
    label.style.cssText = "position:fixed;left:-99px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none"
    const input = document.createElement("input")
    input.type = "checkbox"
    input.setAttribute("switch", "")
    label.appendChild(input)
    document.body.appendChild(label)
    sw = label
  }
  sw.click()
}

export function haptic(kind = "tick") {
  try {
    if (navigator.vibrate) navigator.vibrate(kind === "pop" ? [12, 40, 18] : kind === "soft" ? 6 : 10)
    else iosTick()
  } catch { /* no haptics here */ }
}
