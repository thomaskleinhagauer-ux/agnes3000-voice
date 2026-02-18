// ================================
// IMAGO VOICE - Context Router (Vermittler-KI)
// Selects relevant documents via fast Haiku call
// before sending to the therapy model
// ================================

import Anthropic from '@anthropic-ai/sdk';
import { Document, RoomType } from './types';

// ================================
// Types
// ================================

export interface DocumentIndexEntry {
  id: string;
  title: string;
  type: string;
  person?: string;
  charCount: number;
  preview: string;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RouterResult {
  selectedDocIds: string[];
  reasoning: string;
  routerUsed: boolean;
  routerTimeMs: number;
}

export interface ContextRouterConfig {
  enabled: boolean;
  routerModel: string;
  skipThresholdChars: number;
  maxSelectedChars: number;
  maxIndexPreviewChars: number;
}

export const DEFAULT_ROUTER_CONFIG: ContextRouterConfig = {
  enabled: true,
  routerModel: 'claude-haiku-3-5-20241022',
  skipThresholdChars: 10_000,   // 10K chars (~2.5K tokens) - aktiviere Router früher!
  maxSelectedChars: 60_000,     // 60K chars (~15K tokens) - UNTER 30K Token-Limit!
  maxIndexPreviewChars: 100,    // kürzere Previews für schnellere Verarbeitung
};

// TURBO Modus Configs pro Tier - angepasst für Opus/Sonnet 4.6 (200K Fenster)
// WICHTIG: Erste Nachricht = Cache Write = zählt zum Rate Limit!
// → maxSelectedChars muss zum Tier-Rate-Limit passen
export const TURBO_ROUTER_CONFIGS: Record<string, ContextRouterConfig> = {
  tier1: {
    enabled: true,
    routerModel: 'claude-haiku-3-5-20241022',
    skipThresholdChars: 10_000,
    maxSelectedChars: 100_000,    // ~25K tokens (unter 30K/min Rate Limit)
    maxIndexPreviewChars: 150,
  },
  tier2: {
    enabled: true,
    routerModel: 'claude-haiku-3-5-20241022',
    skipThresholdChars: 50_000,
    maxSelectedChars: 280_000,    // ~70K tokens (unter 80K/min Rate Limit)
    maxIndexPreviewChars: 150,
  },
  tier3: {
    enabled: true,
    routerModel: 'claude-haiku-3-5-20241022',
    skipThresholdChars: 100_000,
    maxSelectedChars: 600_000,    // ~150K tokens (unter 160K/min Rate Limit)
    maxIndexPreviewChars: 150,
  },
  tier4: {
    enabled: true,
    routerModel: 'claude-haiku-3-5-20241022',
    skipThresholdChars: 100_000,
    maxSelectedChars: 720_000,    // ~180K tokens (voller 4.6-Kontext, unter 200K Schwelle!)
    maxIndexPreviewChars: 150,
  },
};

// Rückwärts-kompatibel: Default TURBO Config (Tier 1)
export const TURBO_ROUTER_CONFIG: ContextRouterConfig = TURBO_ROUTER_CONFIGS.tier1;

// Hilfsfunktion
export function getTurboRouterConfig(tier: string): ContextRouterConfig {
  return TURBO_ROUTER_CONFIGS[tier] || TURBO_ROUTER_CONFIGS.tier1;
}

// Hard limit for total context - passt sich an den Tier an
// Tier 1: ~25K tokens | Tier 4: ~180K tokens
export const MAX_TOTAL_CONTEXT_CHARS = 720_000; // Absolute Obergrenze, wird durch Tier-Config begrenzt

// ================================
// Index Builder
// ================================

export function buildDocumentIndex(
  documents: Document[],
  config: ContextRouterConfig = DEFAULT_ROUTER_CONFIG
): { index: DocumentIndexEntry[]; indexText: string; totalChars: number } {
  // Index ALL documents - archived docs are verified/high-quality sources
  const index: DocumentIndexEntry[] = documents.map(doc => ({
    id: doc.id,
    title: doc.title,
    type: doc.type,
    person: doc.person,
    charCount: doc.content.length,
    isArchived: !!doc.isArchived,
    preview: doc.content.slice(0, config.maxIndexPreviewChars).trim() +
             (doc.content.length > config.maxIndexPreviewChars ? '...' : ''),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));

  const totalChars = documents.reduce((sum, d) => sum + d.content.length, 0);

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });

  const indexText = index.map((entry, i) =>
    `[${i + 1}] ID: ${entry.id}${entry.isArchived ? ' [ARCHIV - VERIFIZIERT]' : ''}\n` +
    `    Titel: ${entry.title}\n` +
    `    Typ: ${entry.type} | Person: ${entry.person || 'beide'} | ${entry.charCount} Zeichen\n` +
    `    Erstellt: ${formatDate(entry.createdAt)} | Aktualisiert: ${formatDate(entry.updatedAt)}\n` +
    `    Vorschau: ${entry.preview}`
  ).join('\n\n');

  return { index, indexText, totalChars };
}

// ================================
// Decision Logic
// ================================

export function shouldUseRouter(
  totalDocChars: number,
  documentCount: number,
  config: ContextRouterConfig = DEFAULT_ROUTER_CONFIG
): boolean {
  if (!config.enabled) return false;
  if (documentCount <= 3) return false;
  if (totalDocChars <= config.skipThresholdChars) return false;
  return true;
}

