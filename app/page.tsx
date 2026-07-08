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
  confidenceScore: number
  summary: string
  actions: string[]
  upstreamImpact: string | null
  weatherImpact: string | null
  airportAlerts: string | null
}

interface FlightResult {
  flight: any
  searchedDate: string
  derivedStatus: string
  departureDelayMinutes: number
  dataFetchedAt: string | null
  dataQuality: { departure: string[]; arrival: string[] } | null
  recommendation: Recommendation
  departureTerminal: string | null
  departureGate: string | null
  arrivalTerminal: string | null
  arrivalBaggage: string | null
  timing: {
    departure: {
      scheduled: string | null
      updated: string | null
      delayMinutes: number
      scheduledISO: string | null
    }
    arrival: {
      scheduled: string | null
      updated: string | null
      delayMinutes: number
    }
  }
  weather: {
    origin: { airport: string; city: string; current: WeatherPeriod | null }
    destination: { airport: string; city: string; current: WeatherPeriod | null }
  }
  faa: {
    origin: { airport: string; hasAlert: boolean; status: string }
    destination: { airport: string; hasAlert: boolean; status: string }
  }
  aircraft: {
    registration: string | null
    model: string | null
    upstream: any[]
    downstream: any[]
    totalToday: number
    avgUpstreamDelay: number
  }
}

interface TSAData {
  waitMinutes: number | null
  preCheckMinutes: number | null
  checkpoint: string | null
  preCheckAvailable: boolean
  isEstimate: boolean
}

const STATUS_BADGE: Record<string, string> = {
  Expected:   'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  EnRoute:    'bg-green-500/15 text-green-400 border border-green-500/30',
  Landing:    'bg-green-500/15 text-green-400 border border-green-500/30',
  Boarding:   'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  GateClosed: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  CheckIn:    'bg-slate-500/15 text-slate-300 border border-slate-500/30',
  Departed:   'bg-teal-500/15 text-teal-400 border border-teal-500/30',
  Arrived:    'bg-slate-500/15 text-slate-300 border border-slate-500/30',
  Delayed:    'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  Cancelled:  'bg-red-500/15 text-red-400 border border-red-500/30',
  Diverted:   'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  Unknown:    'bg-slate-500/15 text-slate-400 border border-slate-500/30',
}

const STATUS_LABEL: Record<string, string> = {
  Expected:   'On time',
  EnRoute:    'Airborne',
  Landing:    'Landing now',
  Boarding:   'Boarding',
  GateClosed: 'Gate closed',
  CheckIn:    'Check-in open',
  Departed:   'Departed',
  Arrived:    'Arrived',
  Delayed:    'Delayed',
  Cancelled:  'Cancelled',
  Diverted:   'Diverted',
  Unknown:    'Status unknown',
}

