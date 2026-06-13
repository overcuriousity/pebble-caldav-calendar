module.exports = [
  {
    "type": "heading",
    "defaultValue": "Calendar Settings"
  },
  {
    "type": "section",
    "items": [
      {
        "type": "heading",
        "defaultValue": "Data Source"
      },
      {
        "type": "text",
        "defaultValue": "Nextcloud: open Calendar → edit your calendar → 'Link teilen' → copy the link ending in ?export. Example: .../remote.php/dav/public-calendars/TOKEN?export"
      },
      {
        "type": "input",
        "messageKey": "ICAL_URL",
        "label": "Nextcloud / CalDAV ICS URL",
        "attributes": {
          "placeholder": "https://cloud.example.com/remote.php/dav/public-calendars/TOKEN?export",
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
        "defaultValue": "Preferences"
      },
      {
        "type": "select",
        "messageKey": "TIME_FORMAT",
        "defaultValue": "12h",
        "label": "Time Format",
        "options": [
          { "label": "12 Hour (AM/PM)", "value": "12h" },
          { "label": "24 Hour", "value": "24h" }
        ]
      }
    ]
  },
  {
    "type": "submit",
    "defaultValue": "Save Settings"
  }
];
