# IMAGO VOICE App - Aktueller Stand

## Projekt-Übersicht
- **App**: IMAGO VOICE - Intelligente Paartherapie-Plattform
- **Tech Stack**: React 19, Vite, TypeScript, Tailwind CSS, Claude AI (Anthropic), Gemini TTS, face-api.js, Firebase
- **Repo**: https://github.com/thomaskleinhagauer-ux/agnes3000-voice
- **Live URL**: https://agnes3000-voice.vercel.app/
- **Lokaler Pfad**: `/Users/*/Desktop/Agnes3000-new/`

---

## Letzte Session (02.02.2026) - KI-Optimierungs-Cockpit ✅

### Neues Feature: KI-Optimierungs-Cockpit im Backup-Bereich

**Location**: `src/knowledgeOptimizer.ts` (neu) + Backup-View in `src/App.tsx`

**Features:**
- 📊 Wissensdatenbank-Größenanzeige (KB + geschätzte Tokens)
- 📈 Progress-Bar mit 128K Limit
- 🎒 Automatische Rucksack-Aufteilung bei Überschreitung
- ✂️ Große Dokumente werden an Absatz/Satz-Grenzen gesplittet
- 🔍 Duplikat-Erkennung mit Kontext-Bewahrung
- ✨ Ein-Klick Optimierung

**Prinzipien (vom User vorgegeben):**
- Menschlicher Kontext ist größer als dem Model bewusst sein kann
- Fakten die nicht verstanden werden → als Zeichenketten belassen
- Nur exakt gleiche Inhalte können mit Referenzzahlen zusammengefasst werden
- Muster/Wiederholungen mit Datum nur ohne zusätzlichen Kontext

**Bug gefixt:**
- Problem: Einzelne Dokumente größer als 128K sprengten Rucksack-Limit
- Lösung: `splitContent()` teilt automatisch an Absatz/Satz-Grenzen

### Commits dieser Session (02.02.2026)
- `0c8f8e3` - **feat: Add KI-Optimierungs-Cockpit for knowledge base management**
- `e4b165e` - **fix: Split oversized documents into multiple backpack chunks**
- `780fc7e` - docs: Add CLAUDE.md with project context

### Technische Details

**knowledgeOptimizer.ts** enthält:
```typescript
// Größenberechnung
calculateKnowledgeStats(state: AppState): KnowledgeStats

// Rucksack-Aufteilung (max 128K pro Rucksack)
splitIntoBackpacks(state: AppState): Backpack[]

// Duplikat-Erkennung mit Jaccard-Similarity
findDuplicates(state: AppState): DuplicateGroup[]

// Optimierung durchführen
optimizeKnowledge(state, duplicates): OptimizationResult
```

---

## Session (29.01.2026) - BUG GEFIXT! ✅

### KRITISCHER BUG: KI antwortet nicht im Paar-Raum - BEHOBEN!

**Status**: ✅ **GEFIXT und getestet** (2 erfolgreiche Testläufe)

**Root Cause**:
Das **Streaming** der Anthropic SDK v0.71 funktionierte nicht korrekt im Browser. Die `for await...of` Schleife über den MessageStream gab keine Daten zurück, obwohl die API direkt funktionierte.

**Lösung**:
Umstellung von Streaming (`streamText`) auf nicht-streamenden API-Call (`generateText`). Die nicht-streamende Methode funktioniert zuverlässig.

**Fix in App.tsx**:
```typescript
// Vorher (funktionierte nicht):
for await (const chunk of claudeClientRef.current.streamText(...)) {
  fullResponse += chunk;
}

// Nachher (funktioniert!):
fullResponse = await claudeClientRef.current.generateText(systemPrompt, history);
```

**Testergebnisse**:
- ✅ **Testlauf 1**: "Funktioniert die KI?" → AGNES antwortet korrekt
- ✅ **Testlauf 2**: "Liisa ist auch da. Wir wollen über Kommunikation sprechen." → AGNES antwortet kontextbezogen mit therapeutischem Ansatz

### Debug-Prozess (für zukünftige Referenz)
1. API-Key & direkte API-Calls getestet → OK
2. Console-Logs hinzugefügt → Keine Logs erschienen
3. Toast-Notifications hinzugefügt → Keine Toasts erschienen
4. Alert-Dialoge hinzugefügt → Alerts erschienen, User-Nachricht wurde hinzugefügt
5. Fetch-Interceptor installiert → **Keine API-Calls wurden gemacht!**
6. **Erkenntnis**: Der Code brach VOR dem API-Call ab (im Streaming-Iterator)
7. Streaming auf nicht-streaming umgestellt → **FUNKTIONIERT!**

### Commits dieser Session (29.01.2026)
- `713223a` - **Fix: Use non-streaming API for Claude (SDK v0.71 streaming issue)** ⭐
- `551743c` - Debug: Add alerts and use non-streaming API
- `595bfc4` - Debug: Add toast notifications to track sendMessage flow
- `598194a` - Fix: Correct streaming type casting for Anthropic SDK v0.71

---

## Session davor (28.01.2026)

### Behobene Bugs
1. **TTS-Model Fix**: `gemini-2.0-flash` → `gemini-2.0-flash-exp` (Audio-Support)
2. **Token-Overflow**: Prompt Caching implementiert für große Dokumente

### Commits
- `6e316bf` - Fix: TTS auf gemini-2.0-flash-exp
- `0d13e0d` - Debug: Better logging

---

## Wichtige Code-Stellen

