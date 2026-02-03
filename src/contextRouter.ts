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
  skipThresholdChars: 100_000,
  maxSelectedChars: 120_000,
  maxIndexPreviewChars: 200,
};

// ================================
// Index Builder
// ================================

export function buildDocumentIndex(
  documents: Document[],
  config: ContextRouterConfig = DEFAULT_ROUTER_CONFIG
): { index: DocumentIndexEntry[]; indexText: string; totalChars: number } {
  const activeDocs = documents.filter(d => !d.isArchived);

  const index: DocumentIndexEntry[] = activeDocs.map(doc => ({
    id: doc.id,
    title: doc.title,
    type: doc.type,
    person: doc.person,
    charCount: doc.content.length,
    preview: doc.content.slice(0, config.maxIndexPreviewChars).trim() +
             (doc.content.length > config.maxIndexPreviewChars ? '...' : ''),
  }));

  const totalChars = activeDocs.reduce((sum, d) => sum + d.content.length, 0);

  const indexText = index.map((entry, i) =>
    `[${i + 1}] ID: ${entry.id}\n` +
    `    Titel: ${entry.title}\n` +
    `    Typ: ${entry.type} | Person: ${entry.person || 'beide'} | ${entry.charCount} Zeichen\n` +
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

REGELN:
1. Waehle Dokumente die thematisch zur Frage passen
2. Im Paar-Raum: Dokumente beider Partner koennen relevant sein
3. Im Einzel-Raum: Bevorzuge Dokumente dieser Person
4. Strategien werden separat gesendet - hier nur Dokumente auswaehlen
5. Maximal ${Math.round(maxSelectedChars / 1000)}K Zeichen Gesamtgroesse der Auswahl
6. Bei Unsicherheit: lieber ein Dokument zu viel als zu wenig
7. Bei allgemeinen Gespraechen ohne spezifischen Bezug: waehle die 3-5 neuesten/wichtigsten

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

export async function routeContext(
  userMessage: string,
  room: RoomType,
  documents: Document[],
  anthropicClient: Anthropic,
  user1Name: string,
  user2Name: string,
  config: ContextRouterConfig = DEFAULT_ROUTER_CONFIG
): Promise<RouterResult> {
  const startTime = performance.now();

  const { index, indexText, totalChars } = buildDocumentIndex(documents, config);

  if (!shouldUseRouter(totalChars, index.length, config)) {
    return {
      selectedDocIds: documents.filter(d => !d.isArchived).map(d => d.id),
      reasoning: 'Routing uebersprungen - Wissensbasis klein genug',
      routerUsed: false,
      routerTimeMs: 0,
    };
  }

  try {
    const systemPrompt = getRouterPrompt(
      room, user1Name, user2Name, indexText, config.maxSelectedChars
    );

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

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
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
      selectedDocIds: documents.filter(d => !d.isArchived).map(d => d.id),
      reasoning: `Routing fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannt'}. Fallback.`,
      routerUsed: false,
      routerTimeMs: elapsed,
    };
  }
}
