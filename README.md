# CalDAV Calendar for Pebble Time 2

A Pebble Time 2 watchapp that displays upcoming calendar events fetched directly
from one or more public ICS/CalDAV feeds — no Google account required.

**Fork of** [ericlmccormick/Pebble_7_day_ICS_Calendar](https://github.com/ericlmccormick/Pebble_7_day_ICS_Calendar).

## Features

- **Multiple calendar sources** — add up to 4 public ICS URLs; all feeds are
  merged into a single chronological view.
- **Configurable time window** — choose 3, 5, 7, 14, or 30 days ahead.
- **Configurable sync interval** — 30 min, 1 h, 2 h, or 6 h; longer intervals
  save battery.
- **Full recurrence support** — daily, weekly, and complex RRULEs are expanded
  via a vendored ES5 build of [ical.js](https://github.com/kewisch/ical.js) 1.x
  (compatible with the Pebble Duktape runtime), including an IANA timezone
  fallback database for feeds that reference a TZID without an inline VTIMEZONE.
- **No proxy, no Google** — feeds are fetched directly from the phone via
  PebbleKit JS XHR, so any publicly accessible ICS URL works.
- **Power-efficient** — parallel fetching (radio on for the shortest possible
  time), configurable cache, minimal Bluetooth messages (only the time-format
  preference is pushed to the watch; calendar data is compact binary).
- **Slim bundle** — ~376 KB `.pbw` (vendored minified ical.js, no shipped source
  map), down from ~1.3 MB.
- Long-press the select button to force an immediate refresh.

## Footprint

PebbleKit JS runs on the **phone**, not the watch. Only the compiled C app
(`pebble-app.bin`, ~3.8 KB) and its resources (~4 KB) are stored in watch flash —
about **8 KB total**. The JavaScript bundle affects the `.pbw` download size and
phone-side memory, but not how much space the app occupies on the watch.

## Getting your calendar URL

The app accepts any URL that returns a valid ICS file:

| Server | How to get the URL |
|--------|--------------------|
| **Nextcloud** | Calendar → edit calendar → Share → "Share link" → copy → change `/apps/calendar/p/TOKEN` to `/remote.php/dav/public-calendars/TOKEN?export` |
| **Google Calendar** | Calendar settings → "Secret address in iCal format" |
| **iCloud** | Calendar → share → copy public link (ends in `.ics`) |
| **Any CalDAV server** | Look for a public/export ICS link in the server's sharing UI |

## Build & install

Requires the [Rebble SDK](https://developer.rebble.io/sdk/) (`pebble-tool` ≥ 5.x):

```sh
# Install pebble-tool (one-time)
uv tool install pebble-tool --python 3.13
pebble sdk install latest

# Build (npm run build = pebble build + strip the debug source map from the .pbw)
cd caldav-calendar
npm install
npm run build

# Sideload to watch via phone
pebble install --phone <phone-ip>
# (Enable Developer Mode in the Pebble/Rebble phone app first)
```

The vendored libraries in `src/pkjs/lib/` (`ical.min.js`, `zones-compiled.json`)
are committed so the project builds out of the box. Regenerate them from the
`devDependencies` with `npm run vendor` after updating `ical.js`/`ical-expander`.

The built `.pbw` is also available under [Releases](../../releases) for direct
sideloading without a build environment.

## Test the parser (no SDK needed)

```sh
npm install
node test/parse.test.js test/fixture.ics
node test/parse.test.js --days 14 https://example.com/calendar.ics
# Multiple feeds:
node test/parse.test.js feed1.ics feed2.ics
```

## What changed from upstream

| Area | Change |
|------|--------|
| **Data fetching** | Removed hardcoded Google Apps Script proxy. Feeds are fetched directly and parsed on the phone with `ical-expander`. |
| **Multiple sources** | Up to 4 ICS URLs, fetched in parallel and merged. |
| **Configurable window** | 3 / 5 / 7 / 14 / 30 days (was hardcoded to 7). |
| **Configurable sync** | 30 min / 1 h / 2 h / 6 h cache interval. |
| **Power efficiency** | Parallel fetching; only `TIME_FORMAT` is sent to the watch per sync (smaller BT message). |
| **Bundle size** | Vendored minified ical.js + ES5 wrapper; debug source map stripped from the `.pbw`. ~376 KB vs ~1.3 MB. |
| **Watch C code** | Unchanged — the C app is format-agnostic. |

## License

Upstream project carried no explicit license. This fork is provided for personal
and community use. Contributions welcome.
