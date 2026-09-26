import { useEffect, useState } from "react"
import { searchCities } from "./cities"

// what someone typed -> real cities to pick from. our own list answers
// instantly, openstreetmap fills in everywhere else. only a tapped result
// becomes a city: free text never does ("coim" was a whole room).
export function useCitySearch(typed) {
  const q = String(typed || "").trim()
  const local = q ? searchCities(q) : []
  const [remote, setRemote] = useState({ q: "", cities: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (q.length < 3) return
    let alive = true
    setLoading(true)
    const id = setTimeout(() => {
      fetch(`/api/city-search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => { if (alive) setRemote({ q, cities: d.cities || [] }) })
        .catch(() => {})
        .finally(() => { if (alive) setLoading(false) })
    }, 350)
    return () => { alive = false; clearTimeout(id) }
  }, [q])

  const extra = remote.q === q ? remote.cities.filter((c) => !local.some((l) => l.slug === c.slug)) : []
  return {
    results: [...local, ...extra].slice(0, 8),
    loading: loading && q.length >= 3,
    none: q.length >= 3 && !loading && remote.q === q && local.length === 0 && extra.length === 0,
  }
}
