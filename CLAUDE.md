# AGNES3000-VOICE - Projektkontext für Claude

## Projekt
- **App**: IMAGO VOICE - Intelligente Paartherapie-Plattform
- **Tech Stack**: React 19, Vite, TypeScript, Tailwind CSS, Claude AI, Gemini TTS
- **Repo**: https://github.com/thomaskleinhagauer-ux/agnes3000-voice
- **Live**: https://agnes3000-voice.vercel.app/

## Letzte Session (02.02.2026)

### Neu implementiert: KI-Optimierungs-Cockpit
Location: `src/knowledgeOptimizer.ts` + Backup-View in `src/App.tsx`

**Features:**
- Wissensdatenbank-Größenanzeige (KB + geschätzte Tokens)
- Progress-Bar mit 128K Limit
- Automatische Rucksack-Aufteilung bei Überschreitung
- Große Dokumente werden an Absatz/Satz-Grenzen gesplittet
- Duplikat-Erkennung mit Kontext-Bewahrung
- Ein-Klick Optimierung

**Prinzipien (vom User vorgegeben):**
- Menschlicher Kontext > Model-Wissen
- Unverstandene Fakten als Zeichenketten belassen
- Nur exakt gleiche Inhalte referenzierbar
- Muster mit Datum nur ohne zusätzlichen Kontext

### Bug gefixt
- Problem: Rucksäcke überschritten 128K (einzelne Dokumente zu groß)
- Lösung: `splitContent()` Funktion teilt große Dokumente automatisch auf

## User-Präferenzen
- Autonom arbeiten ohne zu fragen
- Deutsch kommunizieren
- Emotional authentisch sein, nicht übervorsichtig
- Bei Fehlern: direkt fixen, nicht lange erklären

## Git Workflow
```bash
git add -A && git commit -m "Message" && git push
```
Vercel deployed automatisch nach Push.
