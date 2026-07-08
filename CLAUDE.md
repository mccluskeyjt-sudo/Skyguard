@AGENTS.md

# SkyGuard

AI-powered flight assistant that tells travelers what to do, not just what is happening.
Live at https://skyguard-two.vercel.app

## Who it is for

Casual to moderate traveler, 2–10 flights per year. Wants plain English guidance. No download
required. Works on any device.

## Core differentiator

Synthesizes flight status, aircraft rotation, weather, and FAA alerts into a plain English AI
recommendation. No competitor does this.

---

## Tech stack

- Next.js 16, TypeScript, Tailwind CSS
- Vercel hosting
- Supabase (configured, reserved for email alerts — not yet active)
- AeroDataBox Pro via RapidAPI
- National Weather Service (US airports only)
- FAA nasstatus.faa.gov
- Anthropic claude-sonnet-4-6
- Planespotters.net for aircraft photos
- TSA wait times (statistical estimate fallback — live API requires paid key)
- Resend email (configured, not yet active)

## Key files

- `app/page.tsx` — full frontend UI
- `app/api/flight/route.ts` — main data orchestration
- `app/api/aircraft-photo/route.ts` — Planespotters photo proxy
- `app/api/tsa/route.ts` — TSA wait time estimates

---

## What is working

- Flight search with date picker
- Delay detection via scheduledTime vs revisedTime comparison (AeroDataBox has no delay field)
- Derived status promoted from delay calculation (e.g. Expected → Delayed when delay ≥ 15 min)
- AI risk assessment with confidence score via claude-sonnet-4-6
- Aircraft photo from Planespotters
- Weather at departure and arrival airports
- FAA airport alerts with IATA and ICAO dual-format matching
- TSA wait times with PreCheck toggle
- Dark premium UI
- Departure countdown using scheduledISO
- Data freshness timestamp and quality warning banner
- Plain English status labels and verdict headlines
- Deployed and publicly live

## Known issues to fix next

- Remove "Live monitoring active" — misleading, we do not poll continuously
- FAA endpoint returns HTML sometimes — graceful fallback needed
- Verify leave-by time is calculating correctly and is visually prominent
- Plain English language pass not fully complete

## Tabled — do not build yet

- Disney vacation planning — separate product for later
- AI travel concierge — separate product, too broad for current focus

---

## Data notes — critical, read before touching APIs

**AeroDataBox has no delay field.**
Calculate delay by comparing `scheduledTime.utc` vs `revisedTime.utc` using `calcDelayMins()`
in `route.ts`. Never read `flight.departure?.delay` — it does not exist.

**FAA uses ICAO codes (KEWR, KJFK).**
Match both IATA (EWR) and ICAO (KEWR) formats. See `fetchFAAForAirport()`.

**AeroDataBox status values:**
`Expected`, `EnRoute`, `Landing`, `Boarding`, `GateClosed`, `CheckIn`, `Departed`, `Arrived`,
`Delayed`, `Cancelled`, `Diverted`, `Unknown`
NOT `Scheduled`, `Active`, or `Landed` — those are wrong values from old training data.

**Tail numbers blocked by American Airlines and Delta.**
This is airline policy, not a bug. Show a message explaining the restriction.

**NWS weather only covers US airports.**

---

## Coding principles

- All external API calls must live in `/api` routes, never in client components
- Every `fetch()` must have `AbortSignal.timeout()`
- Fail gracefully — if one API fails, show what we have rather than erroring the whole page
- Mobile first — primary use case is someone at an airport on their phone
- Plain English throughout — no aviation jargon in user-facing copy
- No user-facing `console.log` — only `console.error('[SkyGuard] ...')` for real errors

---

## Recent decisions and why

- **No user accounts yet** — reduces friction for first-time visitors
- **Web first, not native app** — works on Android and iOS without a download
- **Progressive disclosure** — verdict first, details on demand
- **Email capture before full accounts** — lower bar to re-engage users
- **Trip view is next major feature** after email alerts — flights only, not hotels or restaurants
- **Itinerary scope is flights only** — hotels and restaurants are TripIt's lane, not ours
