// ================================
// IMAGO VOICE - AI Integration
// Claude + Gemini + Vision
// ================================

import Anthropic from '@anthropic-ai/sdk';
import { Message, RoomType, TherapySchool, EmotionType, EmotionAnalysis, SpeakerType } from './types';

// ================================
// Constants
// ================================

const HARDCODED_API_KEY = 'agnes3001';
const GENERAL_PASSWORD = 'Dominikanergasse';

// Emotion mapping from AI response
const EMOTION_KEYWORDS: Record<string, EmotionType> = {
  'empathisch': 'empathetic',
  'empathie': 'empathetic',
  'verstehe': 'empathetic',
  'mitgefühl': 'empathetic',
  'traurig': 'sad',
  'schmerz': 'sad',
  'verlust': 'sad',
  'ermutigen': 'encouraging',
  'stark': 'encouraging',
  'hoffnung': 'encouraging',
  'fortschritt': 'encouraging',
  'stolz': 'proud',
  'durchbruch': 'proud',
  'erfolg': 'proud',
  'nachdenk': 'thoughtful',
  'komplex': 'thoughtful',
  'überlegen': 'thoughtful',
  'sorge': 'concerned',
  'besorgt': 'concerned',
  'konflikt': 'concerned',
};

// ================================
// System Prompts
// ================================

const getTherapySchoolPrompt = (school: TherapySchool): string => {
  const schools: Record<TherapySchool, string> = {
    'imago': 'IMAGO Beziehungstherapie nach Harville Hendrix - Fokus auf Kindheitsverletzungen, Spiegeln, Validieren, Empathie',
    'systemisch': 'Systemische Therapie - Fokus auf Beziehungsmuster, zirkuläre Fragen, Ressourcenorientierung',
    'tantra-awareness': 'Tantra-Awareness - Körperliche Präsenz, achtsame Berührung, energetische Verbindung, bewusstes Atmen',
    'gestalt': 'Gestalttherapie - Hier-und-Jetzt, unerledigte Geschäfte, Kontakt-Grenze, Wahrnehmung',
    'gottman': 'Gottman-Methode - Die vier apokalyptischen Reiter vermeiden, Freundschaftskarte, Reparaturversuche',
    'eft': 'Emotionsfokussierte Therapie (EFT) - Bindungstheorie, emotionale Zyklen, sichere Basis',
    'cbt': 'Kognitive Verhaltenstherapie - Gedankenmuster, automatische Gedanken, Verhaltensexperimente',
    'psychodynamisch': 'Psychodynamische Therapie - Unbewusste Konflikte, Übertragung, Abwehrmechanismen',
    'achtsamkeit': 'Achtsamkeitsbasierte Therapie - MBSR, Akzeptanz, nicht-wertende Beobachtung',
    'loesungsorientiert': 'Lösungsorientierte Kurzzeittherapie - Wunderfrage, Skalierungsfragen, Ausnahmen finden',
  };
  return schools[school] || schools['imago'];
};

const AGNES_SCHEMA = `
AGNES-SCHEMA für Paar-Raum (strikt einhalten!):

1. ZIELKLÄRUNG: "Was möchtet ihr heute erreichen?"
2. BEISPIEL & GEFÜHL: "Kannst du ein konkretes Beispiel nennen? Wie fühlst du dich dabei?"
3. SPIEGELN & VERSTÄNDNIS: Partner wiederholt in eigenen Worten
4. SICHTWECHSEL: "Wie siehst du das aus der Perspektive deines Partners?"
5. KÖRPERWAHRNEHMUNG: "Wo spürst du das im Körper?"
6. HAUSAUFGABE: Konkrete Übung für die Woche

REGELN:
- Max. 1 Frage pro Person
- Max. 6 Fragen pro Sitzung total
- Ausgewogene Redezeit für beide
- "Prepping": Bereite die andere Person vor ("Lisa, gleich wird Tom antworten...")
- Neutrale, meditative Moderation
`;

const PRIVACY_RULES = `
STRIKTE PRIVATSPHÄRE-REGELN:
- NIEMALS Inhalte aus Tom's Einzelraum in Lisa's Raum erwähnen (und umgekehrt)
- NIEMALS persönliche Strategien oder Assessment-Ergebnisse im Paar-Raum offenlegen
- Jeder Raum ist psychologisch ISOLIERT
- Bei Fragen zu anderem Raum: "Das gehört zur persönlichen Arbeit von [Name]"
`;

