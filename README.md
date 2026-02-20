# NWDK-Kalender

Veranstaltungstermine aus DokuMe auf der eigenen Website anzeigen.

## CSV-Export

Alle über die API abrufbaren Termindaten als CSV exportieren:

```bash
python3 export_events.py
```

Optionen:

```bash
python3 export_events.py -o meine_termine.csv
python3 export_events.py --start "2026-06-01 00:00" --end "2026-08-31 23:59"
```

Die Datei `events_export.csv` wird im Projektordner erstellt.
