// --- Imports ---
// Require the Pebble Clay library, which builds the settings page automatically
var Clay = require('pebble-clay');
// Require the configuration file that tells Clay what fields to draw (URL, 12h/24h)
var clayConfig = require('./config');
// Require the message_keys dictionary so we can map names (like 'ICAL_URL') to their numerical IDs
var messageKeys = require('message_keys');
// ical-expander handles ICS parsing AND full RFC-5545 recurrence expansion (RRULE).
// Pinned to 1.1.2 which depends on ical.js 1.x (ES5-compatible, safe for Pebble's Duktape runtime).
var IcalExpander = require('ical-expander');

// Initialize Clay. 'autoHandleEvents: false' tells Clay that we want to manually
// handle what happens when the user clicks "Save", rather than letting Clay do it blindly.
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

// --- Configuration Constants ---
// How many events we send to the watch in a single Bluetooth packet
var CHUNK_SIZE = 4;
// How many bytes a single CalendarEvent struct takes up in C (8 bytes for time + 56 bytes for title = 64)
var BYTES_PER_EVENT = 64;
// How many minutes the phone will wait before fetching a fresh update
var CACHE_MINUTES = 30;

// --- Core Functions ---

/**
 * Fetches the ICS calendar directly from the user's CalDAV/Nextcloud public URL,
 * parses it with ical-expander (which handles RRULEs, VTIMEZONEs, all-day events),
 * and collects events in the next 7 days.
 *
 * This replaces the original Google Apps Script proxy approach. PebbleKit JS
 * XHR is not subject to browser CORS restrictions, so we can fetch the
 * Nextcloud ?export URL directly without any intermediary.
 *
 * @param {string} url - The user's public ICS URL (e.g. .../public-calendars/TOKEN?export)
 */
function fetchIcal(url) {
  console.log('JS: Fetching ICS directly from: ' + url);

  var req = new XMLHttpRequest();
  req.open('GET', url, true);

  req.onreadystatechange = function() {
    if (req.readyState !== 4) return;

    if (req.status !== 200) {
      console.log('JS: HTTP error ' + req.status + ' fetching ICS.');
      return;
    }

    try {
      // Parse the raw ICS text and expand recurring events into the next 7 days.
      var now = new Date();
      var horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      var expander = new IcalExpander({ ics: req.responseText, maxIterations: 1000 });
      var result = expander.between(now, horizon);

      // result.events      → one-off VEVENTs whose DTSTART falls in [now, horizon]
      // result.occurrences → individual occurrences of recurring (RRULE) events
      var rows = result.events.map(function(e) {
        return {
          timestampMs:    e.startDate.toJSDate().getTime(),
          endTimestampMs: e.endDate ? e.endDate.toJSDate().getTime()
                                    : e.startDate.toJSDate().getTime(),
          title: e.summary || 'No Title'
        };
      }).concat(result.occurrences.map(function(o) {
        return {
          timestampMs:    o.startDate.toJSDate().getTime(),
          endTimestampMs: o.endDate ? o.endDate.toJSDate().getTime()
                                    : o.startDate.toJSDate().getTime(),
          title: o.item.summary || 'No Title'
        };
      }));

      // Sort chronologically (ical-expander may return mixed order when combining
      // one-off and recurring events).
      rows.sort(function(a, b) { return a.timestampMs - b.timestampMs; });

      console.log('JS: Parsed ' + rows.length + ' event(s) in next 7 days.');

      if (rows.length > 0) {
        sendEventByteArray(rows, 0);
      } else {
        console.log('JS: No events found in the next 7 days.');
      }
    } catch(e) {
      console.log('JS: ICS parse error: ' + e);
    }
  };

  req.send(null);
}

/**
 * Converts JS objects into raw bytes and sends them to the watch in manageable chunks.
 * This function calls itself recursively until all events are sent.
 * @param {Array} events - The full array of parsed calendar events
 * @param {number} start - The index of the array to start this specific chunk at
 */
