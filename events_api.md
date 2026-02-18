# 📅 DokuMe API – Termine abrufen

Diese Dokumentation beschreibt, wie Termine (Events) über die öffentliche API abgerufen werden können.

---

## 🔐 Authentifizierung

Für alle API-Calls müssen folgende HTTP-Header übergeben werden:

| Header               | Beschreibung                     |
| -------------------- | -------------------------------- |
| `X-DOKUME-API-KEY`   | A7ucSKkYGOJUdGDnprCCnuAsd5UxwkaeeDimRhbj8A1eRENf8Mfk0nKskAf3v6ly |
| `X-DOKUME-PROFILEID` | 46093        |

---

## 📥 Termine abrufen

Die Schnittstelle ermöglicht das Abrufen von Terminen in einem bestimmten Zeitbereich.

**HTTP-Methode:** `GET`  
**URL:** `https://api.dokume.net/public.php/calendar/myevents/{START_DATE}/{END_DATE}`

### 📝 Parameter

#### URL-Parameter

| Parameter    | Format             | Beschreibung                                  |
| ------------ | ------------------ | --------------------------------------------- |
| `START_DATE` | `YYYY-MM-DD HH:mm` | Startzeitpunkt des gewünschten Zeitraums      |
| `END_DATE`   | `YYYY-MM-DD HH:mm` | Endzeitpunkt des gewünschten Zeitraums        |

> ⚠️ Die Datumsangaben müssen URL-kodiert werden (z. B. Leerzeichen als `%20`).

#### Query-Parameter (Optional)

| Parameter    | Typ       | Beschreibung                                                                 |
| ------------ | --------- | ---------------------------------------------------------------------------- |
| `shared`     | `boolean` | Setze auf `true` für öffentlichen Zugriff (ohne User-Session).               |
| `references` | `json`    | Fordert zusätzliche verknüpfte Daten an (z. B. `USERINTERFACE` für Details). |

### 📄 Beispiel-Request

Um Termine vom 01.01.2026 bis zum 28.02.2026 abzurufen und Details zur Benutzeroberfläche (`USERINTERFACE`) einzuschließen:

**URL (unkodiert):**
`https://api.dokume.net/public.php/calendar/myevents/2026-01-01 00:00/2026-02-28 23:59?shared=true&references=[{"OBJECT":"USERINTERFACE"}]`

**cURL-Aufruf:**

```bash
curl -X GET "https://api.dokume.net/public.php/calendar/myevents/2026-01-01%2000%3A00/2026-02-28%2023%3A59?shared=true&references=%5B%7B%22OBJECT%22%3A%22USERINTERFACE%22%7D%5D" \
  -H "X-DOKUME-API-KEY: A7ucSKkYGOJUdGDnprCCnuAsd5UxwkaeeDimRhbj8A1eRENf8Mfk0nKskAf3v6ly" \
  -H "X-DOKUME-PROFILEID: 46093"
```

---

## ✅ Beispielantwort

Die API liefert eine Liste der gefundenen Termine zurück.

```json
{
  "SUCCESS": true,
  "MESSAGE": [
    {
      "ID": "575719",
      "USERINTERFACE_ID": {
        "ID": "46093",
        "NAME": "NWDK Veranstaltungen",
        "PROFILE_DESCRIPTION": null,
        "CATEGORY": null,
        "ISGROUP": "1"
      },
      "CREATOR_ID": "2",
      "TITLE": "[VORLAGE] Prüfung zum 1. Kyu",
      "LOCATION": "Köln",
      "COLOR": "#e35138",
      "LATITUDE": null,
      "LONGITUDE": null,
      "COUNTRY_SHORT": null,
      "COUNTRY_LONG": null,
      "URL": null,
      "REMINDER": null,
      "ALLDAY": "0",
      "PRIVATE": "0",
      "MAX_PARTICIPANTS": null,
      "CONNECTED_ID": null,
      "NOTE": "",
      "RECURRING_PLAN": null,
      "STARTDATE": "2026-01-10 11:02:00",
      "ENDDATE": "2026-01-10 12:02:00",
      "CREATIONDATE": "2026-01-09 12:02:27",
      "LAST_CHANGE_DATE": null,
      "COURSE_ID": null,
      "CALENDAR_PRICES": [],
      "CURRENT_PARTICIPANTS": 0,
      "PART_RESULT": [],
      "STATUS_COUNTER": []
    },
    {
      "ID": "567949",
      "USERINTERFACE_ID": {
        "ID": "46093",
        "NAME": "NWDK Veranstaltungen",
        "PROFILE_DESCRIPTION": null,
        "CATEGORY": null,
        "ISGROUP": "1"
      },
      "CREATOR_ID": "46092",
      "TITLE": "Vorbereitungslehrgang Kata-Meisterschaft 2026 NRW Test",
      "LOCATION": "NWJV LLStp. Witten ",
      "COLOR": "#e35138",
      "LATITUDE": null,
      "LONGITUDE": null,
      "COUNTRY_SHORT": null,
      "COUNTRY_LONG": null,
      "URL": null,
      "REMINDER": null,
      "ALLDAY": "0",
      "PRIVATE": "0",
      "MAX_PARTICIPANTS": null,
      "CONNECTED_ID": null,
      "NOTE": "<p>Ausrichter:</p><p>NWDK</p>...",
      "RECURRING_PLAN": null,
      "STARTDATE": "2026-01-17 10:00:00",
      "ENDDATE": "2026-01-17 11:00:00",
      "CREATIONDATE": "2025-11-12 15:40:22",
      "LAST_CHANGE_DATE": null,
      "COURSE_ID": null,
      "CALENDAR_PRICES": [],
      "CURRENT_PARTICIPANTS": 0,
      "PART_RESULT": [],
      "STATUS_COUNTER": []
    }
  ]
}
```

