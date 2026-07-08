# SkyGuard Roadmap

## Do now
- [x] Remove "Live monitoring active" misleading text
- [x] FAA endpoint graceful fallback when site returns HTML instead of JSON
- [x] Verify leave by time is calculating correctly and is visually prominent
- [ ] Complete plain English language pass throughout UI

## Up next
- [ ] Email alerts — user enters flight and email, we monitor every 15 min and notify on change
      (uses Supabase, Resend, Vercel Cron)
- [ ] OpenSky Network integration for aircraft history regardless of airline
- [ ] Historical on-time performance per route
- [ ] User accounts (Supabase auth)
- [ ] Trip view — multiple flights per trip in one combined risk view
- [ ] Connecting flight risk assessment

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
- FAA alerts not showing correctly (in progress)
- Aircraft history not showing for some airlines (AA and United block tail numbers by policy)
- Live monitoring text is confusing (fix pending)
- Aviation terminology too technical (addressed)
- Want flight history like FlightAware (planned)
- App feels sterile (addressed)
