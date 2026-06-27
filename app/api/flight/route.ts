import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()
const RAPID_HEADERS = {
  'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
  'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
}

function pickBestFlight(flights: any[]): any {
  if (flights.length === 1) return flights[0]
  const now = Date.now()
  return flights.reduce((best: any, f: any) => {
    const fTime = new Date(f.departure?.scheduledTime?.utc ?? '').getTime() || 0
    const bTime = new Date(best.departure?.scheduledTime?.utc ?? '').getTime() || 0
    if (!fTime) return best
    if (!bTime) return f
    if (fTime > now && bTime <= now) return f
    if (bTime > now && fTime <= now) return best
    if (fTime > now && bTime > now) return fTime < bTime ? f : best
    return fTime > bTime ? f : best
  }, flights[0])
}

async function getFlightData(flightNumber: string, date: string) {
  // Try date-specific endpoint first for accuracy
  try {
    const dateRes = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/number/${flightNumber}/${date}T00:00/${date}T23:59`,
      { headers: RAPID_HEADERS }
    )
    if (dateRes.ok) {
      const data = await dateRes.json()
      const arr = Array.isArray(data) ? data : [data].filter(Boolean)
      if (arr.length > 0) return pickBestFlight(arr)
    }
  } catch {}

  // Fall back to basic endpoint
  try {
    const res = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/number/${flightNumber}`,
      { headers: RAPID_HEADERS }
    )
    if (!res.ok) return null
    const data = await res.json()
    const arr = Array.isArray(data) ? data : [data].filter(Boolean)
    return arr.length > 0 ? pickBestFlight(arr) : null
  } catch {
    return null
  }
}

async function getAircraftSchedule(reg: string, date: string) {
  try {
    const res = await fetch(
      `https://aerodatabox.p.rapidapi.com/flights/aircraft/${reg}/${date}T00:00/${date}T23:59`,
      { headers: RAPID_HEADERS }
    )
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? data : (data.flights ?? data.Flights ?? [])
  } catch {
    return null
  }
}

