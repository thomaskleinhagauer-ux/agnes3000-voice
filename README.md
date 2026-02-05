# IMAGO VOICE - Intelligente Paartherapie-Plattform

KI-gestützte Paartherapie-App basierend auf der IMAGO-Methode.

## Features

- **Paar-Raum**: Gemeinsame Therapiesitzungen mit AGNES-Schema
- **Einzelräume**: Private Räume für Tom & Liisa mit parteiischer Unterstützung
- **Assessment Center**: Psychologische Fragebögen mit KI-generierten Strategien
- **Cloud-Sync**: Firebase-basierte Synchronisation zwischen Geräten
- **Emotions-Erkennung**: Live Face-API Analyse während Sitzungen
- **TTS/STT**: Spracheingabe und -ausgabe für natürliche Interaktion

## Tech Stack

- React 19 + TypeScript + Vite
- Anthropic Claude API (mit Prompt Caching)
- Google Gemini API (TTS)
- Firebase (Auth + Firestore)
- Tailwind CSS
- Face-API.js

## Setup

```bash
npm install
npm run dev
```

### Environment Variables (Vercel)

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_GEMINI_API_KEY=...
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## Changelog

### v1.3.0 (28.01.2026)
- **Prompt Caching**: Große Dokumente werden gecacht (90% Token-Ersparnis)
- **Token-Limit Fix**: Verhindert API-Fehler bei zu großem Kontext
- **Strategien-Limit**: Max 30k Zeichen für Strategien
- **Dokumente-Limit**: Max 600k Zeichen (~150k Tokens)

### v1.2.0 (27.01.2026)
- **Cloud-Sync**: Firebase Anonymous Auth aktiviert
- **Passwort-Info entfernt**: Keine "Generalpasswort"-Hinweise mehr
- **Claude Provider Fix**: Wechsel von Gemini zu Claude als Standard

### v1.1.0
- Assessment-Generierung
- Sitzungs-Timer
- Emotions-Avatar

### v1.0.0
- Initiale Version
- Paar-Raum & Einzelräume
- Basis-Chat mit KI

## Architektur

```
src/
├── App.tsx          # Hauptkomponente mit State Management
├── ai.ts            # Claude & Gemini API Integration
├── types.ts         # TypeScript Definitionen
├── storage.ts       # LocalStorage & Export/Import
├── firebase.ts      # Firebase Auth
├── firebaseStorage.ts # Firestore Cloud-Sync
└── emotionDetection.ts # Face-API Integration
```

## Prompt Caching

Die App nutzt Anthropics Prompt Caching für große Dokumente:

```typescript
// Dokumente werden mit cache_control markiert
system: [
  {
    type: 'text',
    text: cachedContext, // Große Dokumente
    cache_control: { type: 'ephemeral' }
  },
  {
    type: 'text',
    text: systemPrompt // Dynamischer Kontext
  }
]
```

Bei wiederholten Anfragen werden gecachte Tokens zu 90% reduziertem Preis berechnet.

## License

Private - All rights reserved