> ℹ️ Das Feld `USERINTERFACE` ist nur enthalten, wenn im Request der `references`-Parameter entsprechend gesetzt wurde.

---

## 🔍 Einzelnen Termin abrufen

Um Details zu einem spezifischen Termin abzurufen, wird die ID des Termins benötigt.

**HTTP-Methode:** `GET`  
**URL:** `https://api.dokume.net/public.php/object/67/{EVENT_ID}`

### 📝 Parameter

#### URL-Parameter

| Parameter  | Typ      | Beschreibung                   |
| ---------- | -------- | ------------------------------ |
| `EVENT_ID` | `number` | Die ID des abzurufenden Events |

#### Query-Parameter (Optional)

| Parameter    | Typ    | Beschreibung                                                          |
| ------------ | ------ | --------------------------------------------------------------------- |
| `references` | `json` | Fordert verknüpfte Objekte an (z. B. `CALENDAR` für Basisinfos).      |

### 📄 Beispiel-Request

Abruf des Events mit ID `3062` inklusive der grundlegenden Kalenderdaten (`CALENDAR`).

**URL (unkodiert):**
`https://api.dokume.net/public.php/object/67/3062?references=[{"OBJECT":"CALENDAR"},{"OBJECT":"FILES"}]`

**cURL-Aufruf:**

```bash
curl -X GET "https://api.dokume.net/public.php/object/67/3062?references=%5B%7B%22OBJECT%22%3A%22CALENDAR%22%7D%2C%7B%22OBJECT%22%3A%22FILES%22%7D%5D" \
  -H "X-DOKUME-API-KEY: A7ucSKkYGOJUdGDnprCCnuAsd5UxwkaeeDimRhbj8A1eRENf8Mfk0nKskAf3v6ly" \
  -H "X-DOKUME-PROFILEID: 46093"
```

### ✅ Beispielantwort

```json
{
  "SUCCESS": true,
  "MESSAGE": {
    "ID": "3062",
    "USERINTERFACE_ID": "46093",
    "LATITUDE": "",
    "LONGITUDE": "",
    "LANGUAGE": "DE",
    "PUBLIC": null,
    "SALUTATION_TYPE": null,
    "PAYMENT_BY_INVOICE": null,
    "TERMS": "",
    "DATA_POLICY": "",
    "LINK": "",
    "PRE_ACCREDITATION": null,
    "CLOSING_DATE": null,
    "CALENDAR_ID": {
      "ID": "575721",
      "USERINTERFACE_ID": "46093",
      "CREATOR_ID": "2",
      "TITLE": "[VORLAGE] Danprüfung",
      "LOCATION": "",
      "COLOR": "#e35138",
      "LATITUDE": null,
      "LONGITUDE": null,
      "COUNTRY_SHORT": null,
      "COUNTRY_LONG": null,
      "URL": null,
      "REMINDER": null,
      "ALLDAY": "0",
      "PRIVATE": "0",
      "MAX_PARTICIPANTS": null,
      "CONNECTED_ID": null,
      "NOTE": "",
      "RECURRING_PLAN": null,
      "STARTDATE": "2026-01-10 11:02:00",
      "ENDDATE": "2026-01-10 12:02:00",
      "CREATIONDATE": "2026-01-09 12:10:24",
      "LAST_CHANGE_DATE": null,
      "COURSE_ID": null
    },
    "API_USER_ID": "40051",
    "BANNER_IMAGE_ID": {
      "SUCCESS": false,
      "MESSAGE": "Right missing not creator",
      "OBJECT_ID": "22",
      "ID": "910893",
      "PROFILE_ID": "46093",
      "WHERE": [
        {
          "key": "CREATOR_ID",
          "value": "154794",
          "operator": "is"
        }
      ]
    },
    "LOGO_FILE_ID": null
  }
}
```

> ℹ️ Das `CALENDAR_ID`-Objekt enthält die wichtigsten Termin-Stammdaten (Titel, Zeit, Ort). Die Felder auf der Hauptebene (`MESSAGE`) enthalten zusätzliche Einstellungen wie Datenschutz, Sprache und Veröffentlichungsstatus.

