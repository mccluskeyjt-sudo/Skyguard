'use client'

import { useState, useEffect } from 'react'

interface WeatherPeriod {
  time: string
  shortForecast: string
  temperature: number
  windSpeed: string
  windDirection: string
  precipChance: number
}

interface Recommendation {
  riskLevel: 'low' | 'medium' | 'high'
  summary: string
  actions: string[]
  upstreamImpact: string | null
  weatherImpact: string | null
  airportAlerts: string | null
}

interface FlightResult {
  flight: any
  searchedDate: string
  recommendation: Recommendation
  weather: {
    origin:      { airport: string; city: string; current: WeatherPeriod | null }
    destination: { airport: string; city: string; current: WeatherPeriod | null }
  }
  faa: {
    origin:      { airport: string; hasAlert: boolean; status: string }
    destination: { airport: string; hasAlert: boolean; status: string }
  }
  aircraft: {
    registration: string | null
    upstream: any[]
    downstream: any[]
    totalToday: number
    avgUpstreamDelay: number
  }
}

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function formatDateLabel(d: string) {
  const today    = todayString()
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (d === today)    return 'Today'
  if (d === tomorrow) return 'Tomorrow'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function weatherEmoji(condition: string = ''): string {
  const c = condition.toLowerCase()
  if (c.includes('thunder'))                                                return '⛈️'
  if (c.includes('snow') || c.includes('blizzard'))                        return '❄️'
  if (c.includes('rain') || c.includes('shower') || c.includes('drizzle')) return '🌧️'
  if (c.includes('fog')  || c.includes('mist'))                            return '🌫️'
  if (c.includes('overcast'))                                               return '☁️'
  if (c.includes('mostly cloudy') || c.includes('cloudy'))                 return '🌥️'
  if (c.includes('partly') || c.includes('mostly clear'))                  return '⛅'
  if (c.includes('clear') || c.includes('sunny'))                          return '☀️'
  return '🌤️'
}

function LiveDot({ level }: { level: 'low' | 'medium' | 'high' }) {
  const cfg = {
    low:    { ping: 'bg-green-400',  solid: 'bg-green-500'  },
    medium: { ping: 'bg-yellow-400', solid: 'bg-yellow-500' },
    high:   { ping: 'bg-red-400',    solid: 'bg-white'      },
  }[level]
  return (
    <span className="relative flex h-3 w-3 flex-shrink-0">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.ping}`} />
      <span className={`relative inline-flex rounded-full h-3 w-3 ${cfg.solid}`} />
    </span>
  )
}

function AirlineLogo({ iata, name }: { iata?: string; name?: string }) {
  const [failed, setFailed] = useState(false)
  if (!iata || failed) {
    return (
      <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-blue-500">{iata ?? '?'}</span>
      </div>
    )
  }
  return (
    <img
      src={`https://www.gstatic.com/flights/airline_logos/70px/${iata}.png`}
      onError={() => setFailed(true)}
      alt={name ?? 'Airline'}
      className="w-12 h-12 object-contain rounded-xl border border-gray-100"
    />
  )
}