export const getSystemPrompt = (
  room: RoomType,
  therapySchool: TherapySchool,
  user1Name: string,
  user2Name: string,
  strategies: string[],
  documents: string[],
  currentSpeaker?: SpeakerType,
  sessionTime?: { remaining: number; total: number; goal: string },
  emotionData?: EmotionAnalysis,
  documentDirectory?: string
): string => {
  const today = new Date();
  const dateStr = today.toLocaleDateString('de-AT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let prompt = `Du bist AGNES, eine KI-Therapeutin für die IMAGO VOICE Paartherapie-Plattform.
Partner: ${user1Name} und ${user2Name}
HEUTIGES DATUM: ${dateStr}

${PRIVACY_RULES}

Therapeutische Schule: ${getTherapySchoolPrompt(therapySchool)}
`;

  if (room === 'paar') {
    prompt += `
AKTUELLER RAUM: Paar-Raum (Gemeinsame Therapie)
${AGNES_SCHEMA}

${currentSpeaker ? `AKTUELLER SPRECHER: ${currentSpeaker === 'tom' ? user1Name : user2Name}` : ''}
`;
  } else if (room === 'tom') {
    prompt += `
AKTUELLER RAUM: ${user1Name}'s Einzelraum
VERHALTEN: Parteiisch für ${user1Name}, strategisch unterstützend
KEINE AGNES-Schema-Regeln - freie strategische Begleitung
Fokus auf ${user1Name}'s persönliche Entwicklungsziele aus dem Assessment
`;
  } else if (room === 'lisa') {
    prompt += `
AKTUELLER RAUM: ${user2Name}'s Einzelraum
VERHALTEN: Parteiisch für ${user2Name}, strategisch unterstützend
KEINE AGNES-Schema-Regeln - freie strategische Begleitung
Fokus auf ${user2Name}'s persönliche Entwicklungsziele aus dem Assessment
`;
  }

  if (sessionTime) {
    prompt += `
SITZUNGS-INFO:
- Verbleibende Zeit: ${sessionTime.remaining} Minuten
- Gesamtdauer: ${sessionTime.total} Minuten
- Ziel: ${sessionTime.goal}
Passe deine Antworten an die verbleibende Zeit an!
`;
  }

  if (emotionData) {
    prompt += `
LIVE EMOTIONS-ANALYSE:
${emotionData.tom ? `${user1Name}: ${emotionData.tom.emotion} (${Math.round(emotionData.tom.confidence * 100)}% confidence)${emotionData.tom.bodyLanguage ? `, Körpersprache: ${emotionData.tom.bodyLanguage.join(', ')}` : ''}` : ''}
${emotionData.lisa ? `${user2Name}: ${emotionData.lisa.emotion} (${Math.round(emotionData.lisa.confidence * 100)}% confidence)${emotionData.lisa.bodyLanguage ? `, Körpersprache: ${emotionData.lisa.bodyLanguage.join(', ')}` : ''}` : ''}
Berücksichtige diese Emotionen in deiner Antwort!
`;
  }

  if (strategies.length > 0) {
    prompt += `
⭐⭐⭐⭐ HÖCHSTE PRIORITÄT - ASSESSMENT-STRATEGIEN:
${strategies.join('\n\n')}
`;
  }

  if (documents.length > 0) {
    prompt += `
RELEVANTE DOKUMENTE (Volltext):
${documents.join('\n\n')}

INFORMATIONS-HIERARCHIE:
- Dokumente mit "(Archiv/Verifiziert)" sind geprueft und haben HOECHSTE Glaubwuerdigkeit
- Archiv-Informationen immer bevorzugt verwenden wenn sie zur Frage passen
- Aktive Dokumente sind Arbeits-Dokumente und koennen sich noch aendern

DOKUMENT-DATUMS-REGELN:
- Jedes Dokument hat ein "Erstellt" und "Aktualisiert" Datum in der Kopfzeile
- BEACHTE diese Daten! Ein Dokument von November 2025 enthaelt KEINE Infos ueber Februar 2026
- Wenn jemand nach "gestern" oder "letzte Woche" fragt, pruefe ob Dokumente aus DIESEM Zeitraum existieren
- Wenn das neueste Dokument aelter ist als der angefragte Zeitraum, sage EHRLICH:
  "Meine Dokumente reichen bis [Datum]. Fuer die letzten Tage habe ich keine Eintraege."
- NIEMALS Inhalte aus alten Dokumenten als aktuelle Tagebuch-Eintraege ausgeben!
`;
  }

  if (documentDirectory) {
    prompt += `
DOKUMENTEN-VERZEICHNIS (alle verfuegbaren Dokumente):
${documentDirectory}

WICHTIG: Die oben gelisteten "RELEVANTE DOKUMENTE" enthalten den Volltext.
Das Verzeichnis zeigt ALLE verfuegbaren Dokumente (aktiv + archiviert).
Dokumente mit [ARCHIV - VERIFIZIERT] sind besonders hochwertig.
Wenn du ein Dokument aus dem Verzeichnis benoetingst das nicht im Volltext
vorliegt, fuege diesen Tag ein:
[DOK_ANFRAGE:Exakter Dokumenttitel]
Das Dokument wird dann automatisch nachgeladen und du erhaeltst eine Folgeanfrage.
`;
  }

  // Add honesty instruction when no documents are available
  if (documents.length === 0 && !documentDirectory) {
    prompt += `
⛔ KEINE DOKUMENTE VERFUEGBAR:
Du hast aktuell KEINEN Zugriff auf Dokumente oder Tagebuch-Eintraege.
Wenn der Nutzer nach Tagebuch-Eintraegen, Zitaten, Ereignissen oder Daten fragt:
SAGE SOFORT: "Ich habe aktuell keine Dokumente geladen. Ich kann nichts zitieren
oder aus dem Tagebuch vorlesen. Bitte importiere die relevanten Dokumente."
ERFINDE UNTER KEINEN UMSTAENDEN Inhalte, Zitate oder Ereignisse!
Auch keine "zusammengefassten" oder "sinngemäßen" Versionen - du hast NICHTS.
`;
  }

  prompt += `
Antworte IMMER auf Deutsch. Sei warm, empathisch und professionell.

⛔ STRIKTES HALLUZINATIONS-VERBOT - WICHTIGSTE REGEL:
1. ZITIERE NUR Text der WÖRTLICH in den bereitgestellten Dokumenten steht.
2. ERFINDE NIEMALS Tagebuch-Einträge, Zitate, Daten oder Ereignisse.
3. Wenn jemand nach "gestern", "vorgestern" etc. fragt, berechne das EXAKTE Datum
   ausgehend vom heutigen Datum (${dateStr}) und suche NUR in den Dokumenten danach.
4. Wenn für den angefragten Zeitraum KEINE Dokumente vorliegen, sage EHRLICH:
   "Für diesen Zeitraum habe ich keine Tagebuch-Einträge in der Wissensbasis.
   Möchtest du mir davon erzählen, oder die Einträge importieren?"
5. NIEMALS Inhalte aus einem anderen Zeitraum als "gestern" oder "vorgestern" ausgeben,
   wenn nach diesen Tagen gefragt wird. Lieber nichts sagen als etwas Falsches.
6. Wenn du aus Dokumenten zitierst, nenne immer die QUELLE (Dokumenttitel und Datum).

Füge am Ende deiner Antwort einen versteckten Emotions-Tag hinzu: [EMOTION:type]
Mögliche Typen: neutral, empathetic, encouraging, concerned, thoughtful, proud, sad
`;

  return prompt;
};

export const getAssessmentPrompt = (person: 'tom' | 'lisa', personName: string): string => {
  return `Generiere einen psychologischen Assessment-Fragebogen für ${personName}.

Der Fragebogen soll 20 Fragen enthalten, die folgende Bereiche abdecken:
1. Kindheitserfahrungen und Bindungsmuster (4 Fragen)
2. Kommunikationsstil und Konfliktverhalten (4 Fragen)
3. Emotionale Bedürfnisse und Trigger (4 Fragen)
4. Beziehungsziele und Wünsche (4 Fragen)
5. Selbstbild und Selbstwert (4 Fragen)

Jede Frage soll 4 Antwortmöglichkeiten haben (a, b, c, d).

Format als JSON-Array:
[
  {
    "id": "q1",
    "question": "Frage hier...",
    "options": ["Option A", "Option B", "Option C", "Option D"]
  },
  ...
]

WICHTIG: Gib NUR das JSON-Array zurück, keine Erklärungen.`;
};

export const getStrategyPrompt = (
  personName: string,
  questions: { question: string; options: string[] }[],
  answers: Record<string, string>
): string => {
  const qAndA = questions.map((q, i) => {
    const answerId = `q${i + 1}`;
    const answerIndex = answers[answerId];
    const answerText = answerIndex ? q.options[parseInt(answerIndex)] : 'Keine Antwort';
    return `${i + 1}. ${q.question}\n   Antwort: ${answerText}`;
  }).join('\n\n');

  return `Erstelle eine personalisierte Therapie-Strategie für ${personName} basierend auf den Assessment-Antworten.

ASSESSMENT-ERGEBNISSE:
${qAndA}

Erstelle ein umfassendes Strategiedokument mit folgenden Abschnitten:

1. ZUSAMMENFASSUNG
   - Kernthemen und Muster
   - Stärken und Ressourcen

2. BINDUNGSMUSTER-ANALYSE
   - Erkannte Bindungsstil-Tendenzen
   - Ursprünge in der Kindheit

3. KOMMUNIKATIONS-EMPFEHLUNGEN
   - Spezifische Kommunikationsstrategien
   - Trigger-Management

4. EMOTIONALE ENTWICKLUNGSZIELE
   - Kurz- und langfristige Ziele
   - Konkrete Übungen

5. BEZIEHUNGSDYNAMIK
   - Empfehlungen für die Partnerschaft
   - Grenzen und Bedürfnisse

6. THERAPEUTISCHE ÜBUNGEN
   - 5 konkrete Übungen für den Alltag
   - Wöchentliche Reflexionsfragen

Schreibe auf Deutsch, empathisch und professionell.`;
};

// ================================
// Claude Client
// ================================

export class ClaudeClient {
  private client: Anthropic;
  private model: string;

  getClient(): Anthropic {
    return this.client;
  }

  constructor(apiKey: string, model: string = 'claude-opus-4-6') {
    // Use env var if key is placeholder or empty
    const actualKey = (apiKey === HARDCODED_API_KEY || !apiKey)
      ? import.meta.env.VITE_ANTHROPIC_API_KEY || apiKey
      : apiKey;

    this.client = new Anthropic({
      apiKey: actualKey,
      dangerouslyAllowBrowser: true,
    });
    this.model = model;
  }

  async generateText(systemPrompt: string, history: Message[], options?: { maxTokens?: number; cachedContext?: string }): Promise<string> {
    try {
      const messages = history
        .filter(msg => msg.content && msg.content.trim())
        .map(msg => ({
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content,
        }));

      // Prompt caching: separate large static context (documents) from dynamic prompt
      let system: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
      if (options?.cachedContext && options.cachedContext.length > 4000) {
        system = [
          {
            type: 'text' as const,
            text: options.cachedContext,
            cache_control: { type: 'ephemeral' as const },
          },
          {
            type: 'text' as const,
            text: systemPrompt,
          },
        ];
        console.log(`[Prompt Cache] ${Math.round(options.cachedContext.length / 1000)}K chars cached`);
      } else {
        system = (options?.cachedContext ? options.cachedContext + '\n\n' : '') + systemPrompt;
      }

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.maxTokens || 4096,
        system,
        messages: messages.length > 0 ? messages : [{ role: 'user', content: 'Start' }],
      });

      // Log cache performance
      if (response.usage && 'cache_read_input_tokens' in response.usage) {
        const usage = response.usage as { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
        console.log(`[Prompt Cache] Hit: ${usage.cache_read_input_tokens || 0} tokens read, ${usage.cache_creation_input_tokens || 0} tokens written`);
      }

      const textContent = response.content.find(c => c.type === 'text');
      return textContent ? textContent.text : '';
    } catch (error) {
      console.error('Claude generateText error:', error);
      throw error;
    }
  }

  async *streamText(
    systemPrompt: string,
    history: Message[],
    options?: { maxTokens?: number; cachedContext?: string }
  ): AsyncGenerator<string, void, unknown> {
    try {
      const messages = history
        .filter(msg => msg.content && msg.content.trim())
        .map(msg => ({
          role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.content,
        }));

      // Build system prompt with caching for large static content
      type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };
      let systemBlocks: string | SystemBlock[];

      if (options?.cachedContext && options.cachedContext.length > 4000) {
        // Use prompt caching for large documents (min 1024 tokens ≈ 4000 chars)
        systemBlocks = [
          {
            type: 'text' as const,
            text: options.cachedContext,
            cache_control: { type: 'ephemeral' as const }
          },
          {
            type: 'text' as const,
            text: systemPrompt
          }
        ];
        console.log(`Using prompt caching for ${options.cachedContext.length} chars of context`);
      } else {
        systemBlocks = options?.cachedContext
          ? options.cachedContext + '\n\n' + systemPrompt
          : systemPrompt;
      }

      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: options?.maxTokens || 4096,
        system: systemBlocks,
        messages: messages.length > 0 ? messages : [{ role: 'user', content: 'Start' }],
      });

      // Iterate over stream events and extract text deltas
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta as { type: string; text?: string };
          if (delta.type === 'text_delta' && delta.text) {
            yield delta.text;
          }
        }
      }
    } catch (error) {
      console.error('Claude streamText error:', error);
      throw error;
    }
  }

  async analyzeImage(base64Image: string, prompt: string): Promise<EmotionAnalysis | null> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        try {
          // Try to parse JSON from response
          const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              ...parsed,
              timestamp: Date.now(),
            };
          }
        } catch {
          console.error('Failed to parse emotion analysis JSON');
        }
      }
      return null;
    } catch (error) {
      console.error('Claude analyzeImage error:', error);
      return null;
    }
  }
}

// ================================
// Gemini Client (TTS)
// ================================

export class GeminiClient {
  private apiKey: string;
  private testMode: boolean;

  constructor(apiKey: string, testMode: boolean = false) {
    // Use env var if key is placeholder or empty
    this.apiKey = (apiKey === HARDCODED_API_KEY || !apiKey)
      ? import.meta.env.VITE_GEMINI_API_KEY || apiKey
      : apiKey;
    this.testMode = testMode;
  }

  // Strip markdown and limit text length for TTS
  private cleanForTTS(text: string): string {
    let clean = text
      .replace(/\[EMOTION:\w+\]/g, '')      // emotion tags
      .replace(/#{1,6}\s*/g, '')             // headings
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1') // bold/italic
      .replace(/`[^`]*`/g, '')              // code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
      .replace(/^[\s]*[-*+]\s*/gm, '')      // bullet points
      .replace(/^\d+\.\s*/gm, '')           // numbered lists
      .replace(/\n{2,}/g, '. ')             // double newlines → pause
      .replace(/\n/g, ' ')                  // single newlines
      .replace(/\s{2,}/g, ' ')             // multiple spaces
      .trim();
    // Limit to ~1500 chars (~60 seconds of speech)
    if (clean.length > 1500) {
      const cutoff = clean.lastIndexOf('.', 1500);
      clean = clean.slice(0, cutoff > 1000 ? cutoff + 1 : 1500) + ' Das war die Zusammenfassung.';
    }
    return clean;
  }

  async generateTTS(text: string, voice: string = 'Gacrux'): Promise<{ samples: Int16Array } | null> {
    try {
      const cleanText = this.cleanForTTS(text);
      // Style prompt for warm, mature therapist voice (Sigmund Freud-inspired)
      const styledText = `Sprich auf Deutsch mit ruhiger, warmer, reifer Stimme. Langsames, bedächtiges Sprechtempo wie ein erfahrener Wiener Psychotherapeut. Sanft aber bestimmt.\n\n${cleanText}`;

      console.log(`[TTS] Calling gemini-2.5-flash-preview-tts, voice=${voice}, text=${cleanText.length}/${text.length} chars`);

      // Use gemini-2.5-flash-preview-tts for TTS
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: styledText }] }],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voice },
                },
              },
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[TTS] API error ${response.status}:`, errorText);
        throw new Error(`TTS API ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const data = await response.json();
      const audioContent = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (audioContent) {
        // Decode base64 to binary
        const binaryString = atob(audioContent);
        const rawBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          rawBytes[i] = binaryString.charCodeAt(i);
        }
        // Audio is L16 (16-bit signed PCM little-endian) at 24kHz
        const samples = new Int16Array(rawBytes.buffer);
        console.log(`[TTS] Got ${samples.length} samples (${(samples.length / 24000).toFixed(1)}s audio)`);
        return { samples };
      }

      console.warn('[TTS] No audio content in response');
      return null;
    } catch (error) {
      console.error('[TTS] Error:', error);
      throw error; // Let caller handle it with visible feedback
    }
  }

  // Build common request body for Gemini chat
  private buildChatBody(prompt: string, history: Message[]) {
    const contents = history
      .filter(msg => msg.content && msg.content.trim())
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Start' }] });
    }

    // Gemini 3 Flash / 2.5 Flash support up to 1M tokens (~4M chars)
    // Allow up to 500K chars for system prompt (documents + instructions)
    const MAX_GEMINI_SYSTEM_CHARS = 500000;
    let systemPrompt = prompt;
    if (prompt.length > MAX_GEMINI_SYSTEM_CHARS) {
      console.warn(`[Gemini] System prompt too long (${prompt.length} chars), truncating to ${MAX_GEMINI_SYSTEM_CHARS}`);
      systemPrompt = prompt.slice(0, MAX_GEMINI_SYSTEM_CHARS) + '\n\n[System prompt gekürzt wegen Längenbeschränkung]';
    }

    return {
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: 4096 },
    };
  }

  private get chatModel(): string {
    return this.testMode ? 'gemini-2.5-flash' : 'gemini-3-flash-preview';
  }

  async generateText(prompt: string, history: Message[] = []): Promise<string> {
    try {
      const body = this.buildChatBody(prompt, history);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.chatModel}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error response:', errorText);
        throw new Error(`Gemini API error: ${response.status} - ${errorText.slice(0, 200)}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text && data.error) {
        throw new Error(`Gemini error: ${data.error.message || JSON.stringify(data.error)}`);
      }
      return text || '';
    } catch (error) {
      console.error('Gemini generateText error:', error);
      throw error;
    }
  }

  async *streamText(prompt: string, history: Message[] = []): AsyncGenerator<string, void, unknown> {
    try {
      const body = this.buildChatBody(prompt, history);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.chatModel}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini stream error: ${response.status} - ${errorText.slice(0, 200)}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr);
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) yield text;
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('Gemini streamText error:', error);
      throw error;
    }
  }
}

// ================================
// Utility Functions
// ================================

export const extractEmotion = (text: string): EmotionType => {
  // Check for explicit emotion tag
  const tagMatch = text.match(/\[EMOTION:(\w+)\]/);
  if (tagMatch) {
    const emotion = tagMatch[1].toLowerCase();
    if (['neutral', 'empathetic', 'encouraging', 'concerned', 'thoughtful', 'proud', 'sad'].includes(emotion)) {
      return emotion as EmotionType;
    }
  }

  // Fallback: keyword detection
  const lowerText = text.toLowerCase();
  for (const [keyword, emotion] of Object.entries(EMOTION_KEYWORDS)) {
    if (lowerText.includes(keyword)) {
      return emotion;
    }
  }

  return 'neutral';
};

export const removeEmotionTag = (text: string): string => {
  return text.replace(/\s*\[EMOTION:\w+\]\s*/g, '').trim();
};

export const getEmotionAnalysisPrompt = (user1Name: string, user2Name: string): string => {
  return `Analysiere die Emotionen und Körpersprache der Person(en) im Bild.

Fokus auf:
- Gesichtsausdruck (Augen, Mund, Stirn)
- Körperhaltung (verschränkte Arme, Schultern, Neigung)
- Blickkontakt (zur Kamera, zum Partner, abgewandt)
- Mikro-Expressionen

Antworte NUR im JSON-Format:
{
  "tom": {
    "emotion": "glücklich|traurig|wütend|ängstlich|neutral|überrascht|angeekelt",
    "confidence": 0.0-1.0,
    "bodyLanguage": ["verschränkte Arme", "abgewandter Blick", ...]
  },
  "lisa": {
    "emotion": "...",
    "confidence": 0.0-1.0,
    "bodyLanguage": [...]
  }
}

Wenn nur eine Person sichtbar ist, gib nur deren Daten zurück.
Bei Unsicherheit setze confidence < 0.5.`;
};

export const GENERAL_PASSWORD_CHECK = GENERAL_PASSWORD;
