import { useEffect, useState } from 'react'

/** One side of a match, as the server sends it. */
type CricketTeam = { name: string; short: string; image: string | null; score: string | null }
/** The featured match: live, or the next India match. */
type CricketMatch = { id: string; title: string; status: string; matchType: string; venue: string; isLive: boolean; startsAt: string | null; teams: CricketTeam[] }

// The server refreshes at most every 15 minutes on the free plan; checking every 5 picks that up soon.
const pollMs = 5 * 60_000

const startLabel = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * Live cricket in the resident's meals row: a live match (India first) with each side's score and the
 * match status, or the next India match. Renders nothing when there is no match or no API key, so
 * the space simply stays empty.
 */
export function CricketScore() {
  const [match, setMatch] = useState<CricketMatch | null>(null)
  useEffect(() => {
    let isCurrent = true
    const load = () => fetch('/api/resident-portal/cricket').then((response) => (response.status === 200 ? response.json() as Promise<CricketMatch> : null)).then((next) => { if (isCurrent) setMatch(next) }, () => undefined)
    void load()
    const timer = window.setInterval(load, pollMs)
    return () => { isCurrent = false; window.clearInterval(timer) }
  }, [])
  if (!match) return null

  return (
    <div className="cricket-score" title={`${match.title}${match.venue ? ` · ${match.venue}` : ''}`}>
      <div className="cricket-score-head">
        <span className="cricket-score-ball" aria-hidden="true">🏏</span>
        {match.isLive ? <span className="cricket-live">LIVE</span> : <span className="cricket-upcoming">Next match</span>}
        {match.matchType && <span className="cricket-format">{match.matchType}</span>}
      </div>
      <ul className="cricket-teams">
        {match.teams.map((team) => (
          <li key={team.name}>
            {team.image ? <img src={team.image} alt="" width={18} height={18} loading="lazy" /> : <span className="cricket-team-dot" aria-hidden="true" />}
            <strong>{team.short}</strong>
            <span>{team.score ?? (match.isLive ? 'Yet to bat' : '')}</span>
          </li>
        ))}
      </ul>
      <p className="cricket-status">{match.isLive || !match.startsAt ? match.status : `Starts ${startLabel(match.startsAt)} IST`}</p>
    </div>
  )
}
