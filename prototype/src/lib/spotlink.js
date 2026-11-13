import { createContext } from "react"

// tap a spot anywhere (a @tag in chat, a right-now pick) and land on its board.
// Club provides the function.
export const SpotLink = createContext(() => {})

// an event shared in a chat: the card needs the token to load it and a way to
// open the full event. Club provides both.
export const EventLink = createContext({ token: null, open: () => {} })
