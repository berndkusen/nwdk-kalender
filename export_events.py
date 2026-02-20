#!/usr/bin/env python3
"""
Exportiert DokuMe Veranstaltungstermine als CSV über die öffentliche API.
Verwendung: python3 export_events.py [--output events.csv]
"""

import argparse
import csv
import json
import re
import sys
from html import unescape
from urllib.request import Request, urlopen

API_KEY = "A7ucSKkYGOJUdGDnprCCnuAsd5UxwkaeeDimRhbj8A1eRENf8Mfk0nKskAf3v6ly"
PROFILE_ID = "46093"
BASE_URL = "https://api.dokume.net/public.php/calendar/myevents"


def strip_html(text: str, max_length: int = 500) -> str:
    """Entfernt HTML-Tags und dekodiert Entities."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", unescape(text)).strip()
    return text[:max_length] if len(text) > max_length else text


def fetch_events(start_date: str, end_date: str) -> list[dict]:
    """Lädt Termine von der DokuMe API."""
    url = f"{BASE_URL}/{start_date}/{end_date}?shared=true&references=%5B%7B%22OBJECT%22%3A%22USERINTERFACE%22%7D%5D"
    req = Request(url, headers={
        "X-DOKUME-API-KEY": API_KEY,
        "X-DOKUME-PROFILEID": PROFILE_ID,
    })
    with urlopen(req) as resp:
        data = json.loads(resp.read().decode())
    if not data.get("SUCCESS"):
        raise RuntimeError(f"API-Fehler: {data.get('MESSAGE', 'Unbekannt')}")
    return data.get("MESSAGE", [])


def deduplicate_events(events: list[dict]) -> list[dict]:
    """Entfernt doppelte Einträge (myevents kann Duplikate liefern)."""
    seen = set()
    unique = []
    for e in events:
        key = (e.get("ID"), e.get("STARTDATE"), e.get("TITLE"))
        if key not in seen:
            seen.add(key)
            unique.append(e)
    return unique


def events_to_rows(events: list[dict]) -> list[dict]:
    """Wandelt API-Events in flache CSV-Zeilen um."""
    rows = []
    for e in events:
        ui = e.get("USERINTERFACE_ID") or {}
        if isinstance(ui, dict):
            ui_name = ui.get("NAME", "")
        else:
            ui_name = str(ui)
        rows.append({
            "ID": e.get("ID", ""),
            "TITLE": e.get("TITLE", ""),
            "LOCATION": e.get("LOCATION", ""),
            "STARTDATE": e.get("STARTDATE", ""),
            "ENDDATE": e.get("ENDDATE", ""),
            "COLOR": e.get("COLOR", ""),
            "ALLDAY": e.get("ALLDAY", ""),
            "PRIVATE": e.get("PRIVATE", ""),
            "CREATIONDATE": e.get("CREATIONDATE", ""),
            "CREATOR_ID": e.get("CREATOR_ID", ""),
            "COURSE_ID": e.get("COURSE_ID", ""),
            "CONNECTED_ID": e.get("CONNECTED_ID", ""),
            "USERINTERFACE_NAME": ui_name,
            "NOTE": strip_html(e.get("NOTE", "")),
        })
    return rows


def main():
    parser = argparse.ArgumentParser(description="DokuMe Termine als CSV exportieren")
    parser.add_argument(
        "-o", "--output",
        default="events_export.csv",
        help="Ausgabedatei (Standard: events_export.csv)",
    )
    parser.add_argument(
        "--start",
        default="2026-01-01 00:00",
        help="Startdatum (Format: YYYY-MM-DD HH:mm)",
    )
    parser.add_argument(
        "--end",
        default="2026-12-31 23:59",
        help="Enddatum (Format: YYYY-MM-DD HH:mm)",
    )
    args = parser.parse_args()

    start_encoded = args.start.replace(" ", "%20").replace(":", "%3A")
    end_encoded = args.end.replace(" ", "%20").replace(":", "%3A")

    try:
        events = fetch_events(start_encoded, end_encoded)
    except Exception as err:
        print(f"Fehler beim Abruf: {err}", file=sys.stderr)
        sys.exit(1)

    unique = deduplicate_events(events)
    rows = events_to_rows(unique)

    if not rows:
        print("Keine Termine gefunden.", file=sys.stderr)
        sys.exit(0)

    fieldnames = list(rows[0].keys())
    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"{len(rows)} Termine nach {args.output} exportiert.")


if __name__ == "__main__":
    main()
