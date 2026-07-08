import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

const RAPID_HEADERS = {
  'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
}

// ── Utilities ────────────────────────────────────────────────────────────────

function toISO(s: string): string {
  return s.replace(' ', 'T')
}

function parseTimestamp(s: string): number {
  if (!s) return 0
  return new Date(toISO(s)).getTime() || 0
}

function hhmm(s: string | null | undefined): string | null {
  if (!s) return null
  const m = toISO(s).match(/T(\d{2}:\d{2})/)
  return m ? m[1] : null
}

function pickBestFlight(flights: any[], requestedDate: string): any | null {
  if (!flights.length) return null
  if (flights.length === 1) return flights[0]

  const day = requestedDate.slice(0, 10)
  const onDate = flights.filter(f => (f.departure?.scheduledTime?.utc ?? '').startsWith(day))
  const pool = onDate.length > 0 ? onDate : flights
  if (pool.length === 1) return pool[0]

  const now = Date.now()
  return pool.reduce((best: any, f: any) => {
    const ft = parseTimestamp(f.departure?.scheduledTime?.utc ?? '')
    const bt = parseTimestamp(best.departure?.scheduledTime?.utc ?? '')
    if (!ft) return best
    if (!bt) return f
    if (ft > now && bt <= now) return f
    if (bt > now && ft <= now) return best
    if (ft > now && bt > now) return ft < bt ? f : best
    return ft > bt ? f : best
  }, pool[0])
}

