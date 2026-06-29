import { NextRequest, NextResponse } from 'next/server'

type TsaResponse = {
  waitMinutes: number | null
  preCheckMinutes: number | null
  checkpoint: string | null
  preCheckAvailable: boolean
  isEstimate: boolean
}

const NULL_RESPONSE: TsaResponse = {
  waitMinutes: null,
  preCheckMinutes: null,
  checkpoint: null,
  preCheckAvailable: false,
  isEstimate: false,
}

// Large hubs with historically higher wait times
const LARGE_HUBS = new Set([
  'ATL','LAX','ORD','DFW','DEN','JFK','SFO','SEA','LAS','MCO',
  'CLT','PHX','MIA','IAH','EWR','MSP','BOS','DTW','PHL','LGA',
  'IAD','SLC','BWI','MDW','DAL','HOU','SAN','TPA','PDX','STL',
])

// Base wait times by hour (0-23), standard lane, minutes
const BASE_WAIT_BY_HOUR: Record<number, number> = {
  0: 5, 1: 5, 2: 5, 3: 5, 4: 8,
  5: 12, 6: 18, 7: 22, 8: 28, 9: 30,
  10: 25, 11: 22, 12: 20, 13: 18, 14: 20,
  15: 22, 16: 25, 17: 28, 18: 22, 19: 18,
  20: 15, 21: 12, 22: 10, 23: 8,
}

function estimateWait(airport: string, hour: number): TsaResponse {
  const base   = BASE_WAIT_BY_HOUR[hour] ?? 15
  const factor = LARGE_HUBS.has(airport.toUpperCase()) ? 1.4 : 1.0
  const std    = Math.round(base * factor)
  const pre    = Math.max(2, Math.round(std * 0.3))

  return {
    waitMinutes:       std,
    preCheckMinutes:   pre,
    checkpoint:        null,
    preCheckAvailable: true,
    isEstimate:        true,
  }
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// tsawaittimes.com — requires a paid API key; returns null until one is configured
async function tryFormatA(airport: string, terminal: string, hour: number): Promise<TsaResponse | null> {
  const url = `https://www.tsawaittimes.com/api/airports/${airport.toUpperCase()}/${hour}`

  try {
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'SkyGuard/1.0 (flight disruption assistant)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    const text = await res.text()

    if (!res.ok || !text.trim()) return null
    let data: unknown
    try { data = JSON.parse(text) } catch { return null }
    if (!Array.isArray(data) || data.length === 0) return null

    const checkpoints = data as Array<Record<string, unknown>>
    const open = checkpoints.filter(c => c.Open === 'true' || c.Open === true)
    if (open.length === 0) return null

    const normTerminal = normalize(terminal)
    let match = normTerminal
      ? open.find(c => normalize(String(c.Checkpoint ?? '')).includes(normTerminal))
      : null
    if (!match) match = open.reduce((best, c) => {
      const b = parseInt(String(best.WaitTime ?? ''), 10)
      const n = parseInt(String(c.WaitTime ?? ''), 10)
      return (!isNaN(n) && (isNaN(b) || n < b)) ? c : best
    }, open[0])

    const std    = parseInt(String(match.WaitTime ?? ''), 10)
    const preOpen = match.PreCheckOpen === 'true' || match.PreCheckOpen === true
    const pre    = parseInt(String(match.PreCheckWaitTime ?? ''), 10)

    return {
      waitMinutes:       isNaN(std) ? null : std,
      preCheckMinutes:   (preOpen && !isNaN(pre)) ? pre : null,
      checkpoint:        typeof match.Checkpoint === 'string' ? match.Checkpoint : null,
      preCheckAvailable: preOpen && !isNaN(pre),
      isEstimate:        false,
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const params   = new URL(request.url).searchParams
  const airport  = params.get('airport')
  const terminal = params.get('terminal') ?? ''
  if (!airport) return NextResponse.json(NULL_RESPONSE)

  const hour = new Date().getHours()

  const live = await tryFormatA(airport, terminal, hour)
  if (live) return NextResponse.json(live)

  return NextResponse.json(estimateWait(airport, hour))
}
