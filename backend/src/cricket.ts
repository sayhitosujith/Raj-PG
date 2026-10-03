/**
 * Live cricket for the resident portal, from CricketData.org (CricAPI v1, currentMatches). The free
 * plan allows 100 calls a day, so the server fetches at most once every 15 minutes and every resident
 * shares that result; a paid key can lower CRICKET_REFRESH_MINUTES. Off (nothing shown) until
 * CRICKET_API_KEY is set.
 */
const endpoint = 'https://api.cricapi.com/v1/currentMatches'
const requestTimeoutMs = 8000
const failureCacheMs = 5 * 60_000
const refreshMs = () => Math.max(1, Number(process.env.CRICKET_REFRESH_MINUTES) || 15) * 60_000

/** True when a CricketData.org key is configured. */
export const isCricketEnabled = () => Boolean(process.env.CRICKET_API_KEY)

/** One side of a match as the portal shows it, e.g. { name: 'India', short: 'IND', score: '245/6 (42.3 ov)' }. */
export type CricketTeam = { name: string; short: string; image: string | null; score: string | null }

/** The match to feature: live, or the next one coming up. */
export type CricketMatch = { id: string; title: string; status: string; matchType: string; venue: string; isLive: boolean; startsAt: string | null; teams: CricketTeam[] }

type ApiMatch = {
  id: string; name: string; status: string; matchType?: string; venue?: string; dateTimeGMT?: string
  teams?: string[]; teamInfo?: Array<{ name: string; shortname?: string; img?: string }>
  score?: Array<{ r: number; w: number; o: number; inning: string }>
  matchStarted?: boolean; matchEnded?: boolean
}

let cache: { expiresAt: number; match: CricketMatch | null } | null = null

const involvesIndia = (match: ApiMatch) => (match.teams ?? []).some((team) => /^india\b/i.test(team.trim()))
const isLive = (match: ApiMatch) => Boolean(match.matchStarted) && !match.matchEnded
const isIpl = (match: ApiMatch) => /indian premier league|\bipl\b/i.test(match.name)

// Each team's latest innings, "245/6 (42.3 ov)"; innings names start with the team name.
function teamScore(match: ApiMatch, team: string) {
  const innings = (match.score ?? []).filter((item) => item.inning.toLowerCase().startsWith(team.toLowerCase()))
  const latest = innings[innings.length - 1]
  return latest ? `${latest.r}/${latest.w} (${latest.o} ov)` : null
}

function toMatch(match: ApiMatch): CricketMatch {
  const teams = (match.teams ?? []).map((name) => {
    const info = match.teamInfo?.find((item) => item.name === name)
    return { name, short: info?.shortname ?? name.slice(0, 3).toUpperCase(), image: info?.img ?? null, score: teamScore(match, name) }
  })
  return { id: match.id, title: match.name, status: match.status, matchType: (match.matchType ?? '').toUpperCase(), venue: match.venue ?? '', isLive: isLive(match), startsAt: match.dateTimeGMT ? `${match.dateTimeGMT}Z` : null, teams }
}

/**
 * India first: a live India match, else a live IPL match, else any live match, else the next India
 * match that has not started. Null when none of those exist.
 */
function pickMatch(matches: ApiMatch[]) {
  const upcomingIndia = matches.filter((match) => !match.matchStarted && involvesIndia(match)).sort((a, b) => (a.dateTimeGMT ?? '').localeCompare(b.dateTimeGMT ?? ''))
  return matches.find((match) => isLive(match) && involvesIndia(match))
    ?? matches.find((match) => isLive(match) && isIpl(match))
    ?? matches.find(isLive)
    ?? upcomingIndia[0]
    ?? null
}

/** The featured match, cached so the daily call limit holds however many residents are looking. */
export async function featuredCricketMatch() {
  if (!isCricketEnabled()) return null
  if (cache && cache.expiresAt > Date.now()) return cache.match
  let match: CricketMatch | null = null
  let ok = false
  try {
    const url = new URL(endpoint)
    url.searchParams.set('apikey', process.env.CRICKET_API_KEY ?? '')
    url.searchParams.set('offset', '0')
    const response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) })
    const body = await response.json() as { status?: string; reason?: string; data?: ApiMatch[] }
    if (!response.ok || body.status !== 'success') throw new Error(body.reason ?? `HTTP ${response.status}`)
    const picked = pickMatch(body.data ?? [])
    match = picked ? toMatch(picked) : null
    ok = true
  } catch (error) {
    console.warn('[cricket] Score lookup failed:', error instanceof Error ? error.message : error)
  }
  cache = { expiresAt: Date.now() + (ok ? refreshMs() : failureCacheMs), match }
  return match
}
