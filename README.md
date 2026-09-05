# BM Time — Simple MVP

A deliberately small, location-based employee time clock.

## Included
- Dedicated kiosk screen with 4-digit PIN keypad
- Clock In and Clock Out only
- Automatic reset after each punch
- Kiosk fixed to one location through environment variables
- Simple password-protected manager status screen
- Supabase schema for locations, job titles, employees, kiosks and punches
- Demo mode for testing before Supabase is connected

## Run the demo
1. Copy `.env.example` to `.env.local`.
2. Set `KIOSK_TOKEN` and `NEXT_PUBLIC_KIOSK_TOKEN` to the same long random value.
3. Set `MANAGER_PASSWORD`.
4. Leave `NEXT_PUBLIC_DEMO_MODE=true`.
5. Run `npm install` and `npm run dev`.
6. Open `/kiosk`. Demo PINs are `1234`, `2468`, and `7300`.
7. Open `/manager` and enter your manager password.

## Connect Supabase

Do not run an individual SQL file against a new database. The historical files
under `supabase/` were created through several separate setup paths and are not
a complete, ordered Production build.

Database setup now follows [the canonical database process](supabase/CANONICAL_DATABASE.md).
Until its clean-room replay gate passes, use the existing Production project and
do not create schema through the Supabase SQL editor.

## One Vercel project per kiosk location
For the simplest setup, deploy the same repository four times with different values for:
- `NEXT_PUBLIC_KIOSK_LOCATION`
- `NEXT_PUBLIC_KIOSK_NAME`
- `KIOSK_TOKEN`
- `NEXT_PUBLIC_KIOSK_TOKEN`

That gives each branch a dedicated URL and keeps employees from selecting a location.

## Not included yet
Breaks, scheduling, PTO, mobile punching, GPS, offline mode, payroll integration and complicated permissions.