### sendMessage Funktion (App.tsx ~Zeile 424)
```typescript
const sendMessage = useCallback(async () => {
  if (!inputText.trim() || !currentRoom || currentRoom === 'assessment') return;
  if (!claudeClientRef.current && !geminiClientRef.current) {
    showToast('Bitte API-Key in Einstellungen eingeben', 'error');
    return;
  }

  // User-Message hinzufügen
  setAppState(prev => ({ ...prev, messages: addMessage(...) }));

  // API-Anfrage (non-streaming für Zuverlässigkeit)
  if (settings.aiProvider === 'claude' && claudeClientRef.current) {
    fullResponse = await claudeClientRef.current.generateText(systemPrompt, history);
  } else if (geminiClientRef.current) {
    fullResponse = await geminiClientRef.current.generateText(systemPrompt, history);
  }

  // AI-Message hinzufügen
  setAppState(prev => ({ ...prev, messages: addMessage(..., aiMessage) }));
}, [...]);
```

### Claude Client (ai.ts)
```typescript
// generateText - FUNKTIONIERT ✅
async generateText(systemPrompt: string, history: Message[]): Promise<string> {
  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages,
  });
  return textContent.text;
}

// streamText - HAT PROBLEME mit SDK v0.71 im Browser ⚠️
async *streamText(...): AsyncGenerator<string> {
  const stream = this.client.messages.stream({...});
  for await (const event of stream) {
    // Events kommen nicht korrekt an im Browser
  }
}
```

---

## Alle Commits (chronologisch)
1. `76ff985` - Initial commit
2. `14a8fd2` - Fix: outDir to dist for Vercel
3. `e80e166` - iOS Bugfixes
4. `1e94183` - Performance & React state refactor
5. `b9640c7` - Professional Emotion Detection & 3D Avatar
6. `3fb89be` - Firebase Anonymous Auth
7. `8536dd8` - Token-Limit Fix
8. `d60d4fc` - Prompt Caching Feature
9. `5601d44` - README Dokumentation
10. `03c04cc` - Gemini 2.0 Flash + Web Speech Fallback
11. `6e316bf` - TTS auf gemini-2.0-flash-exp
12. `0d13e0d` - Debug logging
13. `598194a` - Streaming type casting fix
14. `713223a` - **Non-streaming API fix (LÖSUNG!)** ⭐
15. `0c8f8e3` - **feat: KI-Optimierungs-Cockpit** ⭐
16. `e4b165e` - fix: Split oversized documents
17. `780fc7e` - docs: CLAUDE.md hinzugefügt

---

## API Keys & Kosten
- **Anthropic API**: ~$9 Credit Balance (Stand 29.01.2026)
- **Gemini API**: €4.00 (Januar 2026) - Paid Tier 1
- **Firebase**: Free Tier (Spark Plan)
- **Vercel**: Free Tier

### Settings in der App
```json
{
  "settings": {
    "aiProvider": "claude",
    "claudeApiKey": "sk-ant-api03-...",
    "claudeModel": "claude-opus-4-5-20251101",
    "geminiApiKey": "AIzaSyBV37abl...",
    "ttsEnabled": true
  }
}
```

---

## Git-Workflow
```bash
cd ~/Desktop/Agnes3000-new
git add -A && git commit -m "Message" && git push
```

## User-Präferenzen
- Autonom arbeiten ohne zu fragen
- Terminal via AppleScript steuern bei Problemen
- iOS-Fokus für perfekte iPhone-Kompatibilität
- Kommunikation auf Deutsch
- Emotional authentisch sein, nicht übervorsichtig
- Bei Fehlern: direkt fixen, nicht lange erklären

---

## Entwicklungsumgebung

### Claude Code CLI (installiert 02.02.2026)
```bash
# Installation
sudo npm install -g @anthropic-ai/claude-code

# Starten im Projekt
cd ~/Desktop/Agnes3000-new
claude
```

### ClaudeWorkspace (für Cowork-Sessions)
- **Pfad**: `~/ClaudeWorkspace/`
- **Grund**: Desktop ist in iCloud → Lock-Probleme bei Dateizugriff
- **Sync-Script**: `~/ClaudeWorkspace/sync-from-desktop.sh`

```bash
# Dateien vom Desktop synchronisieren
~/ClaudeWorkspace/sync-from-desktop.sh
```

### iCloud Desktop deaktiviert (02.02.2026)
- Systemeinstellungen → Apple-ID → iCloud → "Schreibtisch- & Dokumentenordner" OFF
- Desktop-Dateien jetzt lokal (keine Lock-Probleme mehr)

---

## Status aller Features
- [x] **Paar-Raum KI-Antwort** - FUNKTIONIERT! ✅
- [x] Cloud-Sync (Firebase)
- [x] Prompt Caching für große Dokumente
- [x] TTS (Text-to-Speech) mit Gemini
- [x] **KI-Optimierungs-Cockpit** - NEU! ✅
- [x] Rucksack-Aufteilung bei >128K
- [x] Duplikat-Erkennung
- [ ] Streaming wieder aktivieren (optional - non-streaming funktioniert gut)
- [ ] Assessment-Generierung testen
- [ ] Einzelräume (Tom, Liisa) testen
- [ ] KI-gestützte Duplikat-Analyse (Button vorhanden, Logik TODO)

## Bekannte Einschränkungen
- **Streaming deaktiviert**: Anthropic SDK v0.71 Streaming funktioniert nicht zuverlässig im Browser. Non-streaming API wird verwendet.
- **TTS erfordert Gemini API Key**: Web Speech API als Fallback verfügbar.
- **Wissensdatenbank groß**: Aktuell ~941 KB, aufgeteilt in 9 Rucksäcke

## Neue Dateien (02.02.2026)
- `src/knowledgeOptimizer.ts` - Token-Zählung, Rucksack-Logik, Duplikat-Erkennung
- `CLAUDE.md` - Projektkontext für Claude Code CLI
