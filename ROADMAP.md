# SkyGuard Roadmap

## Do now
- [x] Remove "Live monitoring active" misleading text
- [x] FAA endpoint graceful fallback when site returns HTML instead of JSON
- [x] Verify leave by time is calculating correctly and is visually prominent
- [x] Complete plain English language pass throughout UI

## Up next
- [x] AI summary tone fix — was reading like an airline ops briefing (e.g. "verify crew
      duty-time compliance"). Rewrote the prompt to speak directly to the passenger only,
      with an explicit list of banned ops/insider terms and a requirement that every action
      be something a traveler can do themselves.
- [x] Confidence score didn't make sense — was invented freely by the AI per a loose band and
      never factored weather, so it could drift and disagree with the summary. Score is now
      computed deterministically server-side (delay, FAA alerts, upstream delay, weather) and
      handed to the AI as a given fact to explain, not a number it invents.
- [ ] Historical on-time performance per route
- [ ] User accounts (Supabase auth)
- [ ] Trip view — multiple flights per trip in one combined risk view
- [ ] Connecting flight risk assessment
- [ ] OpenSky Network integration for aircraft history regardless of airline — ON HOLD: their
      `/flights/aircraft` endpoint is batch-processed overnight, so a blocked airline's rotation
      would show as prior-day history, not same-day. Credentials are saved in `.env.local`
      (OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET) for whenever we revisit this — either reframed
      as a "prior-day reliability" signal, or scoped down to live position only via OpenSky's
      state-vectors endpoint (real-time, no batch delay).

## Deprioritized
- [ ] Email alerts — user enters flight and email, we monitor every 15 min and notify on change
      (uses Supabase, Resend, Vercel Cron) — moved down in favor of fixing AI tone and score

## Later
- [ ] Shareable flight status link
- [ ] PWA add to home screen
- [ ] Landing page redesign
- [ ] Rebooking links for high risk flights

## Decided against and why
- Disney vacation planning — separate product, needs its own data partnerships and design
- AI travel concierge — separate product, too broad for current focus
- Hotels and restaurant itinerary — that is TripIt, not SkyGuard's lane
- Native mobile app — web first covers all devices
- SMS alerts — email first, SMS cost adds up

## User feedback received
- Know when to leave for the airport (addressed)
- FAA alerts not showing correctly (addressed — ASWS API with nasstatus fallback)
- Aircraft history not showing for some airlines (AA and Delta block tail numbers by policy)
- Live monitoring text is confusing (addressed)
- Aviation terminology too technical (addressed)
- Want flight history like FlightAware (planned)
- App feels sterile (addressed)
