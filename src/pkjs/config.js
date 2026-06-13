module.exports = [
  {
    "type": "heading",
    "defaultValue": "CalDAV Calendar"
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Calendar Sources"
      },
      {
        "type": "text",
        "defaultValue": "Enter up to 4 public ICS feed URLs. All calendars are merged into a single view. Most CalDAV servers expose a public export link ending in ?export or .ics."
      },
      {
        "type": "input",
        "messageKey": "ICAL_URL_1",
        "label": "Calendar URL 1",
        "attributes": {
          "placeholder": "https://example.com/calendar.ics",
          "type": "url"
        }
      },
      {
        "type": "input",
        "messageKey": "ICAL_URL_2",
        "label": "Calendar URL 2 (optional)",
        "attributes": {
          "placeholder": "https://example.com/calendar.ics",
          "type": "url"
        }
      },
      {
        "type": "input",
        "messageKey": "ICAL_URL_3",
        "label": "Calendar URL 3 (optional)",
        "attributes": {
          "placeholder": "https://example.com/calendar.ics",
          "type": "url"
        }
      },
      {
        "type": "input",
        "messageKey": "ICAL_URL_4",
        "label": "Calendar URL 4 (optional)",
        "attributes": {
          "placeholder": "https://example.com/calendar.ics",
          "type": "url"
        }
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Display"
      },
      {
        "type": "select",
        "messageKey": "ICAL_DAYS",
        "defaultValue": "7",
        "label": "Days to show",
        "options": [
          { "label": "3 days",  "value": "3"  },
          { "label": "5 days",  "value": "5"  },
          { "label": "7 days",  "value": "7"  },
          { "label": "14 days", "value": "14" },
          { "label": "30 days", "value": "30" }
        ]
      },
      {
        "type": "select",
        "messageKey": "TIME_FORMAT",
        "defaultValue": "12h",
        "label": "Time format",
        "options": [
          { "label": "12 hour (AM/PM)", "value": "12h" },
          { "label": "24 hour",         "value": "24h" }
        ]
      }
    ]
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Sync"
      },
      {
        "type": "select",
        "messageKey": "ICAL_SYNC_INTERVAL",
        "defaultValue": "60",
        "label": "Sync interval",
        "options": [
          { "label": "30 minutes", "value": "30"  },
          { "label": "1 hour",     "value": "60"  },
          { "label": "2 hours",    "value": "120" },
          { "label": "6 hours",    "value": "360" }
        ]
      }
    ]
  },
  {
    "type": "submit",
    "defaultValue": "Save"
  }
];