// ================================
// Router Prompt
// ================================

function getRouterPrompt(
  room: RoomType,
  user1Name: string,
  user2Name: string,
  documentIndex: string,
  maxSelectedChars: number
): string {
  const roomContext = room === 'paar'
    ? `Paar-Raum (gemeinsame Therapie von ${user1Name} und ${user2Name})`
    : room === 'tom'
    ? `${user1Name}s Einzelraum`
    : room === 'lisa'
    ? `${user2Name}s Einzelraum`
    : 'Assessment';

  return `Du bist ein Kontext-Vermittler fuer eine KI-Paartherapie-Plattform.

DEINE AUFGABE:
Waehle aus der Dokumentenliste die Dokumente aus, die fuer die aktuelle Frage des Nutzers relevant sind.
Die Therapie-KI hat ein begrenztes Kontextfenster. Sende NUR relevante Dokumente.

AKTUELLER RAUM: ${roomContext}

INFORMATIONS-BEWERTUNG:
Dokumente mit [ARCHIV - VERIFIZIERT] sind vom Therapeuten-Team geprueft und archiviert.
Sie enthalten verifizierte, hochwertige Informationen und sollen BEVORZUGT ausgewaehlt werden.
Archivierte Dokumente haben hoeheren Informationswert als aktive Arbeits-Dokumente.

REGELN:
1. ARCHIV-Dokumente bei thematischer Relevanz IMMER bevorzugt auswaehlen
2. Waehle weitere Dokumente die thematisch zur Frage passen
3. Im Paar-Raum: Dokumente beider Partner koennen relevant sein
4. Im Einzel-Raum: Bevorzuge Dokumente dieser Person
5. Strategien werden separat gesendet - hier nur Dokumente auswaehlen
6. Maximal ${Math.round(maxSelectedChars / 1000)}K Zeichen Gesamtgroesse der Auswahl
7. Bei Unsicherheit: lieber ein Dokument zu viel als zu wenig
8. Bei allgemeinen Gespraechen: waehle relevante Archiv-Dokumente + 2-3 neueste aktive

DOKUMENTEN-INDEX:
${documentIndex}

Antworte NUR im folgenden JSON-Format:
{
  "selectedIds": ["id1", "id2"],
  "reasoning": "Kurze Begruendung"
}`;
}

// ================================
// Main Router Function
// ================================

// Gemini-based router call (for when Claude is not available)
async function routeWithGemini(
  geminiApiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );
  if (!response.ok) throw new Error(`Gemini router ${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function routeContext(
  userMessage: string,
  room: RoomType,
  documents: Document[],
  anthropicClient: Anthropic | null,
  user1Name: string,
  user2Name: string,
  config: ContextRouterConfig = DEFAULT_ROUTER_CONFIG,
  geminiApiKey?: string
): Promise<RouterResult> {
  const startTime = performance.now();

  const { index, indexText, totalChars } = buildDocumentIndex(documents, config);

  if (!shouldUseRouter(totalChars, index.length, config)) {
    return {
      selectedDocIds: documents.map(d => d.id),
      reasoning: 'Routing uebersprungen - Wissensbasis klein genug',
      routerUsed: false,
      routerTimeMs: 0,
    };
  }

  try {
    const systemPrompt = getRouterPrompt(
      room, user1Name, user2Name, indexText, config.maxSelectedChars
    );

    let responseText: string;

    if (anthropicClient) {
      // Use Claude Haiku as router
      const response = await anthropicClient.messages.create({
        model: config.routerModel,
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          }
        ],
        messages: [
          { role: 'user', content: userMessage }
        ],
      });
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from router');
      }
      responseText = textContent.text;
    } else if (geminiApiKey) {
      // Use Gemini 2.5 Flash as router (free, fast)
      responseText = await routeWithGemini(geminiApiKey, systemPrompt, userMessage);
    } else {
      throw new Error('No AI client available for routing');
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Router response did not contain valid JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      selectedIds: string[];
      reasoning: string;
    };

    const validIds = new Set(index.map(e => e.id));
    const selectedIds = parsed.selectedIds.filter(id => validIds.has(id));

    // Enforce char budget
    let charBudget = config.maxSelectedChars;
    const finalIds: string[] = [];
    for (const id of selectedIds) {
      const entry = index.find(e => e.id === id);
      if (entry && entry.charCount <= charBudget) {
        finalIds.push(id);
        charBudget -= entry.charCount;
      }
    }

    const elapsed = performance.now() - startTime;

    console.log(
      `[Vermittler-KI] ${finalIds.length}/${index.length} Dokumente ausgewaehlt ` +
      `(${Math.round((config.maxSelectedChars - charBudget) / 1000)}K/${Math.round(totalChars / 1000)}K chars) ` +
      `in ${Math.round(elapsed)}ms - ${parsed.reasoning}`
    );

    return {
      selectedDocIds: finalIds,
      reasoning: parsed.reasoning,
      routerUsed: true,
      routerTimeMs: elapsed,
    };

  } catch (error) {
    const elapsed = performance.now() - startTime;
    console.error('[Vermittler-KI] Fehler, Fallback auf alle Dokumente:', error);

    return {
      selectedDocIds: documents.map(d => d.id),
      reasoning: `Routing fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannt'}. Fallback.`,
      routerUsed: false,
      routerTimeMs: elapsed,
    };
  }
}