function RiskCard({ rec }: { rec: Recommendation }) {
  if (rec.riskLevel === 'high') {
    return (
      <div className="rounded-2xl overflow-hidden shadow-xl">
        <div className="bg-gradient-to-br from-red-500 via-red-600 to-rose-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <LiveDot level="high" />
              <span className="text-white font-bold text-xs tracking-widest uppercase">Flight at risk</span>
            </div>
            <span className="text-2xl">⚠️</span>
          </div>
          <p className="text-red-50 text-sm leading-relaxed mb-4">{rec.summary}</p>
          <div className="space-y-2">
            {rec.actions.map((action, i) => (
              <div key={i} className="flex items-start gap-3 bg-white/10 rounded-xl px-3 py-2">
                <span className="text-red-200 font-bold text-xs flex-shrink-0 mt-0.5">{i + 1}</span>
                <span className="text-white text-sm">{action}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-red-700/90 px-5 py-2 flex items-center justify-between">
          <span className="text-red-200 text-xs">Verify with your airline</span>
          <span className="text-red-300 text-xs animate-pulse">Live monitoring active</span>
        </div>
      </div>
    )
  }

  if (rec.riskLevel === 'medium') {
    return (
      <div className="rounded-2xl overflow-hidden border-2 border-yellow-300 shadow-md">
        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <LiveDot level="medium" />
              <span className="text-yellow-700 font-bold text-xs tracking-widest uppercase">Moderate risk</span>
            </div>
            <span className="text-2xl">⚡</span>
          </div>
          <p className="text-gray-700 text-sm leading-relaxed mb-4">{rec.summary}</p>
          <div className="space-y-2">
            {rec.actions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 bg-yellow-100/60 rounded-xl px-3 py-2">
                <span className="text-yellow-500 font-bold flex-shrink-0">→</span>
                <span className="text-gray-700 text-sm">{action}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-yellow-100 px-5 py-2 flex items-center justify-between border-t border-yellow-200">
          <span className="text-yellow-700 text-xs">Monitor for updates</span>
          <span className="text-yellow-600 text-xs animate-pulse">Checking every 15 min</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-green-200 shadow-sm">
      <div className="h-1.5 bg-gradient-to-r from-green-400 to-emerald-400" />
      <div className="bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <LiveDot level="low" />
            <span className="text-green-600 font-bold text-xs tracking-widest uppercase">Looking good</span>
          </div>
          <span className="text-2xl">✅</span>
        </div>
        <p className="text-gray-700 text-sm leading-relaxed mb-4">{rec.summary}</p>
        <div className="space-y-2">
          {rec.actions.map((action, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <span className="text-green-400 flex-shrink-0 mt-0.5">→</span>
              <span>{action}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-green-50 px-5 py-2 border-t border-green-100">
        <span className="text-green-600 text-xs">No major disruptions detected</span>
      </div>
    </div>
  )
}

function AircraftPhotoCard({ aircraft, flight }: { aircraft: FlightResult['aircraft']; flight: any }) {
  const [photo, setPhoto] = useState<{ url: string; photographer: string | null } | null>(null)
  const [photoLoading, setPhotoLoading] = useState(false)

  useEffect(() => {
    if (!aircraft.registration) return
    setPhotoLoading(true)
    fetch(`/api/aircraft-photo?reg=${aircraft.registration}`)
      .then(r => r.json())
      .then(d => { if (d.photo?.url) setPhoto(d.photo) })
      .catch(() => {})
      .finally(() => setPhotoLoading(false))
  }, [aircraft.registration])

  const model = flight.aircraft?.model ?? null
  const reg   = aircraft.registration
  if (!reg && !model) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="relative h-48 bg-gradient-to-br from-slate-800 to-blue-950">
        {photo?.url ? (
          <>
            <img
              src={photo.url}
              alt={`${reg ?? 'Aircraft'} in airline livery`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            {photo.photographer && (
              <p className="absolute bottom-2 right-3 text-white/50 text-xs">
                📷 {photo.photographer}
              </p>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-5xl mb-2">✈️</p>
              <p className="text-blue-300 text-xs">
                {photoLoading ? 'Loading aircraft photo...' : 'Photo unavailable'}
              </p>
            </div>
          </div>
        )}
        <div className="absolute bottom-3 left-4">
          <p className="text-white font-bold text-lg leading-none drop-shadow">{reg ?? '—'}</p>
          {model && <p className="text-white/70 text-xs mt-0.5 drop-shadow">{model}</p>}
        </div>
      </div>
      <div className="px-4 py-3 grid grid-cols-3 divide-x divide-gray-100">
        <div className="pr-3">
          <p className="text-xs text-gray-400">Registration</p>
          <p className="text-sm font-semibold text-gray-900 truncate">{reg ?? '—'}</p>
        </div>
        <div className="px-3">
          <p className="text-xs text-gray-400">Aircraft type</p>
          <p className="text-sm font-semibold text-gray-900 truncate">
            {model ? model.split(' ').slice(0, 2).join(' ') : '—'}
          </p>
        </div>
        <div className="pl-3">
          <p className="text-xs text-gray-400">Legs today</p>
          <p className="text-sm font-semibold text-gray-900">{aircraft.totalToday || '—'}</p>
        </div>
      </div>
    </div>
  )
}

function WeatherCard({ label, data }: { label: string; data: FlightResult['weather']['origin'] }) {
  const w = data.current
  if (!w) {
    return (
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 shadow-sm">
        <p className="text-xs text-gray-400 mb-1">{label} · {data.airport}</p>
        <p className="text-xs text-gray-400 mt-6">Unavailable</p>
      </div>
    )
  }
  const rough =
    w.precipChance > 50 ||
    w.shortForecast.toLowerCase().includes('thunder') ||
    w.shortForecast.toLowerCase().includes('snow')

  return (
    <div className={`rounded-2xl p-4 border shadow-sm ${rough ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'}`}>
      <p className="text-xs text-gray-400 mb-2">{label} · {data.airport}</p>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-4xl">{weatherEmoji(w.shortForecast)}</span>
        <span className="text-2xl font-bold text-gray-900">{w.temperature}°</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">{w.shortForecast}</p>
      <div className="flex flex-wrap gap-2 text-xs text-gray-400">
        <span>💨 {w.windSpeed}</span>
        {w.precipChance > 0 && (
          <span className={w.precipChance > 50 ? 'text-blue-600 font-semibold' : ''}>
            🌧️ {w.precipChance}%
          </span>
        )}
      </div>
    </div>
  )
}

function FAACard({ faa }: { faa: FlightResult['faa'] }) {
  const hasAlert = faa.origin.hasAlert || faa.destination.hasAlert
  return (
    <div className={`rounded-2xl overflow-hidden ${hasAlert ? 'shadow-md' : 'shadow-sm'}`}>
      {hasAlert && (
        <div className="h-1.5 bg-gradient-to-r from-orange-400 via-red-500 to-orange-400 animate-pulse" />
      )}
      <div className={`border p-4 ${hasAlert ? 'bg-orange-50 border-orange-200 rounded-b-2xl' : 'bg-white border-gray-100 rounded-2xl'}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xl ${hasAlert ? 'animate-bounce' : ''}`}>{hasAlert ? '⚠️' : '✅'}</span>
          <p className="text-xs font-semibold text-gray-600">FAA status</p>
          {hasAlert && (
            <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium border border-orange-200">
              Active
            </span>
          )}
        </div>
        <div className="space-y-2">
          {[faa.origin, faa.destination].map(a => (
            <div key={a.airport}>
              <p className="text-xs font-semibold text-gray-500">{a.airport}</p>
              <p className={`text-xs leading-snug mt-0.5 ${a.hasAlert ? 'text-orange-700 font-medium' : 'text-gray-500'}`}>
                {a.status}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AircraftHistoryCard({ aircraft }: { aircraft: FlightResult['aircraft'] }) {
  const hasDelay = aircraft.avgUpstreamDelay > 0
  const noData   = aircraft.totalToday === 0 && !aircraft.registration
  return (
    <div className={`border rounded-2xl p-4 shadow-sm ${hasDelay ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-100'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🔄</span>
        <p className="text-xs font-semibold text-gray-600">Earlier today</p>
        {hasDelay && (
          <span className="ml-auto text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium border border-yellow-200">
            +{aircraft.avgUpstreamDelay}m avg
          </span>
        )}
      </div>
      {noData ? (
        <p className="text-xs text-gray-400">Not available on free plan</p>
      ) : aircraft.upstream.length === 0 ? (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <p className="text-xs text-gray-600">First leg of the day</p>
        </div>
      ) : (
        <div className="space-y-2">
          {aircraft.upstream.map((f: any, i: number) => {
            const delay = f.departure?.delay ?? 0
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${delay > 0 ? 'bg-yellow-500' : 'bg-green-400'}`} />
                <span className="font-semibold text-gray-700">{f.number ?? '?'}</span>
                <span className="text-gray-400">{f.departure?.airport?.iata ?? '?'} to {f.arrival?.airport?.iata ?? '?'}</span>
                {delay > 0 && <span className="ml-auto text-yellow-600 font-semibold">+{delay}m</span>}
              </div>
            )
          })}
          {hasDelay && (
            <p className="text-xs text-yellow-700 pt-1.5 mt-1.5 border-t border-yellow-200">
              Delays may cascade to your flight
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const STATUS_BADGE: Record<string, string> = {
  Scheduled: 'bg-blue-50 text-blue-700',
  Active:    'bg-green-50 text-green-700',
  Landed:    'bg-gray-100 text-gray-500',
  Cancelled: 'bg-red-100 text-red-700',
  Diverted:  'bg-orange-100 text-orange-700',
}

export default function Home() {
  const [flightNumber, setFlightNumber] = useState('')
  const [travelDate, setTravelDate]     = useState(todayString())
  const [loading, setLoading]           = useState(false)
  const [result, setResult]             = useState<FlightResult | null>(null)
  const [error, setError]               = useState('')

  async function checkFlight() {
    if (!flightNumber.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const fn   = flightNumber.trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '')
      const res  = await fetch(`/api/flight?flight=${fn}&date=${travelDate}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Flight not found.'); return }
      setResult(data)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const f   = result?.flight
  const rec = result?.recommendation

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 to-gray-100 py-12 px-4">
      <div className="max-w-lg mx-auto">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">SkyGuard</h1>
          <p className="text-sm text-gray-400">Know your flight risk before you leave home</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={flightNumber}
              onChange={e => setFlightNumber(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && checkFlight()}
              placeholder="Flight number — e.g. AA123"
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={checkFlight}
              disabled={loading || !flightNumber.trim()}
              className="px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shadow-sm"
            >
              {loading ? 'Analyzing...' : 'Check flight'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Date</span>
            <input
              type="date"
              value={travelDate}
              min={todayString()}
              onChange={e => setTravelDate(e.target.value)}
              className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-400">{formatDateLabel(travelDate)}</span>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm mb-4 leading-relaxed">{error}</div>
        )}

        {loading && (
          <div className="text-center py-20 space-y-2">
            <p className="text-4xl animate-pulse">✈️</p>
            <p className="text-gray-500 text-sm font-medium">Analyzing your flight...</p>
            <p className="text-xs text-gray-300">Checking aircraft history, FAA alerts, and weather</p>
          </div>
        )}

        {result && rec && f && (
          <div className="space-y-3">

            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <AirlineLogo iata={f.airline?.iata} name={f.airline?.name} />
                  <div>
                    <p className="text-xs text-gray-400">{f.airline?.name ?? '—'}</p>
                    <p className="text-xl font-bold text-gray-900">{flightNumber.toUpperCase()}</p>
                    <p className="text-xs text-gray-400">{formatDateLabel(result.searchedDate)}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${STATUS_BADGE[f.status ?? 'Scheduled'] ?? 'bg-gray-100 text-gray-500'}`}>
                  {f.status ?? 'Scheduled'}
                </span>
              </div>

              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-3xl font-black text-gray-900 tracking-tight">{f.departure?.airport?.iata ?? '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{f.departure?.airport?.municipalityName ?? '—'}</p>
                  <p className="text-lg font-bold text-gray-700 mt-2">{f.departure?.scheduledTime?.local?.slice(11, 16) ?? '—'}</p>
                </div>
                <div className="px-4 flex items-center gap-1">
                  <div className="h-px w-8 bg-gray-200" />
                  <span className="text-sm">✈️</span>
                  <div className="h-px w-8 bg-gray-200" />
                </div>
                <div className="flex-1 text-right">
                  <p className="text-3xl font-black text-gray-900 tracking-tight">{f.arrival?.airport?.iata ?? '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{f.arrival?.airport?.municipalityName ?? '—'}</p>
                  <p className="text-lg font-bold text-gray-700 mt-2">{f.arrival?.scheduledTime?.local?.slice(11, 16) ?? '—'}</p>
                </div>
              </div>

              {(f.departure?.delay ?? 0) > 0 && (
                <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-100 rounded-xl text-yellow-700 text-xs font-medium">
                  <span>⏱</span>
                  <span>Currently delayed {f.departure.delay} minutes</span>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">Always verify with your airline</p>
                <a
                  href={`https://www.flightaware.com/live/flight/${flightNumber.toUpperCase().replace(/\s/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                >
                  Live status →
                </a>
              </div>
            </div>

            <RiskCard rec={rec} />
            <AircraftPhotoCard aircraft={result.aircraft} flight={f} />

            <div className="grid grid-cols-2 gap-3">
              <WeatherCard label="Departure" data={result.weather.origin} />
              <WeatherCard label="Arrival"   data={result.weather.destination} />
              <FAACard     faa={result.faa} />
              <AircraftHistoryCard aircraft={result.aircraft} />
            </div>

          </div>
        )}

      </div>
    </main>
  )
}