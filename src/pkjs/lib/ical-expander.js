'use strict';

// ES5 port of the parts of `ical-expander` (v1.1.2) this app actually uses:
// the constructor + between(). The unused before()/after()/all() helpers and
// skipInvalidDates path are omitted. Written in ES5 so the Pebble SDK's
// webpack 1.x (ES5-only acorn parser) and the phone's Duktape runtime accept it.
//
// Vendored deps (regenerate with `npm run vendor`):
//   ./ical.min.js          — ical.js 1.5.0 minified build (ES5)
//   ./zones-compiled.json  — IANA VTIMEZONE fallback DB (from ical-expander)
//
// Original: https://github.com/nicktindall/ical-expander (MIT)

var ICAL = require('./ical.min.js');
var timezones = require('./zones-compiled.json');

function IcalExpander(opts) {
  this.maxIterations = (opts.maxIterations != null) ? opts.maxIterations : 1000;

  this.jCalData = ICAL.parse(opts.ics);
  this.component = new ICAL.Component(this.jCalData);
  this.events = this.component.getAllSubcomponents('vevent').map(function (vevent) {
    return new ICAL.Event(vevent);
  });
}

IcalExpander.prototype.between = function (after, before) {
  var self = this;
  var exceptions = [];

  self.events.forEach(function (event) {
    if (event.isRecurrenceException()) exceptions.push(event);
  });

  var ret = { events: [], occurrences: [] };

  self.events.filter(function (e) {
    return !e.isRecurrenceException();
  }).forEach(function (event) {
    var exdates = [];

    event.component.getAllProperties('exdate').forEach(function (exdateProp) {
      var exdate = exdateProp.getFirstValue();
      exdates.push(exdate.toJSDate().getTime());
    });

    if (event.isRecurring()) {
      var iterator = event.iterator();
      var next;
      var i = 0;

      do {
        i += 1;
        next = iterator.next();
        if (next) {
          var occurrence = event.getOccurrenceDetails(next);

          var startTime = occurrence.startDate.toJSDate().getTime();
          var endTime = occurrence.endDate.toJSDate().getTime();
          var isOccurrenceExcluded = exdates.indexOf(startTime) !== -1;

          // Find a matching recurrence-exception (ES5: manual loop, no Array.find)
          var exception = null;
          for (var x = 0; x < exceptions.length; x++) {
            var ex = exceptions[x];
            if (ex.uid === event.uid &&
                ex.recurrenceId.toJSDate().getTime() === occurrence.startDate.toJSDate().getTime()) {
              exception = ex;
              break;
            }
          }

          // Past the window end: stop iterating this event
          if (before && startTime > before.getTime()) break;

          if ((!before || endTime <= before.getTime()) &&
              (!after || startTime >= after.getTime())) {
            if (exception) {
              ret.events.push(exception);
            } else if (!isOccurrenceExcluded) {
              ret.occurrences.push(occurrence);
            }
          }
        }
      } while (next && (!self.maxIterations || i < self.maxIterations));

      return;
    }

    // Non-recurring event
    var s = event.startDate.toJSDate().getTime();
    var e = event.endDate.toJSDate().getTime();
    if ((!before || e <= before.getTime()) &&
        (!after || s >= after.getTime())) {
      ret.events.push(event);
    }
  });

  return ret;
};

// Register the IANA fallback timezones so events that reference a TZID without
// an inline VTIMEZONE still resolve correctly (mainstream servers embed their
// own VTIMEZONE, in which case ical.js uses that and never consults this DB).
(function registerTimezones() {
  var keys = Object.keys(timezones);
  for (var k = 0; k < keys.length; k++) {
    var icsData = timezones[keys[k]];
    var parsed = ICAL.parse(
      'BEGIN:VCALENDAR\nPRODID:-//tzurl.org//NONSGML Olson 2012h//EN\nVERSION:2.0\n' +
      icsData + '\nEND:VCALENDAR'
    );
    var comp = new ICAL.Component(parsed);
    var vtimezone = comp.getFirstSubcomponent('vtimezone');
    ICAL.TimezoneService.register(vtimezone);
  }
})();

module.exports = IcalExpander;
