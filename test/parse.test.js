/**
 * parse.test.js — Node.js verification harness for CalDAV Calendar ICS parser.
 *
 * Usage:
 *   node test/parse.test.js [--days N] <file.ics|https://...> [<file2.ics> ...]
 *
 * Multiple sources are merged and sorted, mirroring the app's behaviour.
 * Exit codes: 0 = pass, 1 = fail
 */

'use strict';

var fs    = require('fs');
var path  = require('path');
var https = require('https');
var http  = require('http');
var IcalExpander = require('ical-expander');

// --- Parse CLI args ---
var days = 7;
var sources = [];
process.argv.slice(2).forEach(function(arg) {
  if (arg === '--days') return; // handled by next iteration
  var prev = process.argv[process.argv.indexOf(arg) - 1];
  if (prev === '--days') { days = parseInt(arg, 10); return; }
  sources.push(arg);
});

if (sources.length === 0) {
  console.error('Usage: node test/parse.test.js [--days N] <file.ics|https://...> [...]');
  process.exit(1);
}

var now     = new Date();
var horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

console.log('Window (' + days + ' days): ' + now.toISOString() + ' → ' + horizon.toISOString());

function parseIcs(icsText) {
  var expander = new IcalExpander({ ics: icsText, maxIterations: 1000 });
  var result   = expander.between(now, horizon);

  return result.events.map(function(e) {
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
}

function loadSource(src, callback) {
  if (src.startsWith('http://') || src.startsWith('https://')) {
    var client = src.startsWith('https://') ? https : http;
    client.get(src, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() {
        if (res.statusCode !== 200) {
          console.error('HTTP ' + res.statusCode + ' for ' + src);
          callback([]);
        } else {
          callback(parseIcs(body));
        }
      });
    }).on('error', function(err) {
      console.error('Fetch error for ' + src + ': ' + err.message);
      callback([]);
    });
  } else {
    callback(parseIcs(fs.readFileSync(path.resolve(src), 'utf8')));
  }
}

// Load all sources in parallel, merge when all done
var pending  = sources.length;
var allRows  = [];

sources.forEach(function(src) {
  loadSource(src, function(rows) {
    console.log('  ' + src + ': ' + rows.length + ' event(s)');
    allRows = allRows.concat(rows);
    pending -= 1;

    if (pending === 0) {
      allRows.sort(function(a, b) { return a.timestampMs - b.timestampMs; });
      console.log('\nMerged & sorted: ' + allRows.length + ' event(s)\n');

      allRows.forEach(function(r, i) {
        console.log('[' + (i + 1) + '] ' + r.title);
        console.log('     ' + new Date(r.timestampMs).toISOString() +
                    ' → ' + new Date(r.endTimestampMs).toISOString());
      });

      // --- Assertions (fixture only) ---
      if (sources.length === 1 && sources[0] === 'test/fixture.ics') {
        var pass = true;

        function check(label, condition) {
          if (condition) { console.log('PASS: ' + label); }
          else           { console.error('FAIL: ' + label); pass = false; }
        }

        check('"Old Meeting" excluded (outside window)',
          !allRows.some(function(r) { return r.title.indexOf('Old Meeting') !== -1; }));
        check('"Doctor Appointment" present (one-off)',
          allRows.some(function(r) { return r.title === 'Doctor Appointment'; }));
        check('"All Day Conference" present (all-day)',
          allRows.some(function(r) { return r.title === 'All Day Conference'; }));
        check('"Weekly Team Standup" present (RRULE expansion)',
          allRows.some(function(r) { return r.title === 'Weekly Team Standup'; }));
        check('Results sorted ascending',
          allRows.every(function(r, i) {
            return i === 0 || allRows[i - 1].timestampMs <= r.timestampMs;
          }));

        console.log('\n' + (pass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'));
        process.exit(pass ? 0 : 1);
      }
    }
  });
});
