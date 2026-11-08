# Google Timeline formats

The importer normalizes three entry kinds from either a raw array or a `{ timelineObjects }` / `{ semanticSegments }` wrapper.

## Visits

```json
{
  "startTime": "2026-07-26T14:33:25.880+02:00",
  "endTime": "2026-07-26T15:10:00.000+02:00",
  "visit": {
    "topCandidate": {
      "semanticType": "HOME | WORK | UNKNOWN",
      "placeID": "...",
      "placeLocation": "geo:50.08,14.43"
    }
  }
}
```

- `placeLocation`, `location.coordinates` (`[lat, lon]`) and the older `latitudeE7` / `longitudeE7` are supported.
- `semanticType: HOME` maps to the configured home location or `Doma`.
- Older `placeVisit` entries are supported, including `duration.startTimestamp` and `location.name`.

## Activities

```json
{
  "startTime": "...",
  "endTime": "...",
  "activity": {
    "start": "geo:...",
    "end": "geo:...",
    "topCandidate": { "type": "WALKING" }
  }
}
```

Activities provide start/end coordinates but no place name. The nearest endpoint to the photo time is used, then reverse-geocoded.

## Timeline paths

```json
{
  "startTime": "...",
  "endTime": "...",
  "timelinePath": [
    { "point": "50.08, 14.43", "durationMinutesOffsetFromStartTime": "0" }
  ]
}
```

Paths are stored as time-stamped points; the closest point to the photo time is used.

## Matching

- Entries are sorted by start time and looked up with binary search.
- A 2-hour tolerance is applied around each visit/activity/path interval.
- The best candidate is the smallest time distance, then the shortest duration.
- Visits take priority for names; activities and paths supply coordinates only.