function sendEventByteArray(events, start) {
  // Determine how many events to send in this chunk.
  // It's usually CHUNK_SIZE (4), unless we are at the very end of the list.
  var count = Math.min(events.length - start, CHUNK_SIZE);

  // If we've run out of events, stop.
  if (count <= 0) return;

  // Create an empty chunk of memory exactly the right size for these events
  var buf = new ArrayBuffer(count * BYTES_PER_EVENT);
  // Create a DataView to write 32-bit integers (for timestamps)
  var view = new DataView(buf);
  // Create a Uint8Array to write individual 8-bit characters (for titles)
  var bytes = new Uint8Array(buf);

  // Loop through the events for this specific chunk
  for (var i = 0; i < count; i++) {
    // Calculate exactly where in the memory buffer this event starts
    var offset = i * BYTES_PER_EVENT;
    // Grab the event object from the main array
    var ev = events[start + i];

    // Write the start timestamp (Convert Javascript Milliseconds to Unix Seconds)
    view.setUint32(offset,     Math.floor(ev.timestampMs    / 1000), true);
    // Write the end timestamp
    view.setUint32(offset + 4, Math.floor((ev.endTimestampMs || ev.timestampMs) / 1000), true);

    // Grab the title, or use a fallback if it's missing
    var t = ev.title || 'No Title';

    // Write the title character by character (Max 55 chars to leave room for the null terminator)
    for (var c = 0; c < 55; c++) {
      // If the character exists in the string, write its char code. Otherwise, write 0 (null padding).
      bytes[offset + 8 + c] = (c < t.length) ? t.charCodeAt(c) : 0;
    }
  }

  // Convert the Uint8Array into a standard Javascript Array of numbers so Pebble can send it
  var arr = [];
  for (var j = 0; j < bytes.length; j++) arr.push(bytes[j]);

  // Package the data into a dictionary and send it to the watch
  Pebble.sendAppMessage({
    'TOTAL_EVENTS': events.length,                   // Let the watch know how big the total list is
    'CHUNK_INDEX':  Math.floor(start / CHUNK_SIZE),  // Let the watch know which piece this is (0, 1, 2...)
    'EVENT_DATA':   arr                              // The raw bytes
  }, function() {
    // --- SUCCESS CALLBACK ---
    // If the watch successfully received the chunk...

    // Check if we just sent the very last piece of data
    if (start + CHUNK_SIZE >= events.length) {
      console.log('JS: All chunks sent successfully. Sync complete.');
      // ONLY NOW do we update the timestamp. This prevents partial syncs from breaking the 30-minute rule.
      localStorage.setItem('last_fetch_time', Date.now().toString());
    } else {
      // If there are more events, call this function again, shifting the starting index forward
      sendEventByteArray(events, start + CHUNK_SIZE);
    }
  }, function() {
    // --- ERROR CALLBACK ---
    console.log('JS: Failed to send chunk to watch. Bluetooth might be busy.');
    // If a chunk fails, the app will try again on the next launch rather than infinitely looping.
  });
}

// --- App Event Listeners ---

// Fired the moment the app boots up on the watch
Pebble.addEventListener('ready', function() {
  console.log('JS: PebbleKit JS Bridge Initialized.');

  // Retrieve saved data from the phone's local storage
  var savedUrl  = localStorage.getItem('user_ical_url');
  var lastFetch = localStorage.getItem('last_fetch_time');
  var now = Date.now();

  // If the user has configured an ICS URL...
  if (savedUrl) {
    // Check if the cache is missing, OR if it's been more than 30 minutes since last fetch
    if (!lastFetch || (now - parseInt(lastFetch)) > (CACHE_MINUTES * 60000)) {
      console.log('JS: Cache expired. Initiating background sync...');
      fetchIcal(savedUrl);
    } else {
      console.log('JS: Data is fresh. Watch will use its own internal storage.');
    }
  }
});

// Fired when the watch specifically asks the phone for help (The "Help Signal")
// This happens if the watch's internal storage gets wiped and it needs data IMMEDIATELY
Pebble.addEventListener('appmessage', function() {
  console.log('JS: Watch requested an emergency data sync!');
  var savedUrl = localStorage.getItem('user_ical_url');
  if (savedUrl) fetchIcal(savedUrl); // Bypass the 30-minute timer and fetch
});

// Fired when the user taps the "Settings" gear icon in the Pebble app on their phone
Pebble.addEventListener('showConfiguration', function() {
  // Generate and open the Clay settings HTML page
  Pebble.openURL(clay.generateUrl());
});

// Fired when the user taps "Save" on the Clay settings page
Pebble.addEventListener('webviewclosed', function(e) {
  if (e && e.response) {
    // Convert the Clay response back into a standard dictionary
    var dict = clay.getSettings(e.response);

    // 1. Send the dictionary to the watch immediately (This updates the 12h/24h setting)
    Pebble.sendAppMessage(dict, function() {
      console.log('JS: Format settings pushed to watch.');

      // 2. Extract the URL using the numerical message key ID
      var url = dict[messageKeys.ICAL_URL];

      if (url) {
        console.log('JS: New URL saved. Forcing data sync...');
        // Save the URL to local storage so the 'ready' event can find it next time
        localStorage.setItem('user_ical_url', url);
        // Force an immediate fetch, bypassing the 30-minute timer
        fetchIcal(url);
      }
    });
  }
});