function todayString(): string {
  const d = new Date()
  const year  = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day   = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateLabel(d: string): string {
  const today = todayString()
  const tmr   = new Date(Date.now() + 86400000)
  const tmrStr = `${tmr.getFullYear()}-${String(tmr.getMonth()+1).padStart(2,'0')}-${String(tmr.getDate()).padStart(2,'0')}`
  if (d === today)  return 'Today'
  if (d === tmrStr) return 'Tomorrow'
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

function delayColor(minutes: number): string {
  if (minutes < 0)   return '#10B981'
  if (minutes <= 15) return '#F59E0B'
  if (minutes <= 45) return '#F97316'
  return '#EF4444'
}

function delayLabel(minutes: number): string {
  if (minutes < 0)   return `${Math.abs(minutes)}m early`
  if (minutes === 0) return 'On time'
  return `+${minutes}m`
}

function waitColor(mins: number | null | undefined): string {
  if (!mins)        return '#4A6080'
  if (mins < 15)   return '#10B981'
  if (mins <= 30)  return '#F59E0B'
  return '#EF4444'
}

function getVerdictHeadline(riskLevel: string, status: string): string {
  if (status === 'Cancelled') return 'YOUR FLIGHT HAS BEEN CANCELLED'
  if (status === 'Diverted')  return 'YOUR FLIGHT HAS BEEN DIVERTED'
  if (riskLevel === 'high')   return 'YOUR FLIGHT NEEDS ATTENTION'
  if (riskLevel === 'medium') return 'HEADS UP — DELAYS ARE POSSIBLE'
  if (['EnRoute', 'Landing'].includes(status)) return 'YOUR FLIGHT IS IN THE AIR'
  if (status === 'Boarding')  return 'TIME TO HEAD TO YOUR GATE'
  if (status === 'Arrived')   return 'YOUR FLIGHT HAS LANDED'
  return "YOU'RE ALL SET TO TRAVEL"
}

function LiveDot({ level }: { level: 'low' | 'medium' | 'high' }) {
  const c = {
    low:    { ping: 'bg-green-400',  dot: 'bg-green-500'  },
    medium: { ping: 'bg-yellow-400', dot: 'bg-yellow-500' },
    high:   { ping: 'bg-red-400',    dot: 'bg-white'      },
  }[level]
  return (
    <span className="relative flex h-3 w-3 flex-shrink-0">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${c.ping}`} />
      <span className={`relative inline-flex rounded-full h-3 w-3 ${c.dot}`} />
    </span>
  )
}

function AirlineLogo({ iata, name }: { iata?: string; name?: string }) {
  const [failed, setFailed] = useState(false)
  if (!iata || failed) {
    return (
      <div className="w-12 h-12 rounded-xl bg-blue-950 border border-blue-800 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-blue-400">{iata ?? '?'}</span>
      </div>
    )
  }
  return (
    <img
      src={`https://www.gstatic.com/flights/airline_logos/70px/${iata}.png`}
      onError={() => setFailed(true)}
      alt={name ?? 'Airline'}
      className="w-12 h-12 object-contain rounded-xl border border-slate-700"
    />
  )
}

function FlightPath({ status, timing, result }: {
  status: string
  timing: FlightResult['timing'] | null
  result: FlightResult | null
}) {
  const [pos, setPos] = useState({ x: 20, y: 60, angle: -15 })

  const mode = status === 'Cancelled'                                ? 'cancelled'
    : status === 'Diverted'                                          ? 'diverted'
    : ['Arrived', 'Departed'].includes(status)                       ? 'landed'
    : ['EnRoute', 'Landing'].includes(status)                        ? 'enroute'
    : ['Boarding', 'GateClosed', 'CheckIn'].includes(status)         ? 'boarding'
    : 'scheduled'

  useEffect(() => {
    if (mode === 'landed') {
      setPos({ x: 380, y: 60, angle: 15 })
      return
    }
    if (mode === 'diverted') {
      const t = 0.6
      setPos({
        x: (1-t)*(1-t)*20 + 2*(1-t)*t*200 + t*t*380,
        y: (1-t)*(1-t)*60 + 2*(1-t)*t*10  + t*t*60,
        angle: 5,
      })
      return
    }
    if (mode !== 'enroute' || !timing?.departure?.scheduledISO) return

    function calc() {
      const deptMs = new Date(timing!.departure.scheduledISO!).getTime()
      const arrISO = result?.flight?.arrival?.scheduledTime?.local
      const arrMs  = arrISO
        ? new Date(arrISO.replace(' ', 'T')).getTime()
        : deptMs + 5 * 3600000
      const t  = Math.max(0, Math.min(1, (Date.now() - deptMs) / (arrMs - deptMs)))
      const x  = (1-t)*(1-t)*20 + 2*(1-t)*t*200 + t*t*380
      const y  = (1-t)*(1-t)*60 + 2*(1-t)*t*10  + t*t*60
      const dx = 2*(1-t)*(200-20) + 2*t*(380-200)
      const dy = 2*(1-t)*(10-60)  + 2*t*(60-10)
      setPos({ x, y, angle: Math.atan2(dy, dx) * 180 / Math.PI })
    }
    calc()
    const iv = setInterval(calc, 60000)
    return () => clearInterval(iv)
  }, [mode, timing, result])

  const isCancelled = mode === 'cancelled'
  const isMoving    = mode === 'enroute'

  return (
    <div style={{ marginBottom: '12px' }}>
      <svg viewBox="0 0 400 80" width="100%" style={{ display: 'block', overflow: 'visible' }}>
        <path d="M 20 60 Q 200 10 380 60" fill="none"
          stroke={isCancelled ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.2)'}
          strokeWidth="1.5" strokeDasharray={isCancelled ? '6 4' : '5 4'} />
        <circle cx="20"  cy="60" r="4" fill="#3B82F6" />
        <circle cx="380" cy="60" r="4" fill="#3B82F6" />
        {!isCancelled && (
          <g transform={`translate(${pos.x}, ${pos.y}) rotate(${pos.angle})`}>
            <text textAnchor="middle" dominantBaseline="central" fontSize="14"
              style={{ userSelect: 'none' }}>✈️</text>
          </g>
        )}
        {(mode === 'scheduled' || mode === 'boarding') && (
          <circle cx="20" cy="60" r="4" fill="none" stroke="#3B82F6">
            <animate attributeName="r" values="4;14;4" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>
      {isMoving && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '-4px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '4px 12px',
            background: 'rgba(59,130,246,0.07)',
            border: '1px solid rgba(59,130,246,0.15)',
            borderRadius: '20px',
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3B82F6' }} />
            <span style={{ fontSize: '11px', color: '#8BA3C7' }}>In flight</span>
          </div>
        </div>
      )}
    </div>
  )
}

function RiskCard({ rec, status }: { rec: Recommendation; status: string }) {
  const headline = getVerdictHeadline(rec.riskLevel, status)

  if (rec.riskLevel === 'high') {
    return (
      <div className="rounded-2xl overflow-hidden shadow-xl">
        <div className="bg-gradient-to-br from-red-500 via-red-600 to-rose-700 p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <LiveDot level="high" />
              <span className="text-white font-bold text-xs tracking-widest uppercase">{headline}</span>
            </div>
            <div style={{ textAlign: 'center', flexShrink: 0, marginLeft: '12px' }}>
              <div style={{ fontSize: '26px', fontWeight: 900, color: 'rgba(255,255,255,0.9)' }}>
                {rec.confidenceScore}
              </div>
              <div style={{ fontSize: '10px', color: 'rgba(255,200,200,0.7)', marginTop: '2px' }}>
                confidence
              </div>
            </div>
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
        <div className="bg-red-700/90 px-5 py-2">
          <span className="text-red-200 text-xs">Verify directly with your airline before heading to the airport</span>
        </div>
      </div>
    )
  }

  if (rec.riskLevel === 'medium') {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(120,53,15,0.4) 0%, rgba(78,43,0,0.6) 100%)',
        border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: '16px',
        padding: '18px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <div style={{
                width: '8px', height: '8px', background: '#F59E0B',
                borderRadius: '50%', boxShadow: '0 0 0 3px rgba(245,158,11,0.2)',
              }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#F59E0B', letterSpacing: '0.06em' }}>
                {headline}
              </span>
            </div>
            <p style={{ fontSize: '15px', color: 'white', fontWeight: 500, lineHeight: 1.4, margin: 0 }}>
              {rec.summary}
            </p>
          </div>
          <div style={{ textAlign: 'center', flexShrink: 0, marginLeft: '12px' }}>
            <div style={{ fontSize: '26px', fontWeight: 900, color: '#F59E0B' }}>
              {rec.confidenceScore}
            </div>
            <div style={{ fontSize: '10px', color: '#7A5A20', marginTop: '2px' }}>
              confidence
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(245,158,11,0.15)', paddingTop: '10px' }}>
          {rec.actions.map((action, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' }}>
              <span style={{ color: '#7A5A20', flexShrink: 0 }}>→</span>
              <span style={{ fontSize: '12px', color: '#D4A040' }}>{action}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(6,40,25,0.8) 0%, rgba(2,20,15,0.9) 100%)',
      border: '1px solid rgba(16,185,129,0.25)',
      borderRadius: '16px',
      padding: '18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <div style={{
              width: '8px', height: '8px', background: '#10B981',
              borderRadius: '50%', boxShadow: '0 0 0 3px rgba(16,185,129,0.2)',
            }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#10B981', letterSpacing: '0.06em' }}>
              {headline}
            </span>
          </div>
          <p style={{ fontSize: '15px', color: 'white', fontWeight: 500, lineHeight: 1.4, margin: 0 }}>
            {rec.summary}
          </p>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0, marginLeft: '12px' }}>
          <div style={{ fontSize: '26px', fontWeight: 900, color: '#10B981' }}>
            {rec.confidenceScore}
          </div>
          <div style={{ fontSize: '10px', color: '#4A8066', marginTop: '2px' }}>
            confidence
          </div>
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(16,185,129,0.15)', paddingTop: '10px' }}>
        {rec.actions.map((action, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px' }}>
            <span style={{ color: '#4A8066', flexShrink: 0 }}>→</span>
            <span style={{ fontSize: '12px', color: '#6BAA80' }}>{action}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AircraftPhotoCard({ aircraft, flight }: {
  aircraft: FlightResult['aircraft']
  flight: any
}) {
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
  const model = aircraft.model ?? flight?.aircraft?.model ?? null
  const reg   = aircraft.registration
  if (!reg && !model) return null
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
      <div className="relative h-48 bg-gradient-to-br from-slate-800 to-slate-950">
        {photo?.url ? (
          <>
            <img src={photo.url} alt={`${reg} aircraft`} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            {photo.photographer && (
              <p className="absolute bottom-2 right-3 text-white/40 text-xs">📷 {photo.photographer}</p>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-5xl mb-2">✈️</p>
              <p className="text-slate-600 text-xs">{photoLoading ? 'Loading photo...' : 'Photo unavailable'}</p>
            </div>
          </div>
        )}
        <div className="absolute bottom-3 left-4">
          <p className="text-white font-bold text-lg leading-none drop-shadow">{reg ?? '—'}</p>
          {model && <p className="text-white/60 text-xs mt-0.5 drop-shadow">{model}</p>}
        </div>
      </div>
      <div className="px-4 py-3 grid grid-cols-3 divide-x divide-slate-800">
        <div className="pr-3">
          <p className="text-xs text-slate-500">Registration</p>
          <p className="text-sm font-semibold text-white truncate">{reg ?? '—'}</p>
        </div>
        <div className="px-3">
          <p className="text-xs text-slate-500">Aircraft type</p>
          <p className="text-sm font-semibold text-white truncate">
            {model ? model.split(' ').slice(0, 2).join(' ') : '—'}
          </p>
        </div>
        <div className="pl-3">
          <p className="text-xs text-slate-500">Legs today</p>
          <p className="text-sm font-semibold text-white">{aircraft.totalToday || '—'}</p>
        </div>
      </div>
    </div>
  )
}

function FAACard({ faa }: { faa: FlightResult['faa'] }) {
  const hasAlert = faa.origin.hasAlert || faa.destination.hasAlert
  return (
    <div className={`rounded-2xl overflow-hidden ${hasAlert ? 'shadow-lg' : ''}`}>
      {hasAlert && <div className="h-1 bg-gradient-to-r from-orange-500 to-red-500 animate-pulse" />}
      <div className={`border p-4 ${hasAlert
        ? 'bg-orange-950/20 border-orange-800/40 rounded-b-2xl'
        : 'bg-slate-900 border-slate-800 rounded-2xl'}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xl ${hasAlert ? 'animate-bounce' : ''}`}>
            {hasAlert ? '⚠️' : '✅'}
          </span>
          <p className="text-xs font-semibold text-slate-300">FAA status</p>
          {hasAlert && (
            <span className="ml-auto text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/30">
              Active
            </span>
          )}
        </div>
        <div className="space-y-2">
          {[faa.origin, faa.destination].map(a => (
            <div key={a.airport}>
              <p className="text-xs font-semibold text-slate-500">{a.airport}</p>
              <p className={`text-xs leading-snug mt-0.5 ${a.hasAlert ? 'text-orange-400' : 'text-slate-600'}`}>
                {a.status}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AircraftHistoryCard({ aircraft, airlineName, airlineIata }: {
  aircraft: FlightResult['aircraft']
  airlineName: string | null
  airlineIata: string | null
}) {
  const hasDelay   = aircraft.avgUpstreamDelay > 0
  const restricted = !aircraft.registration && !!airlineIata
  return (
    <div className={`border rounded-2xl p-4 ${
      hasDelay ? 'bg-yellow-950/20 border-yellow-800/40' : 'bg-slate-900 border-slate-800'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🔄</span>
        <p className="text-xs font-semibold text-slate-300">Earlier today</p>
        {hasDelay && (
          <span className="ml-auto text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full border border-yellow-500/30">
            +{aircraft.avgUpstreamDelay}m avg
          </span>
        )}
      </div>
      {restricted ? (
        <div>
          <p className="text-xs text-slate-500 mb-1 leading-relaxed">
            {airlineName ?? 'This airline'} restricts tail number sharing with third parties
          </p>
          {aircraft.model && <p className="text-xs text-blue-400">Aircraft: {aircraft.model}</p>}
        </div>
      ) : !aircraft.registration ? (
        <p className="text-xs text-slate-500">Tail number unavailable</p>
      ) : aircraft.upstream.length === 0 ? (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <p className="text-xs text-slate-400">First leg of the day</p>
        </div>
      ) : (
        <div className="space-y-2">
          {aircraft.upstream.map((f: any, i: number) => {
            const delay = f.departure?.delay ?? 0
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${delay > 0 ? 'bg-yellow-500' : 'bg-green-500'}`} />
                <span className="font-semibold text-slate-300">{f.number ?? '?'}</span>
                <span className="text-slate-500">
                  {f.departure?.airport?.iata ?? '?'} to {f.arrival?.airport?.iata ?? '?'}
                </span>
                {delay > 0 && <span className="ml-auto text-yellow-400 font-semibold">+{delay}m</span>}
              </div>
            )
          })}
          {hasDelay && (
            <p className="text-xs text-yellow-400/60 pt-1.5 mt-1 border-t border-yellow-800/30">
              Delays may cascade to your flight
            </p>
          )}
        </div>
      )}
      {aircraft.downstream.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <p className="text-xs text-slate-600 mb-2">Later today</p>
          {aircraft.downstream.map((f: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs mb-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-500/50" />
              <span className="font-semibold text-slate-400">{f.number ?? '?'}</span>
              <span className="text-slate-600">
                {f.departure?.airport?.iata ?? '?'} to {f.arrival?.airport?.iata ?? '?'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [flightNumber, setFlightNumber] = useState('')
  const [travelDate, setTravelDate]     = useState(todayString())
  const [loading, setLoading]           = useState(false)
  const [result, setResult]             = useState<FlightResult | null>(null)
  const [error, setError]               = useState('')
  const [hasPrecheck, setHasPrecheck]   = useState(false)
  const [tsaData, setTsaData]           = useState<TSAData | null | undefined>(undefined)
  const [countdown, setCountdown]       = useState('—')
  const [destTime, setDestTime]         = useState('—')

  useEffect(() => {
    const iso = result?.timing?.departure?.scheduledISO
    if (!iso) { setCountdown('—'); return }
    const isoStr = iso
    function tick() {
      const diff = new Date(isoStr).getTime() - Date.now()
      if (diff <= 0) { setCountdown('Departed'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`)
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [result?.timing?.departure?.scheduledISO])

  useEffect(() => {
    const tz = result?.flight?.arrival?.airport?.timeZone
    if (!tz) { setDestTime('—'); return }
    function update() {
      try {
        setDestTime(new Date().toLocaleTimeString('en-US', {
          timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
        }))
      } catch { setDestTime('—') }
    }
    update()
    const iv = setInterval(update, 30000)
    return () => clearInterval(iv)
  }, [result?.flight?.arrival?.airport?.timeZone])

  useEffect(() => {
    if (!result) { setTsaData(undefined); return }
    const airport  = result.faa.origin.airport
    const terminal = result.departureTerminal ?? ''
    if (!airport) { setTsaData(null); return }
    setTsaData(undefined)
    fetch(`/api/tsa?airport=${airport}&terminal=${encodeURIComponent(terminal)}`)
      .then(r => r.json())
      .then(d => setTsaData(d))
      .catch(() => setTsaData(null))
  }, [result?.faa?.origin?.airport, result?.departureTerminal])

  async function checkFlight() {
    if (!flightNumber.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    setTsaData(undefined)
    try {
      const fn  = flightNumber.trim().toUpperCase().replace(/[\s-]/g, '')
      const res = await fetch(`/api/flight?flight=${fn}&date=${travelDate}`)
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

  const displayedWait = !tsaData
    ? null
    : hasPrecheck && tsaData.preCheckAvailable
      ? tsaData.preCheckMinutes
      : tsaData.waitMinutes

  return (
    <main className="min-h-screen bg-slate-950 py-12 px-4">
      <div className="max-w-lg mx-auto">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">SkyGuard</h1>
          <p className="text-sm text-slate-500">Your flight assistant</p>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 mb-6 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={flightNumber}
              onChange={e => setFlightNumber(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && checkFlight()}
              placeholder="Enter your flight number"
              className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={checkFlight}
              disabled={loading || !flightNumber.trim()}
              className="px-5 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {loading ? 'Analyzing...' : 'Check flight'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Date</span>
            <input
              type="date"
              value={travelDate}
              min={todayString()}
              onChange={e => setTravelDate(e.target.value)}
              className="text-xs text-slate-300 border border-slate-700 rounded-lg px-2 py-1.5 bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-500">{formatDateLabel(travelDate)}</span>
          </div>
        </div>

        {/* Empty state — shown when idle */}
        {!result && !loading && !error && (
          <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
            <p style={{
              fontSize: '22px', fontWeight: 700, color: 'white',
              margin: '0 0 10px', letterSpacing: '-0.3px', lineHeight: 1.3,
            }}>
              Know before you leave for the airport
            </p>
            <p style={{
              fontSize: '14px', color: '#4A6080', margin: '0 0 28px', lineHeight: 1.6,
              maxWidth: '280px', marginLeft: 'auto', marginRight: 'auto',
            }}>
              Enter your flight number and get an honest risk assessment — delays, weather, and what to do about it.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
              <p style={{ fontSize: '11px', color: '#1E3A52', margin: 0 }}>Try searching</p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {['AA100', 'DL400', 'UA1', 'WN100'].map(fn => (
                  <button
                    key={fn}
                    onClick={() => { setFlightNumber(fn) }}
                    style={{
                      background: '#0C1829',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '20px',
                      padding: '5px 14px',
                      fontSize: '12px',
                      color: '#4A6080',
                      cursor: 'pointer',
                    }}
                  >
                    {fn}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-950/50 border border-red-800/50 rounded-2xl text-red-400 text-sm mb-4 leading-relaxed">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-20 space-y-2">
            <p className="text-4xl animate-pulse">✈️</p>
            <p className="text-slate-400 text-sm font-medium">Checking your flight...</p>
            <p className="text-xs text-slate-600">Pulling live data from FAA, weather, and airline systems</p>
          </div>
        )}

        {result && rec && f && (
          <div className="space-y-3">

            {/* Data quality warning — shown when not Live */}
            {result.dataQuality && !result.dataQuality.departure.includes('Live') && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px',
                background: 'rgba(245,158,11,0.06)',
                border: '1px solid rgba(245,158,11,0.15)',
                borderRadius: '10px',
              }}>
                <span style={{ fontSize: '14px', color: '#F59E0B', flexShrink: 0 }}>ℹ</span>
                <p style={{ fontSize: '11px', color: '#9A7030', margin: 0, lineHeight: 1.5 }}>
                  Data may be up to 15 min delayed. Verify time-sensitive changes with your airline.
                </p>
              </div>
            )}

            {/* CHANGE 1 + 2: RiskCard first */}
            <RiskCard rec={rec} status={result.derivedStatus ?? f.status ?? ''} />

            {/* Flight card */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                  <AirlineLogo iata={f.airline?.iata} name={f.airline?.name} />
                  <div>
                    <p className="text-xs text-slate-500">{f.airline?.name ?? '—'}</p>
                    <p className="text-xl font-bold text-white">{flightNumber.toUpperCase()}</p>
                    <p className="text-xs text-slate-500">{formatDateLabel(result.searchedDate)}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                  STATUS_BADGE[result.derivedStatus ?? f.status ?? ''] ?? 'bg-slate-700 text-slate-300'
                }`}>
                  {STATUS_LABEL[result.derivedStatus ?? f.status ?? ''] ?? result.derivedStatus ?? f.status ?? 'Unknown'}
                </span>
              </div>

              <FlightPath status={result.derivedStatus ?? f.status ?? ''} timing={result.timing} result={result} />

              <div className="flex items-end mt-2">
                <div className="flex-1">
                  <p className="text-3xl font-black text-white tracking-tight leading-none">
                    {f.departure?.airport?.iata ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {f.departure?.airport?.municipalityName ?? '—'}
                  </p>
                  {result.timing.departure.updated && result.timing.departure.delayMinutes !== 0 ? (
                    <div className="mt-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-bold"
                          style={{ color: delayColor(result.timing.departure.delayMinutes) }}>
                          {result.timing.departure.updated}
                        </p>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{
                          color: delayColor(result.timing.departure.delayMinutes),
                          background: `${delayColor(result.timing.departure.delayMinutes)}20`,
                          border: `1px solid ${delayColor(result.timing.departure.delayMinutes)}40`,
                        }}>
                          {delayLabel(result.timing.departure.delayMinutes)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-through mt-0.5">
                        {result.timing.departure.scheduled}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xl font-bold text-white mt-2">
                      {result.timing.departure.scheduled ?? '—'}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {result.departureTerminal && (
                      <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded-md px-2 py-0.5">
                        Terminal {result.departureTerminal}
                      </span>
                    )}
                    {result.departureGate && (
                      <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-2 py-0.5">
                        Gate {result.departureGate}
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-3 flex-shrink-0">
                  <div className="flex items-center gap-1 text-slate-700">
                    <div className="h-px w-6 bg-slate-700" />
                    <span className="text-xs">✈️</span>
                    <div className="h-px w-6 bg-slate-700" />
                  </div>
                </div>

                <div className="flex-1 text-right">
                  <p className="text-3xl font-black text-white tracking-tight leading-none">
                    {f.arrival?.airport?.iata ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {f.arrival?.airport?.municipalityName ?? '—'}
                  </p>
                  {result.timing.arrival.updated && result.timing.arrival.delayMinutes !== 0 ? (
                    <div className="mt-2">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{
                          color: delayColor(result.timing.arrival.delayMinutes),
                          background: `${delayColor(result.timing.arrival.delayMinutes)}20`,
                          border: `1px solid ${delayColor(result.timing.arrival.delayMinutes)}40`,
                        }}>
                          {delayLabel(result.timing.arrival.delayMinutes)}
                        </span>
                        <p className="text-xl font-bold"
                          style={{ color: delayColor(result.timing.arrival.delayMinutes) }}>
                          {result.timing.arrival.updated}
                        </p>
                      </div>
                      <p className="text-xs text-slate-600 line-through mt-0.5 text-right">
                        {result.timing.arrival.scheduled}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xl font-bold text-white mt-2 text-right">
                      {result.timing.arrival.scheduled ?? '—'}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2 justify-end">
                    {result.arrivalTerminal && (
                      <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 rounded-md px-2 py-0.5">
                        Terminal {result.arrivalTerminal}
                      </span>
                    )}
                    {result.arrivalBaggage && (
                      <span className="text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-md px-2 py-0.5">
                        Belt {result.arrivalBaggage}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Delay banner */}
              {(() => {
                const delay = result.departureDelayMinutes ?? 0
                if (result.derivedStatus !== 'Delayed' && delay <= 0) return null
                const c = delay <= 15
                  ? { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', text: '#F59E0B' }
                  : delay <= 45
                  ? { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)', text: '#F97316' }
                  : { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',  text: '#EF4444' }
                const msg = delay <= 0  ? 'Delay reported — duration unknown'
                  : delay <= 15 ? `Minor delay — running ${delay} minutes late`
                  : delay <= 45 ? `Delayed ${delay} minutes — plan accordingly`
                  : `Significant delay of ${delay} minutes`
                return (
                  <div style={{
                    marginTop: '12px', padding: '10px 14px',
                    background: c.bg, border: `1px solid ${c.border}`, borderRadius: '10px',
                    display: 'flex', alignItems: 'center', gap: '10px',
                  }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%',
                      background: c.text, flexShrink: 0, boxShadow: `0 0 0 3px ${c.border}` }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: c.text, margin: '0 0 2px' }}>
                        {msg}
                      </p>
                      {result.timing.departure.updated && (
                        <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>
                          New departure: {result.timing.departure.updated}
                          {result.timing.arrival.updated ? ` · Arrives: ${result.timing.arrival.updated}` : ''}
                        </p>
                      )}
                    </div>
                    {delay > 0 && (
                      <p style={{ fontSize: '20px', fontWeight: 800, color: c.text, flexShrink: 0, margin: 0 }}>
                        +{delay}m
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* CHANGE 3: Gate / Terminal / Countdown strip */}
              {(result.departureGate || result.departureTerminal || countdown !== '—') && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  marginTop: '12px',
                  paddingTop: '12px',
                  gap: 0,
                }}>
                  <div style={{ textAlign: 'center', padding: '0 8px' }}>
                    <p style={{ fontSize: '11px', color: '#4A6080', margin: 0 }}>Gate</p>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#60A5FA', margin: '3px 0 0' }}>
                      {result.departureGate ?? '—'}
                    </p>
                  </div>
                  <div style={{
                    textAlign: 'center', padding: '0 8px',
                    borderLeft: '1px solid rgba(255,255,255,0.06)',
                    borderRight: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <p style={{ fontSize: '11px', color: '#4A6080', margin: 0 }}>Terminal</p>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'white', margin: '3px 0 0' }}>
                      {result.departureTerminal ?? '—'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'center', padding: '0 8px' }}>
                    <p style={{ fontSize: '11px', color: '#4A6080', margin: 0 }}>Departs in</p>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#F59E0B', margin: '3px 0 0' }}>
                      {countdown}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-800">
                <p className="text-xs text-slate-600">Always verify with your airline</p>
                <a
                  href={`https://www.flightaware.com/live/flight/${flightNumber.toUpperCase().replace(/\s/g,'')}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '12px', color: '#60A5FA', fontWeight: 500, textDecoration: 'none' }}
                >
                  Check live status with airline →
                </a>
              </div>
              {result.dataFetchedAt && (
                <p style={{ fontSize: '10px', color: '#1E3A52', margin: '6px 0 0', textAlign: 'center' }}>
                  Data fetched {Math.round((Date.now() - new Date(result.dataFetchedAt).getTime()) / 60000)} min ago
                </p>
              )}
            </div>

            {/* CHANGE 5: TSA + dest time row (replaces 2x2 grid) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{
                background: '#0D1B2E', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px', padding: '12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <p style={{ fontSize: '11px', color: '#4A6080', margin: 0 }}>
                    Security · {result.faa.origin.airport}
                  </p>
                  <button
                    onClick={() => setHasPrecheck(p => !p)}
                    style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                      borderRadius: '20px', border: 'none', cursor: 'pointer',
                      background: hasPrecheck ? '#1D4ED8' : '#0F172A',
                      color: hasPrecheck ? 'white' : '#64748B',
                    }}
                  >
                    {hasPrecheck ? 'Pre✓' : 'Std'}
                  </button>
                </div>
                <p style={{
                  fontSize: '20px', fontWeight: 800,
                  color: waitColor(displayedWait), margin: '0 0 2px', lineHeight: 1,
                }}>
                  {tsaData === undefined ? '...'
                    : !displayedWait && displayedWait !== 0 ? 'N/A'
                    : displayedWait === 0 ? '< 1m'
                    : `${displayedWait}m`}
                </p>
                <p style={{ fontSize: '10px', color: '#2A3D52', margin: 0 }}>
                  {tsaData?.isEstimate ? 'Estimated wait' : 'Current wait'}
                </p>
              </div>

              <div style={{
                background: '#0D1B2E', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px', padding: '12px',
              }}>
                <p style={{ fontSize: '11px', color: '#4A6080', margin: '0 0 4px' }}>
                  Now in {f.arrival?.airport?.municipalityName ?? f.arrival?.airport?.iata ?? '—'}
                </p>
                <p style={{ fontSize: '20px', fontWeight: 800, color: 'white', margin: '0 0 2px', lineHeight: 1 }}>
                  {destTime}
                </p>
                <p style={{ fontSize: '10px', color: '#2A3D52', margin: 0 }}>
                  Local time at arrival
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FAACard faa={result.faa} />
              <AircraftHistoryCard
                aircraft={result.aircraft}
                airlineName={f.airline?.name ?? null}
                airlineIata={f.airline?.iata ?? null}
              />
            </div>

            <AircraftPhotoCard aircraft={result.aircraft} flight={f} />

            {/* CHANGE 4: Single weather summary row */}
            {(() => {
              const ow = result.weather.origin.current
              const dw = result.weather.destination.current
              if (!ow && !dw) return null

              const hasRough = (w: WeatherPeriod | null) => w && (
                w.precipChance > 40 ||
                w.shortForecast.toLowerCase().includes('thunder') ||
                w.shortForecast.toLowerCase().includes('snow') ||
                w.shortForecast.toLowerCase().includes('rain')
              )

              const originRough = hasRough(ow)
              const destRough   = hasRough(dw)
              const anyRough    = originRough || destRough

              const getEmoji = (w: WeatherPeriod | null) => {
                if (!w) return '🌤️'
                return weatherEmoji(w.shortForecast)
              }

              const summary = anyRough
                ? 'Weather may impact your flight — check conditions before leaving'
                : 'Clear conditions at both airports — no weather impact expected'

              return (
                <div style={{
                  background: '#0D1B2E',
                  border: `1px solid ${anyRough ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <span>{getEmoji(ow)}</span>
                    <span style={{ fontSize: '12px', color: '#2A3D52' }}>→</span>
                    <span>{getEmoji(dw)}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{
                      fontSize: '12px', fontWeight: 500,
                      color: anyRough ? '#93C5FD' : 'white',
                      margin: '0 0 2px',
                    }}>
                      {anyRough ? 'Weather alert' : 'Clear skies'}
                    </p>
                    <p style={{ fontSize: '11px', color: '#4A6080', margin: 0 }}>
                      {summary}
                    </p>
                  </div>
                  {ow && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: 'white', margin: 0 }}>
                        {ow.temperature}°
                      </p>
                      <p style={{ fontSize: '10px', color: '#4A6080', margin: 0 }}>
                        {result.weather.origin.airport}
                      </p>
                    </div>
                  )}
                </div>
              )
            })()}

          </div>
        )}

      </div>
    </main>
  )
}
