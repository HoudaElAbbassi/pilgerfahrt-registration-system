# Pilgerfahrt Registration System

Online-Anmeldesystem für Pilgerfahrten – serverless mit Netlify Functions und PostgreSQL-Datenbank.

## Features

- Anmeldeformular mit Validierung (Name, Reisepass, Kontaktdaten)
- Serverlose Backend-Funktionen via Netlify Functions
- PostgreSQL-Datenbank (Neon) zur Speicherung der Anmeldungen
- Admin-Panel zur Verwaltung und Übersicht aller Anmeldungen
- Deployed auf Netlify

## Tech Stack

| Layer | Technologie |
|-------|------------|
| Frontend | HTML, CSS, JavaScript |
| Backend | Netlify Functions (Node.js) |
| Datenbank | PostgreSQL (Neon) |
| Deployment | Netlify |

## Installation

```bash
npm install
netlify dev
```

## Deployment

```bash
netlify deploy --prod
```
