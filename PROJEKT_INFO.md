# Shipping Management System - Projektübersicht

## Projektbeschreibung
Ein Versandverwaltungssystem, das die UPS-API integriert, um Versanddienstleistungen zu verwalten und zu automatisieren.

## Technologie-Stack
- **Backend**: Node.js mit Express.js
- **Datenbank**: SQLite
- **API-Integration**: UPS Shipping API
- **Zusätzliche Python-Komponente**: Für UPS-Rate-Berechnungen

## Hauptkomponenten

### 1. Server (src/server.js)
- Express.js Server-Setup
- API-Routen-Management
- Datenbank-Initialisierung
- OAuth-Service-Integration

### 2. Verzeichnisstruktur
```
├── src/
│   ├── services/
│   ├── routes/
│   ├── controllers/
│   └── server.js
├── app.py
└── package.json
```

### 3. Hauptfunktionalitäten
- OAuth-Authentifizierung
- Sendungsverwaltung
- Dokumenten-Upload
- UPS-Ratenberechnung (Python)

### 4. API-Endpunkte
- `/auth` - Authentifizierungsrouten
- `/api/shipments` - Sendungsverwaltung
- `/api/documents` - Dokumentenverwaltung

### 5. Abhängigkeiten
Wichtige NPM-Pakete:
- express
- dotenv
- mysql2
- sqlite3
- node-fetch
- date-fns-tz
- luxon
- uuid

### 6. Umgebungsvariablen
Die Anwendung verwendet eine `.env`-Datei für Konfigurationseinstellungen.

### 7. UPS-Integration
- Rate-Berechnung über UPS API
- Authentifizierung via Bearer Token
- Unterstützung für internationale Sendungen

## Entwicklung
- Entwicklungsserver: `npm run dev`
- Produktionsstart: `npm start`

## Sicherheit
- OAuth 2.0 Implementierung
- Sichere Token-Verwaltung
- Umgebungsvariablen für sensible Daten

## Datenbank
- SQLite als primäre Datenbank
- Automatische Tabelleninitialisierung
- Benutzer- und Sendungsverwaltung 