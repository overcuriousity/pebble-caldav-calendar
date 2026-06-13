# 7day CalDAV Calendar

A Pebble Time 2 watchapp that shows your next 7 days of calendar events fetched
directly from any public ICS/CalDAV feed — no Google account required.

**Fork of** [ericlmccormick/Pebble_7_day_ICS_Calendar](https://github.com/ericlmccormick/Pebble_7_day_ICS_Calendar).  
The original routes events through a Google Apps Script proxy; this fork removes
that dependency and fetches/parses the ICS feed directly on the phone using
[ical-expander](https://github.com/nicktindall/ical-expander) (ical.js 1.x,
ES5-compatible with Pebble's Duktape JS runtime).

## Getting your Nextcloud ICS URL

1. Open **Nextcloud Calendar** in a browser.
2. Click the three-dot menu next to your calendar → **Edit**.
3. Scroll to **"Kalender teilen"** / **"Share calendar"**.
4. Click **"Link teilen"** (public share link) to create a public link if you
   haven't already.
5. Click the **copy** icon next to the link — you'll get a URL like:  
   `https://cloud.example.com/apps/calendar/p/TOKEN`
6. Change the URL to the ICS export form:  
   `https://cloud.example.com/remote.php/dav/public-calendars/TOKEN?export`

That `?export` URL is what you paste into the app's settings.

## Build & install

You need the [Rebble SDK](https://developer.rebble.io) (successor to the Pebble
SDK):

```sh
# In the project directory:
npm install          # install ical-expander + pebble-clay
pebble build         # compile C + bundle JS
pebble install --phone <your-phone-ip>   # sideload to watch
```

For the emulator:

```sh
pebble install --emulator emery
```

## Test the ICS parser (no SDK needed)

```sh
npm install
node test/parse.test.js test/fixture.ics          # runs assertions
node test/parse.test.js 'https://cloud.example.com/remote.php/dav/public-calendars/TOKEN?export'
```

## What changed from upstream

| File | Change |
|------|--------|
| `src/pkjs/index.js` | Removed hardcoded `PROXY_URL`. `fetchIcal()` now fetches the ICS URL directly and parses it with `ical-expander`. All other logic (chunking, caching, BT send, Clay handlers) unchanged. |
| `src/pkjs/config.js` | Updated label and placeholder to Nextcloud/CalDAV; added helper text. |
| `package.json` | Renamed, new UUID, added `ical-expander` dep, version reset to 1.0.0. |
| `src/c/main.c` | Unchanged — the C watch app is format-agnostic. |

## License

Upstream project had no explicit license; this fork is offered for personal use.
