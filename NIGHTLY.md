# SkyGuard Nightly Checklist
Run this at the start of every Claude Code session.

## Security
- [ ] No API keys referenced in page.tsx or any client-side code
- [ ] All external fetches have AbortSignal.timeout()
- [ ] No sensitive data returned to client that is not needed

## Code quality
- [ ] No debug console.log in production files
      (only [SkyGuard] prefixed logs are intentional)
- [ ] No TypeScript errors — run: npx tsc --noEmit
- [ ] No unused imports or dead code

## Data integrity
- [ ] Delay calculated via calcDelayMins() not from flight.departure.delay (field does not exist)
- [ ] FAA matching checks both IATA and ICAO formats
- [ ] derivedStatus used everywhere not raw f.status

## Git
- [ ] All changes committed and pushed
- [ ] On correct branch for current work
- [ ] CLAUDE.md reflects current state

## Before shipping any feature
- [ ] Tested on mobile (primary use case)
- [ ] Tested with a real flight number
- [ ] Graceful fallback if API fails
- [ ] Plain English copy — no aviation jargon