async function getAllFAADelays() {
  try {
    const res = await fetch('https://nasstatus.faa.gov/api/airport-delay-info', {
      headers: { 'User-Agent': 'SkyGuard/1.0', Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

async function getAirportWeather(lat: number, lon: number) {
  try {
    const pointRes = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { 'User-Agent': 'SkyGuard/1.0' } }
    )
    if (!pointRes.ok) return null
    const point = await pointRes.json()
    const forecastUrl = point.properties?.forecastHourly
    if (!forecastUrl) return null
    const forecastRes = await fetch(forecastUrl, { headers: { 'User-Agent': 'SkyGuard/1.0' } })
    if (!forecastRes.ok) return null
    const forecast = await forecastRes.json()
    return (forecast.properties?.periods ?? []).slice(0, 4).map((p: any) => ({
      time: p.startTime?.slice(11, 16) ?? '',
      shortForecast: p.shortForecast ?? '',
      temperature: p.temperature ?? 0,
      windSpeed: p.windSpeed ?? '',
      windDirection: p.windDirection ?? '',
      precipChance: p.probabilityOfPrecipitation?.value ?? 0,
    }))
  } catch {
    return null
  }
}

function faaForAirport(allDelays: any[] | null, iata: string) {
  if (!allDelays || !iata) return { hasAlert: false, status: 'No active delays.' }
  const match = allDelays.find(
    (d: any) => (d.ARPT ?? d.airport ?? '').toUpperCase() === iata.toUpperCase()
  )
  if (!match) return { hasAlert: false, status: 'No active delays.' }
  const type   = match.Type   ?? match.type   ?? 'Delay'
  const reason = match.Reason ?? match.reason ?? ''
  const avg    = match.Avg    ?? match.avgDelay ?? ''
  return {
    hasAlert: true,
    status: `${type}${reason ? ' - ' + reason : ''}${avg ? ' (avg ' + avg + ')' : ''}`,
  }
}

function validateFlightNumber(raw: string): { valid: boolean; cleaned: string; hint: string } {
  const cleaned = raw.toUpperCase().replace(/\s+/g, '').replace(/-/g, '')
  const pattern = /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/
  if (!pattern.test(cleaned)) {
    return {
      valid: false,
      cleaned,
      hint: 'Flight numbers look like AA123, DL400, or UA1. Check the format and try again.',
    }
  }
  return { valid: true, cleaned, hint: '' }
}

export async function GET(request: NextRequest) {
  const url          = new URL(request.url)
  const rawFlight    = url.searchParams.get('flight') ?? ''
  const date         = url.searchParams.get('date') ?? new Date().toISOString().split('T')[0]

  const { valid, cleaned, hint } = validateFlightNumber(rawFlight)
  if (!valid) return NextResponse.json({ error: hint }, { status: 400 })

  try {
    const flight = await getFlightData(cleaned, date)

    if (!flight) {
      return NextResponse.json({
        error: `No data found for ${cleaned} on ${date}. This can happen with regional, charter, or some international carriers. Try a major US carrier like AA, DL, or UA to confirm the app is working, then check the airline directly for your specific flight.`,
      }, { status: 404 })
    }

    const tailNumber = flight.aircraft?.reg ?? null
    const originIATA = flight.departure?.airport?.iata ?? ''
    const destIATA   = flight.arrival?.airport?.iata ?? ''
    const originCity = flight.departure?.airport?.municipalityName ?? originIATA
    const destCity   = flight.arrival?.airport?.municipalityName ?? destIATA
    const originLat  = flight.departure?.airport?.location?.lat
    const originLon  = flight.departure?.airport?.location?.lon
    const destLat    = flight.arrival?.airport?.location?.lat
    const destLon    = flight.arrival?.airport?.location?.lon
    const thisDep    = flight.departure?.scheduledTime?.utc ?? flight.departure?.scheduledTime?.local ?? ''

    const [schedule, faaDelays, originWeatherRaw, destWeatherRaw] = await Promise.all([
      tailNumber             ? getAircraftSchedule(tailNumber, date)       : Promise.resolve(null),
      getAllFAADelays(),
      originLat && originLon ? getAirportWeather(originLat, originLon)     : Promise.resolve(null),
      destLat   && destLon   ? getAirportWeather(destLat, destLon)         : Promise.resolve(null),
    ])

    const allFlightsToday = Array.isArray(schedule) ? schedule : []

    const upstream = allFlightsToday
      .filter((f: any) => {
        const dep = f.departure?.scheduledTime?.utc ?? f.departure?.scheduledTime?.local ?? ''
        return dep && thisDep && dep < thisDep
      })
      .slice(-3)
      .reverse()

    const downstream = allFlightsToday
      .filter((f: any) => {
        const dep = f.departure?.scheduledTime?.utc ?? f.departure?.scheduledTime?.local ?? ''
        return dep && thisDep && dep > thisDep
      })
      .slice(0, 3)

    const avgUpstreamDelay =
      upstream.length > 0
        ? Math.round(
            upstream.reduce((a: number, f: any) => a + (f.departure?.delay ?? 0), 0) /
              upstream.length
          )
        : 0

    const originFAA = faaForAirport(faaDelays, originIATA)
    const destFAA   = faaForAirport(faaDelays, destIATA)

    const upstreamText =
      upstream.length > 0
        ? upstream
            .map(
              (f: any) =>
                `${f.number ?? '?'}: ${f.departure?.airport?.iata ?? '?'} to ${f.arrival?.airport?.iata ?? '?'} | ${f.status ?? 'unknown'} | delay: ${f.departure?.delay ?? 0}min`
            )
            .join('\n')
        : 'No earlier flights found for this aircraft today.'

    const wxText = (w: any[] | null, label: string) =>
      w
        ? w.map((p) => `${p.time}: ${p.shortForecast}, ${p.temperature}F, ${p.windSpeed} ${p.windDirection}, ${p.precipChance}% precip`).join(' | ')
        : `${label}: weather service unavailable (may be international airport)`

    const prompt = `You are SkyGuard, an aviation risk analyst. Assess this flight concisely.

FLIGHT: ${cleaned} on ${date}
Airline: ${flight.airline?.name ?? 'Unknown'}
Aircraft: ${tailNumber ?? 'Unknown'}
Status: ${flight.status ?? 'Scheduled'} | Current delay: ${flight.departure?.delay ?? 0} minutes
Route: ${originCity} (${originIATA}) to ${destCity} (${destIATA})
Scheduled departure: ${flight.departure?.scheduledTime?.local ?? 'Unknown'}

AIRCRAFT EARLIER TODAY:
${upstreamText}

FAA ${originIATA}: ${originFAA.status}
FAA ${destIATA}: ${destFAA.status}

WEATHER ${originIATA}: ${wxText(originWeatherRaw, originIATA)}
WEATHER ${destIATA}: ${wxText(destWeatherRaw, destIATA)}

Respond ONLY with valid JSON:
{
  "riskLevel": "low" or "medium" or "high",
  "summary": "1-2 clear sentences on the situation",
  "actions": ["Action 1", "Action 2", "Action 3"],
  "upstreamImpact": "What aircraft history means for this flight, or null",
  "weatherImpact": "Key weather risk, or null if conditions are fine",
  "airportAlerts": "Active FAA programs, or null if none"
}`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}'
    let recommendation
    try {
      recommendation = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      recommendation = {
        riskLevel: 'medium',
        summary: 'Flight data retrieved but AI analysis incomplete. Check the airline app directly.',
        actions: ['Check the airline app for latest updates', 'Arrive with extra time', 'Have airline contact number ready'],
        upstreamImpact: null,
        weatherImpact: null,
        airportAlerts: null,
      }
    }

    return NextResponse.json({
      flight,
      searchedDate: date,
      recommendation,
      weather: {
        origin:      { airport: originIATA, city: originCity, current: originWeatherRaw?.[0] ?? null },
        destination: { airport: destIATA,   city: destCity,   current: destWeatherRaw?.[0]  ?? null },
      },
      faa: {
        origin:      { airport: originIATA, ...originFAA },
        destination: { airport: destIATA,   ...destFAA   },
      },
      aircraft: {
        registration: tailNumber,
        upstream,
        downstream,
        totalToday: allFlightsToday.length,
        avgUpstreamDelay,
      },
    })
  } catch (err) {
    console.error('SkyGuard error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}