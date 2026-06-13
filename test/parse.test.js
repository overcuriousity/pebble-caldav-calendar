/**
 * parse.test.js — Node.js verification harness for the 7day CalDAV Calendar ICS parser.
 *
 * Runs the same logic as src/pkjs/index.js fetchIcal() but in plain Node so
 * you can test it without the Pebble SDK.
 *
 * Usage:
 *   node test/parse.test.js test/fixture.ics         # local ICS file
 *   node test/parse.test.js https://cloud.example.com/remote.php/dav/public-calendars/TOKEN?export
 *
 * Exit codes: 0 = pass, 1 = fail
 */

'use strict';

var fs   = require('fs');
var path = require('path');
var https = require('https');
var http  = require('http');
var IcalExpander = require('ical-expander');

var arg = process.argv[2];
if (!arg) {
  console.error('Usage: node test/parse.test.js <file.ics|https://...>');
  process.exit(1);
}

function parseAndPrint(icsText, label) {
  var now     = new Date();
  var horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  console.log('--- ' + label + ' ---');
  console.log('Window: ' + now.toISOString() + '  →  ' + horizon.toISOString());

  var expander = new IcalExpander({ ics: icsText, maxIterations: 1000 });
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

  rows.sort(function(a, b) { return a.timestampMs - b.timestampMs; });

  if (rows.length === 0) {
    console.log('(no events in window)');
  } else {
    rows.forEach(function(r, i) {
      var start = new Date(r.timestampMs);
      var end   = new Date(r.endTimestampMs);
      console.log('[' + (i + 1) + '] ' + r.title);
      console.log('     start: ' + start.toISOString());
      console.log('     end:   ' + end.toISOString());
    });
  }

  // --- Assertions (fixture-only) ---
  if (label === 'fixture.ics') {
    var pass = true;

    // 1. "Old Meeting" must NOT appear
    var hasOld = rows.some(function(r) { return r.title.indexOf('Old Meeting') !== -1; });
    if (hasOld) {
      console.error('FAIL: "Old Meeting" appeared but should be outside the window.');
      pass = false;
    } else {
      console.log('PASS: "Old Meeting" correctly excluded.');
    }

    // 2. "Doctor Appointment" must appear (one-off in window)
    var hasDoctor = rows.some(function(r) { return r.title === 'Doctor Appointment'; });
    if (hasDoctor) {
      console.log('PASS: "Doctor Appointment" found.');
    } else {
      console.error('FAIL: "Doctor Appointment" not found.');
      pass = false;
    }

    // 3. "All Day Conference" must appear
    var hasConf = rows.some(function(r) { return r.title === 'All Day Conference'; });
    if (hasConf) {
      console.log('PASS: "All Day Conference" found.');
    } else {
      console.error('FAIL: "All Day Conference" not found.');
      pass = false;
    }

    // 4. "Weekly Team Standup" must appear (RRULE expansion)
    var hasStandup = rows.some(function(r) { return r.title === 'Weekly Team Standup'; });
    if (hasStandup) {
      console.log('PASS: "Weekly Team Standup" (RRULE) found.');
    } else {
      console.error('FAIL: "Weekly Team Standup" (RRULE) not found — recurrence expansion may be broken.');
      pass = false;
    }

    // 5. Results must be sorted ascending
    var sorted = rows.every(function(r, i) {
      return i === 0 || rows[i - 1].timestampMs <= r.timestampMs;
    });
    if (sorted) {
      console.log('PASS: Results are sorted ascending.');
    } else {
      console.error('FAIL: Results are NOT sorted.');
      pass = false;
    }

    console.log('\n' + (pass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'));
    process.exit(pass ? 0 : 1);
  }
}

// --- Load ICS from file or URL ---
if (arg.startsWith('http://') || arg.startsWith('https://')) {
  var client = arg.startsWith('https://') ? https : http;
  client.get(arg, function(res) {
    var body = '';
    res.on('data', function(chunk) { body += chunk; });
    res.on('end', function() {
      if (res.statusCode !== 200) {
        console.error('HTTP ' + res.statusCode + ' fetching ' + arg);
        process.exit(1);
      }
      parseAndPrint(body, arg);
    });
  }).on('error', function(e) {
    console.error('Fetch error: ' + e.message);
    process.exit(1);
  });
} else {
  var filePath = path.resolve(arg);
  var icsText  = fs.readFileSync(filePath, 'utf8');
  parseAndPrint(icsText, path.basename(filePath));
}
