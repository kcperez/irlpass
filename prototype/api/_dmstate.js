import { db } from "./_db.js"

// who i already have a conversation with, and how many of their messages i
// haven't read. "say hi" turns into "open chat" (or an unread count) once
// there's a thread, so nobody says hi twice.
export async function dmState(memberNo) {
  const { data: threads } = await db
    .from("dm_threads")
    .select("id, a_no, b_no")
    .or(`a_no.eq.${memberNo},b_no.eq.${memberNo}`)
  const byThread = new Map((threads || []).map((t) => [t.id, t.a_no === memberNo ? t.b_no : t.a_no]))
  const state = new Map([...byThread.values()].map((no) => [no, { talked: true, unread: 0 }]))
  if (byThread.size) {
    const { data: unread } = await db
      .from("dm_messages")
      .select("thread_id")
      .in("thread_id", [...byThread.keys()])
      .neq("from_no", memberNo)
      .is("read_at", null)
    for (const u of unread || []) {
      const s = state.get(byThread.get(u.thread_id))
      if (s) s.unread++
    }
  }
  return state
}