async function fetchFlight(flightNumber: string, date: string): Promise<any | null> {
  try {
    const res = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/number/${flightNumber}/${date}T00:00/${date}T23:59`,
      { headers: RAPID_HEADERS, signal: AbortSignal.timeout(8000) }
    )
    if (res.ok) {
      const data = await res.json()
      const arr = Array.isArray(data) ? data : [data].filter(Boolean)
      if (arr.length > 0) return pickBestFlight(arr, date)
    }
  } catch {}

  try {
    const res = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/number/${flightNumber}`,
      { headers: RAPID_HEADERS, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const arr = Array.isArray(data) ? data : [data].filter(Boolean)
    return arr.length > 0 ? pickBestFlight(arr, date) : null
  } catch {
    return null
  }
}

async function fetchAircraftSchedule(reg: string, date: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/aircraft/${reg}/${date}T00:00/${date}T23:59`,
      { headers: RAPID_HEADERS, signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : (data.flights ?? data.Flights ?? [])
  } catch {
    return []
  }
}

async function fetchFAAForAirport(iata: string): Promise<{ hasAlert: boolean; status: string }> {
  const none = { hasAlert: false, status: 'No active delays' }
  if (!iata) return none
  try {
    const res = await fetch('https://nasstatus.faa.gov/api/airport-delay-info', {
      headers: { 'User-Agent': 'SkyGuard/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 300 },
    } as RequestInit)
    if (!res.ok) return none
    const text = await res.text()
    if (!text || text.trim().startsWith('<') || text.includes('Website Unavailable')) {
      console.error('[SkyGuard] FAA endpoint returned HTML instead of JSON, skipping')
      return { hasAlert: false, status: 'FAA status temporarily unavailable' }
    }
    const data = JSON.parse(text)
    if (!Array.isArray(data)) return none
    const delays = data as any[]
    const iataUpper = iata.toUpperCase()
    const icaoUpper = 'K' + iataUpper
    const match = delays.find((d: any) => {
      const code = (d.ARPT ?? d.airport ?? d.facility ?? '').toUpperCase().trim()
      return code === iataUpper || code === icaoUpper
    })
    if (!match) return none
    const type   = match.Type   ?? match.type   ?? 'Delay'
    const reason = match.Reason ?? match.reason ?? ''
    const avg    = match.Avg    ?? match.avgDelay ?? ''
    return {
      hasAlert: true,
      status: `${type}${reason ? ' - ' + reason : ''}${avg ? ' (avg ' + avg + ')' : ''}`,
    }
  } catch {
    return none
  }
}

async function fetchWeather(lat: number, lon: number): Promise<any[] | null> {
  try {
    const pointRes = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { 'User-Agent': 'SkyGuard/1.0' }, signal: AbortSignal.timeout(5000) }
    )
    if (!pointRes.ok) return null
    const point = await pointRes.json()
    const forecastUrl = point.properties?.forecastHourly
    if (!forecastUrl) return null
    const forecastRes = await fetch(forecastUrl, {
      headers: { 'User-Agent': 'SkyGuard/1.0' },
      signal: AbortSignal.timeout(5000),
    })
    if (!forecastRes.ok) return null
    const forecast = await forecastRes.json()
    return (forecast.properties?.periods ?? []).slice(0, 4).map((p: any) => ({
      time:          p.startTime?.slice(11, 16) ?? '',
      shortForecast: p.shortForecast ?? '',
      temperature:   p.temperature ?? 0,
      windSpeed:     p.windSpeed ?? '',
      windDirection: p.windDirection ?? '',
      precipChance:  p.probabilityOfPrecipitation?.value ?? 0,
    }))
  } catch {
    return null
  }
}

function calcConfidence(
  flight: any,
  originFAA: { hasAlert: boolean },
  destFAA:   { hasAlert: boolean },
  avgUpDelay: number,
  deptDelay = 0
): number {
  if (flight.status === 'Cancelled') return 0
  let score = 100
  score -= Math.min(Math.floor(deptDelay / 15) * 5, 35)
  if (flight.status === 'Diverted') score -= 40
  if (originFAA.hasAlert) score -= 20
  if (destFAA.hasAlert)   score -= 10
  score -= Math.min(Math.floor(avgUpDelay / 15) * 3, 15)
  return Math.max(0, Math.round(score))
}

function validateFlight(raw: string): { ok: boolean; cleaned: string; hint: string } {
  const cleaned = raw.toUpperCase().replace(/[\s-]/g, '')
  const ok = /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(cleaned)
  return {
    ok,
    cleaned,
    hint: ok ? '' : 'Flight numbers look like AA123, DL400, or UA1. Check the format and try again.',
  }
}

function calcDelayMins(
  scheduled: string | null | undefined,
  revised:   string | null | undefined
): number {
  if (!scheduled || !revised) return 0
  const s = new Date(toISO(scheduled)).getTime()
  const r = new Date(toISO(revised)).getTime()
  if (isNaN(s) || isNaN(r)) return 0
  return Math.round((r - s) / 60000)
}

function estimateWalkMinutes(iata: string): number {
  const t: Record<string, number> = {
    ATL:18, DEN:15, DFW:15, ORD:15, LAX:12, JFK:12,
    SFO:12, SEA:12, MIA:12, CLT:12, MCO:10, PHX:10,
    LAS:10, IAH:12, EWR:12, LGA:8,  BOS:8,  MSP:10,
    DTW:12, PHL:10, BWI:8,  DCA:8,  SLC:10, PDX:8,
    MDW:6,  HOU:6,  SAN:6,  TPA:6,  AUS:6,  RDU:6,
  }
  return t[iata] ?? 8
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const params     = new URL(request.url).searchParams
  const rawFlight  = params.get('flight') ?? ''
  const d          = new Date()
  const localToday = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const date       = params.get('date') ?? localToday

  const { ok, cleaned, hint } = validateFlight(rawFlight)
  if (!ok) return NextResponse.json({ error: hint }, { status: 400 })

  try {
    const flight = await fetchFlight(cleaned, date)

    if (!flight) {
      return NextResponse.json({
        error: `No data found for ${cleaned} on ${date}. This can happen with regional, charter, or some international carriers. Try a major US carrier like AA, DL, or UA to confirm the app is working, then check the airline directly for your specific flight.`,
      }, { status: 404 })
    }

    const deptDelay = calcDelayMins(
      flight?.departure?.scheduledTime?.utc,
      flight?.departure?.revisedTime?.utc
    )

    const arrDelay = calcDelayMins(
      flight?.arrival?.scheduledTime?.utc,
      flight?.arrival?.revisedTime?.utc
    )

    const tailNumber = flight.aircraft?.reg ?? flight.aircraft?.registration ?? flight.aircraft?.tail ?? flight.aircraft?.tailNumber ?? flight.aircraft?.icao24 ?? null
    const originIATA = flight.departure?.airport?.iata ?? ''
    const destIATA   = flight.arrival?.airport?.iata   ?? ''
    const originCity = flight.departure?.airport?.municipalityName ?? originIATA
    const destCity   = flight.arrival?.airport?.municipalityName   ?? destIATA
    const originLat  = flight.departure?.airport?.location?.lat
    const originLon  = flight.departure?.airport?.location?.lon
    const destLat    = flight.arrival?.airport?.location?.lat
    const destLon    = flight.arrival?.airport?.location?.lon
    const thisDep    = toISO(flight.departure?.scheduledTime?.utc ?? flight.departure?.scheduledTime?.local ?? '')

    const [schedule, originFAA, destFAA, originWeather, destWeather] = await Promise.all([
      tailNumber ? fetchAircraftSchedule(tailNumber, date) : Promise.resolve([]),
      fetchFAAForAirport(originIATA),
      fetchFAAForAirport(destIATA),
      originLat && originLon ? fetchWeather(originLat, originLon) : Promise.resolve(null),
      destLat   && destLon   ? fetchWeather(destLat, destLon)     : Promise.resolve(null),
    ])

    const upstream = schedule
      .filter((f: any) => {
        const dep = toISO(f.departure?.scheduledTime?.utc ?? f.departure?.scheduledTime?.local ?? '')
        return dep && thisDep && dep < thisDep
      })
      .slice(-3)
      .reverse()

    const downstream = schedule
      .filter((f: any) => {
        const dep = toISO(f.departure?.scheduledTime?.utc ?? f.departure?.scheduledTime?.local ?? '')
        return dep && thisDep && dep > thisDep
      })
      .slice(0, 3)

    const avgUpstreamDelay = upstream.length > 0
      ? Math.round(upstream.reduce((a: number, f: any) => a + (f.departure?.delay ?? 0), 0) / upstream.length)
      : 0

    // Timing
    const timing = {
      departure: {
        scheduled:    hhmm(flight.departure?.scheduledTime?.local),
        updated:      hhmm(
          flight.departure?.revisedTime?.local ??
          flight.departure?.actualTime?.local  ??
          flight.departure?.estimatedTime?.local
        ),
        delayMinutes: deptDelay,
        scheduledISO: toISO(flight.departure?.scheduledTime?.local ?? ''),
      },
      arrival: {
        scheduled:    hhmm(flight.arrival?.scheduledTime?.local),
        updated:      hhmm(
          flight.arrival?.revisedTime?.local   ??
          flight.arrival?.predictedTime?.local ??
          flight.arrival?.actualTime?.local    ??
          flight.arrival?.estimatedTime?.local
        ),
        delayMinutes: arrDelay,
      },
    }

    // Claude prompt
    const wxText = (w: any[] | null, label: string) =>
      w ? w.map(p => `${p.time}: ${p.shortForecast}, ${p.temperature}F, ${p.windSpeed} ${p.windDirection}, ${p.precipChance}% precip`).join(' | ')
        : `${label}: weather unavailable`

    const upstreamText = upstream.length > 0
      ? upstream.map((f: any) => {
          const delay = calcDelayMins(
            f.departure?.scheduledTime?.utc,
            f.departure?.revisedTime?.utc
          )
          return `${f.number ?? '?'}: ${f.departure?.airport?.iata ?? '?'} to ${f.arrival?.airport?.iata ?? '?'} | ${f.status ?? 'unknown'} | +${delay}min`
        }).join('\n')
      : 'No earlier flights found for this aircraft today.'

    const prompt = `You are SkyGuard, an aviation risk analyst. Assess this flight concisely.

FLIGHT: ${cleaned} on ${date}
Airline: ${flight.airline?.name ?? 'Unknown'}
Aircraft: ${tailNumber ?? 'Unknown'} (${flight.aircraft?.model ?? 'Unknown model'})
Status: ${flight.status ?? 'Expected'} | Current delay: ${deptDelay} minutes
Route: ${originCity} (${originIATA}) → ${destCity} (${destIATA})
Scheduled departure: ${flight.departure?.scheduledTime?.local || 'Unknown'}

AIRCRAFT EARLIER TODAY:
${upstreamText}

FAA ${originIATA}: ${originFAA.status}
FAA ${destIATA}: ${destFAA.status}

WEATHER ${originIATA}: ${wxText(originWeather, originIATA)}
WEATHER ${destIATA}: ${wxText(destWeather, destIATA)}

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "riskLevel": "low" | "medium" | "high",
  "confidenceScore": number 0-100 consistent with riskLevel (low=71-100, medium=41-70, high=0-40),
  "summary": "1-2 sentences",
  "actions": ["action 1", "action 2", "action 3"],
  "upstreamImpact": "string or null",
  "weatherImpact": "string or null",
  "airportAlerts": "string or null"
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
    let recommendation: any
    try {
      recommendation = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      const score = calcConfidence(flight, originFAA, destFAA, avgUpstreamDelay, deptDelay)
      recommendation = {
        riskLevel:      score >= 71 ? 'low' : score >= 41 ? 'medium' : 'high',
        confidenceScore: score,
        summary:        'Flight data retrieved but AI analysis incomplete. Check the airline app directly.',
        actions:        ['Check the airline app for latest updates', 'Arrive with extra time', 'Have airline contact number ready'],
        upstreamImpact: null,
        weatherImpact:  null,
        airportAlerts:  null,
      }
    }

    recommendation.walkingMinutes = estimateWalkMinutes(originIATA)

    const derivedStatus = (() => {
      const raw = flight.status ?? 'Unknown'
      if (['Cancelled','Diverted','Arrived','Departed','EnRoute','Landing','Boarding','GateClosed','CheckIn'].includes(raw)) {
        return raw
      }
      if (deptDelay >= 15) return 'Delayed'
      if (deptDelay < -5)  return 'Early'
      return raw
    })()

    return NextResponse.json({
      flight,
      searchedDate:      date,
      dataFetchedAt:     new Date().toISOString(),
      dataQuality: {
        departure: flight.departure?.quality ?? [],
        arrival:   flight.arrival?.quality   ?? [],
      },
      derivedStatus,
      departureDelayMinutes: deptDelay,
      recommendation,
      confidenceScore:   recommendation.confidenceScore ?? calcConfidence(flight, originFAA, destFAA, avgUpstreamDelay, deptDelay),
      departureTerminal: flight.departure?.terminal ?? null,
      departureGate:     flight.departure?.gate ?? flight.departure?.boardingGate ?? flight.departure?.gateNumber ?? null,
      arrivalTerminal:   flight.arrival?.terminal   ?? null,
      arrivalBaggage:    flight.arrival?.baggageBelt ?? null,
      timing,
      weather: {
        origin:      { airport: originIATA, city: originCity, current: originWeather?.[0] ?? null },
        destination: { airport: destIATA,   city: destCity,   current: destWeather?.[0]   ?? null },
      },
      faa: {
        origin:      { airport: originIATA, ...originFAA },
        destination: { airport: destIATA,   ...destFAA   },
      },
      aircraft: {
        registration:    tailNumber,
        model:           flight.aircraft?.model ?? null,
        upstream,
        downstream,
        totalToday:      schedule.length,
        avgUpstreamDelay,
      },
    })
  } catch (err) {
    console.error('[SkyGuard] Unhandled error in /api/flight:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
