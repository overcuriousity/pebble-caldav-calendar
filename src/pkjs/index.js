var Clay = require('pebble-clay');
var clayConfig = require('./config');
var messageKeys = require('message_keys');
// ical-expander 1.1.2 → ical.js 1.x (ES5, safe for Pebble's Duktape runtime)
var IcalExpander = require('ical-expander');

var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

var CHUNK_SIZE    = 4;
var BYTES_PER_EVENT = 64; // uint32 start + uint32 end + char[56] title

// ---------------------------------------------------------------------------
// Settings helpers — all user prefs live in localStorage, not the watch.
// Only TIME_FORMAT is pushed to the watch (the C code uses it directly).
// ---------------------------------------------------------------------------

function getUrls() {
  var raw = localStorage.getItem('ical_urls');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch(e) { return []; }
}

function getDays() {
  return parseInt(localStorage.getItem('ical_days') || '7', 10);
}

function getSyncInterval() {
  return parseInt(localStorage.getItem('ical_sync_interval') || '60', 10);
}

// ---------------------------------------------------------------------------
// Fetch & parse one ICS feed; call back with an array of event rows.
// ---------------------------------------------------------------------------

function fetchOne(url, days, callback) {
  var req = new XMLHttpRequest();
  req.open('GET', url, true);

  req.onreadystatechange = function() {
    if (req.readyState !== 4) return;

    if (req.status !== 200) {
      console.log('JS: HTTP ' + req.status + ' for ' + url);
      callback([]);
      return;
    }

    try {
      var now     = new Date();
      var horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      var expander = new IcalExpander({ ics: req.responseText, maxIterations: 1000 });
      var result   = expander.between(now, horizon);

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

      callback(rows);
    } catch(err) {
      console.log('JS: parse error for ' + url + ': ' + err);
      callback([]);
    }
  };

  req.send(null);
}

// ---------------------------------------------------------------------------
// Fetch all configured feeds in parallel, merge, sort, send to watch.
// Parallel fetching keeps the radio busy for a shorter total time than
// sequential fetching, which is better for battery life.
// ---------------------------------------------------------------------------

function fetchAll(urls, forceFetch) {
  if (!urls || urls.length === 0) {
    console.log('JS: No calendar URLs configured.');
    return;
  }

  var days         = getDays();
  var cacheMinutes = getSyncInterval();
  var lastFetch    = localStorage.getItem('last_fetch_time');
  var now          = Date.now();

  if (!forceFetch && lastFetch && (now - parseInt(lastFetch, 10)) < (cacheMinutes * 60000)) {
    console.log('JS: Cache fresh (' + cacheMinutes + ' min interval). Skipping fetch.');
    return;
  }

  console.log('JS: Fetching ' + urls.length + ' feed(s), ' + days + '-day window...');

  var pending  = urls.length;
  var allRows  = [];

  urls.forEach(function(url) {
    fetchOne(url, days, function(rows) {
      allRows = allRows.concat(rows);
      pending -= 1;

      if (pending === 0) {
        // All feeds done — merge, sort, send
        allRows.sort(function(a, b) { return a.timestampMs - b.timestampMs; });
        console.log('JS: ' + allRows.length + ' event(s) total across all feeds.');

        if (allRows.length > 0) {
          sendEventByteArray(allRows, 0);
        } else {
          console.log('JS: No events in window.');
        }
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Pack events into raw bytes and send to watch in BT-safe chunks of 4.
// ---------------------------------------------------------------------------

function sendEventByteArray(events, start) {
  var count = Math.min(events.length - start, CHUNK_SIZE);
  if (count <= 0) return;

  var buf   = new ArrayBuffer(count * BYTES_PER_EVENT);
  var view  = new DataView(buf);
  var bytes = new Uint8Array(buf);

  for (var i = 0; i < count; i++) {
    var offset = i * BYTES_PER_EVENT;
    var ev     = events[start + i];

    view.setUint32(offset,     Math.floor(ev.timestampMs    / 1000), true);
    view.setUint32(offset + 4, Math.floor((ev.endTimestampMs || ev.timestampMs) / 1000), true);

    var t = ev.title || 'No Title';
    for (var c = 0; c < 55; c++) {
      bytes[offset + 8 + c] = (c < t.length) ? t.charCodeAt(c) : 0;
    }
  }

  var arr = [];
  for (var j = 0; j < bytes.length; j++) arr.push(bytes[j]);

  Pebble.sendAppMessage({
    'TOTAL_EVENTS': events.length,
    'CHUNK_INDEX':  Math.floor(start / CHUNK_SIZE),
    'EVENT_DATA':   arr
  }, function() {
    if (start + CHUNK_SIZE >= events.length) {
      console.log('JS: All chunks sent. Sync complete.');
      localStorage.setItem('last_fetch_time', Date.now().toString());
    } else {
      sendEventByteArray(events, start + CHUNK_SIZE);
    }
  }, function() {
    console.log('JS: BT send failed. Will retry on next launch.');
  });
}

// ---------------------------------------------------------------------------
// App event listeners
// ---------------------------------------------------------------------------

// App ready: sync if cache is stale
Pebble.addEventListener('ready', function() {
  console.log('JS: Ready.');
  fetchAll(getUrls(), false);
});

// Watch sent a help signal (storage wiped): force immediate sync
Pebble.addEventListener('appmessage', function() {
  console.log('JS: Emergency sync requested by watch.');
  fetchAll(getUrls(), true);
});

// Open Clay settings page
Pebble.addEventListener('showConfiguration', function() {
  Pebble.openURL(clay.generateUrl());
});

// Settings saved
Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) return;

  var dict = clay.getSettings(e.response);

  // Collect non-empty URLs from the 4 fields
  var urlKeys = ['ICAL_URL_1', 'ICAL_URL_2', 'ICAL_URL_3', 'ICAL_URL_4'];
  var urls = urlKeys.map(function(k) {
    return (dict[messageKeys[k]] || '').trim();
  }).filter(function(u) { return u !== ''; });

  // Persist phone-side prefs in localStorage (not sent to watch)
  localStorage.setItem('ical_urls',          JSON.stringify(urls));
  localStorage.setItem('ical_days',          dict[messageKeys.ICAL_DAYS]          || '7');
  localStorage.setItem('ical_sync_interval', dict[messageKeys.ICAL_SYNC_INTERVAL] || '60');

  // Send only TIME_FORMAT to the watch — smallest possible BT message
  var watchDict = {};
  watchDict[messageKeys.TIME_FORMAT] = dict[messageKeys.TIME_FORMAT];

  Pebble.sendAppMessage(watchDict, function() {
    console.log('JS: TIME_FORMAT pushed to watch.');
    if (urls.length > 0) {
      fetchAll(urls, true); // force fetch with new settings
    }
  }, function() {
    console.log('JS: Failed to push settings to watch.');
  });
});
