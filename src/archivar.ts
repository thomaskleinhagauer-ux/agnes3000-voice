// ================================
// AGNES 3000 - ARCHIVAR System
// Intelligente Dokumenten-Verwaltung mit Rate-Limit-Awareness
// ================================

import Anthropic from '@anthropic-ai/sdk';
import { Document, RoomType } from './types';

// ================================
// Constants & Config
// ================================

// Rate Limits für verschiedene API Tiers (korrigiert Feb 2026 laut Account-Seite)
// WICHTIG: Cache Writes ZÄHLEN zum Rate Limit, Cache Reads NICHT!
// → Erste Nachricht pro Session (Cache Write) ist der Engpass
// → Nachrichten 2+ nutzen Cache Reads = kein Rate-Limit-Problem
export const RATE_LIMITS = {
  tier1: { tokensPerMinute: 30_000, name: 'Tier 1 ($5+)' },
  tier2: { tokensPerMinute: 80_000, name: 'Tier 2 ($40+)' },
  tier3: { tokensPerMinute: 160_000, name: 'Tier 3 ($200+)' },
  tier4: { tokensPerMinute: 400_000, name: 'Tier 4 ($400+)' },
};

// Konservative Schätzung: 4 chars = 1 token
export const CHARS_PER_TOKEN = 4;

// Standard-Limit (Tier 1 mit Puffer unter 30K Rate Limit)
export const DEFAULT_TOKEN_LIMIT = 20_000;

// TURBO Token-Limits pro Tier (muss unter Rate Limit der ersten Nachricht bleiben!)
// Erste Nachricht = Cache Write = zählt zum Rate Limit
// Ab Nachricht 2 = Cache Read = zählt NICHT → effektiv unbegrenzt
export const TURBO_TOKEN_LIMITS = {
  tier1: 25_000,   // Unter 30K/min - konservativ für Tier 1
  tier2: 70_000,   // Unter 80K/min
  tier3: 150_000,  // Unter 160K/min
  tier4: 180_000,  // Voller 4.6-Kontext, unter 200K Schwelle!
};

// Rückwärts-kompatibel: Default TURBO Limit (wird per getTurboTokenLimit überschrieben)
export const TURBO_TOKEN_LIMIT = TURBO_TOKEN_LIMITS.tier1;

// Hilfsfunktion: Gibt das optimale TURBO-Limit für den API-Tier zurück
export function getTurboTokenLimit(tier: keyof typeof RATE_LIMITS): number {
  return TURBO_TOKEN_LIMITS[tier] || TURBO_TOKEN_LIMITS.tier1;
}

// Chunk-Größen
export const MAX_CHUNK_TOKENS = 8_000; // ~32K chars pro Chunk
export const MIN_CHUNK_TOKENS = 1_000; // Mindestgröße für Caching

// ================================
// Types
// ================================

export interface DocumentChunk {
  id: string;
  parentId: string;
  parentTitle: string;
  chunkIndex: number;
  totalChunks: number;
  content: string;
  tokens: number;
  summary: string;
  keywords: string[];
  dateRange?: { start?: string; end?: string };
  isArchived: boolean;
  priority: number; // 1-10, higher = more important
}

export interface ArchivarConfig {
  tokenLimit: number;
  turboMode: boolean;
  apiTier: keyof typeof RATE_LIMITS;
}

export interface ArchivarResult {
  selectedChunks: DocumentChunk[];
  totalTokens: number;
  reasoning: string;
  turboAvailable: boolean;
  estimatedCost: CostEstimate;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCostUSD: number;
  breakdown: string;
}

// ================================
// Document Chunking
// ================================

export function chunkDocument(doc: Document): DocumentChunk[] {
  const content = doc.content;
  const totalChars = content.length;
  const estimatedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);

  // If document fits in one chunk, return as-is
  if (estimatedTokens <= MAX_CHUNK_TOKENS) {
    return [{
      id: `${doc.id}_chunk_0`,
      parentId: doc.id,
      parentTitle: doc.title,
      chunkIndex: 0,
      totalChunks: 1,
      content: content,
      tokens: estimatedTokens,
      summary: extractSummary(content),
      keywords: extractKeywords(content, doc.title),
      dateRange: extractDateRange(content),
      isArchived: !!doc.isArchived,
      priority: calculatePriority(doc),
    }];
  }

  // Split into chunks at natural boundaries
  const chunks: DocumentChunk[] = [];
  const targetChunkChars = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN;

  // Try to split at section headers or paragraphs
  const sections = splitAtSections(content, targetChunkChars);

  sections.forEach((section, index) => {
    const sectionTokens = Math.ceil(section.length / CHARS_PER_TOKEN);
    chunks.push({
      id: `${doc.id}_chunk_${index}`,
      parentId: doc.id,
      parentTitle: doc.title,
      chunkIndex: index,
      totalChunks: sections.length,
      content: section,
      tokens: sectionTokens,
      summary: extractSummary(section),
      keywords: extractKeywords(section, doc.title),
      dateRange: extractDateRange(section),
      isArchived: !!doc.isArchived,
      priority: calculatePriority(doc),
    });
  });

  return chunks;
}

function splitAtSections(content: string, maxChunkChars: number): string[] {
  const chunks: string[] = [];

  // Common section delimiters
  const sectionPatterns = [
    /\n#{1,3}\s+/g,           // Markdown headers
    /\nPHASE \d+/gi,          // Phase markers
    /\nPUNKT \d+/gi,          // Point markers
    /\n\d+\.\s+[A-Z]/g,       // Numbered sections
    /\n---+\n/g,              // Horizontal rules
    /\n\n\n+/g,               // Multiple newlines
  ];

  // Find all potential split points
  const splitPoints: number[] = [0];

  for (const pattern of sectionPatterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(content)) !== null) {
      splitPoints.push(match.index);
    }
  }

  splitPoints.push(content.length);
  splitPoints.sort((a, b) => a - b);

  // Remove duplicates and very close points
  const filteredPoints = splitPoints.filter((point, index) => {
    if (index === 0) return true;
    return point - splitPoints[index - 1] > 500; // Min 500 chars between splits
  });

  // Build chunks respecting max size
  let currentChunk = '';
  let currentStart = 0;

  for (let i = 1; i < filteredPoints.length; i++) {
    const section = content.slice(filteredPoints[i - 1], filteredPoints[i]);

    if (currentChunk.length + section.length <= maxChunkChars) {
      currentChunk += section;
    } else {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
      }

      // If single section is too large, split by paragraphs
      if (section.length > maxChunkChars) {
        const subChunks = splitByParagraphs(section, maxChunkChars);
        chunks.push(...subChunks.slice(0, -1));
        currentChunk = subChunks[subChunks.length - 1] || '';
      } else {
        currentChunk = section;
      }
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function splitByParagraphs(content: string, maxChars: number): string[] {
  const paragraphs = content.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length + 2 <= maxChars) {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    } else {
      if (currentChunk) chunks.push(currentChunk);

      // If paragraph itself is too large, hard split
      if (para.length > maxChars) {
        for (let i = 0; i < para.length; i += maxChars) {
          chunks.push(para.slice(i, i + maxChars));
        }
        currentChunk = '';
      } else {
        currentChunk = para;
      }
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

function extractSummary(content: string): string {
  // Get first meaningful line(s)
  const lines = content.split('\n').filter(l => l.trim().length > 20);
  return lines.slice(0, 2).join(' ').slice(0, 200);
}

function extractKeywords(content: string, title: string): string[] {
  const keywords: string[] = [];

  // Add title words
  title.split(/\s+/).forEach(word => {
    if (word.length > 3) keywords.push(word.toLowerCase());
  });

  // Extract important terms (names, dates, etc.)
  const namePatterns = [
    /\b(Tom|Liisa|Lisa|Agnes|Dominik|Daniel|Una|Larissa)\b/gi,
    /\b(Affäre|Therapie|Beziehung|Kommunikation|Vertrauen)\b/gi,
    /\b(202\d)\b/g,
    /\b(ADHS|MS|PostCovid)\b/gi,
  ];

  for (const pattern of namePatterns) {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(m => keywords.push(m.toLowerCase()));
    }
  }

  return [...new Set(keywords)].slice(0, 15);
}

function extractDateRange(content: string): { start?: string; end?: string } | undefined {
  const datePattern = /\b(\d{1,2}\.?\s*(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\.?\s*202\d|\d{1,2}\.\d{1,2}\.202\d)\b/gi;
  const matches = content.match(datePattern);

  if (!matches || matches.length === 0) return undefined;

  return {
    start: matches[0],
    end: matches[matches.length - 1],
  };
}

function calculatePriority(doc: Document): number {
  let priority = 5; // Default

  // Archived docs are verified = higher priority
  if (doc.isArchived) priority += 2;

  // Certain titles indicate higher importance
  const titleLower = doc.title.toLowerCase();
  if (titleLower.includes('chronologie') || titleLower.includes('100 punkte')) priority += 3;
  if (titleLower.includes('ergänzung') || titleLower.includes('tools')) priority += 2;
  if (titleLower.includes('beziehungsstand') || titleLower.includes('agnes')) priority += 2;
  if (titleLower.includes('kommunikation') || titleLower.includes('analyse')) priority += 1;

  return Math.min(priority, 10);
}

// ================================
// Archivar: Document Selection
// ================================

export async function selectDocuments(
  userMessage: string,
  room: RoomType,
  allChunks: DocumentChunk[],
  anthropicClient: Anthropic,
  config: ArchivarConfig
): Promise<ArchivarResult> {
  const startTime = performance.now();
  const tokenLimit = config.turboMode ? getTurboTokenLimit(config.apiTier) : config.tokenLimit;

  // Build chunk index for Haiku
  const chunkIndex = allChunks.map((chunk, i) =>
    `[${i}] "${chunk.parentTitle}" (Teil ${chunk.chunkIndex + 1}/${chunk.totalChunks}) - ` +
    `${chunk.tokens} tokens | Prio: ${chunk.priority} | ` +
    `Keywords: ${chunk.keywords.slice(0, 5).join(', ')} | ` +
    `${chunk.isArchived ? '[ARCHIV]' : ''}`
  ).join('\n');

  const prompt = `Du bist der ARCHIVAR für eine KI-Paartherapie-App.

AUFGABE: Wähle die relevantesten Dokumenten-Chunks für diese Anfrage aus.

TOKEN-LIMIT: ${tokenLimit.toLocaleString()} Tokens (STRIKT einhalten!)
RAUM: ${room === 'paar' ? 'Paar-Raum (beide Partner)' : room === 'tom' ? "Tom's Einzelraum" : "Lisa's Einzelraum"}

CHUNK-INDEX:
${chunkIndex}

REGELN:
1. Wähle NUR so viele Chunks, dass das Token-Limit NICHT überschritten wird
2. [ARCHIV] Chunks bevorzugen - das sind verifizierte Informationen
3. Höhere Priorität = wichtiger
4. Bei Fragen zu Zeiträumen: entsprechende Chunks wählen
5. Immer mindestens EINEN Chunk mit Kontext zur Beziehungsgeschichte

Antworte NUR mit JSON:
{
  "selectedIndices": [0, 5, 12],
  "reasoning": "Kurze Begründung",
  "totalTokens": 25000
}`;

  try {
    const response = await anthropicClient.messages.create({
      model: 'claude-haiku-3-5-20241022',
      max_tokens: 512,
      system: 'Du bist ein effizienter Dokumenten-Selector. Antworte NUR mit validem JSON.',
      messages: [
        { role: 'user', content: `NUTZER-ANFRAGE: "${userMessage}"\n\n${prompt}` }
      ],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('Keine Antwort vom Archivar');
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Ungültiges JSON vom Archivar');
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      selectedIndices: number[];
      reasoning: string;
      totalTokens: number;
    };

    // Validate and collect selected chunks
    const selectedChunks: DocumentChunk[] = [];
    let totalTokens = 0;

    for (const idx of parsed.selectedIndices) {
      if (idx >= 0 && idx < allChunks.length) {
        const chunk = allChunks[idx];
        if (totalTokens + chunk.tokens <= tokenLimit) {
          selectedChunks.push(chunk);
          totalTokens += chunk.tokens;
        }
      }
    }

    const elapsed = performance.now() - startTime;
    console.log(`[Archivar] ${selectedChunks.length} Chunks (${totalTokens.toLocaleString()} tokens) in ${Math.round(elapsed)}ms`);

    return {
      selectedChunks,
      totalTokens,
      reasoning: parsed.reasoning,
      turboAvailable: config.apiTier !== 'tier1',
      estimatedCost: calculateCost(totalTokens, config.turboMode),
    };

  } catch (error) {
    console.error('[Archivar] Fehler:', error);

    // Fallback: Select highest priority chunks within limit
    const sortedChunks = [...allChunks].sort((a, b) => b.priority - a.priority);
    const selectedChunks: DocumentChunk[] = [];
    let totalTokens = 0;

    for (const chunk of sortedChunks) {
      if (totalTokens + chunk.tokens <= tokenLimit) {
        selectedChunks.push(chunk);
        totalTokens += chunk.tokens;
      }
    }

    return {
      selectedChunks,
      totalTokens,
      reasoning: 'Fallback-Auswahl nach Priorität',
      turboAvailable: false,
      estimatedCost: calculateCost(totalTokens, false),
    };
  }
}

// ================================
// Cost Calculation
// ================================

// Anthropic Preise (Stand Feb 2026 - aktualisiert für 4.6 Release)
const PRICING = {
  'claude-opus-4-6': {
    input: 5.00 / 1_000_000,      // $5/MTok
    output: 25.00 / 1_000_000,    // $25/MTok
    cacheWrite: 6.25 / 1_000_000, // $6.25/MTok (1.25x input)
    cacheRead: 0.50 / 1_000_000,  // $0.50/MTok (0.1x input)
  },
  'claude-sonnet-4-6': {
    input: 3.00 / 1_000_000,      // $3/MTok
    output: 15.00 / 1_000_000,    // $15/MTok
    cacheWrite: 3.75 / 1_000_000, // $3.75/MTok
    cacheRead: 0.30 / 1_000_000,  // $0.30/MTok
  },
  'claude-sonnet-4-5': {
    input: 3.00 / 1_000_000,      // $3/MTok (Legacy)
    output: 15.00 / 1_000_000,    // $15/MTok
    cacheWrite: 3.75 / 1_000_000, // $3.75/MTok
    cacheRead: 0.30 / 1_000_000,  // $0.30/MTok
  },
  'claude-haiku-3-5': {
    input: 0.80 / 1_000_000,
    output: 4.00 / 1_000_000,
    cacheWrite: 1.00 / 1_000_000,
    cacheRead: 0.08 / 1_000_000,
  },
};

export function calculateCost(
  inputTokens: number,
  isTurbo: boolean,
  assumeCacheHit: boolean = false
): CostEstimate {
  const pricing = PRICING['claude-opus-4-6'];
  const outputTokens = 1000; // Geschätzt

  let cacheWriteTokens = 0;
  let cacheReadTokens = 0;

  if (assumeCacheHit) {
    cacheReadTokens = inputTokens;
  } else {
    cacheWriteTokens = inputTokens;
  }

  const totalCostUSD =
    (assumeCacheHit ? cacheReadTokens * pricing.cacheRead : inputTokens * pricing.input) +
    (cacheWriteTokens * pricing.cacheWrite) +
    (outputTokens * pricing.output);

  return {
    inputTokens,
    outputTokens,
    cacheWriteTokens,
    cacheReadTokens,
    totalCostUSD,
    breakdown: assumeCacheHit
      ? `Cache-Read: ${inputTokens.toLocaleString()} tokens = $${(cacheReadTokens * pricing.cacheRead).toFixed(4)}`
      : `Input: ${inputTokens.toLocaleString()} tokens = $${(inputTokens * pricing.input).toFixed(4)}`,
  };
}

export async function fetchCurrentPricing(): Promise<string> {
  // In einer echten Implementierung könnte hier die API gecheckt werden
  // Für jetzt: Statische Preise zurückgeben
  return `
💰 **Aktuelle Kosten (Opus 4.6 / Sonnet 4.6)**:

📊 **Tier 1** (dein aktueller Tier, 30K/min):
- Standard: ~$0.02-0.03 pro Nachricht (20K tokens)
- TURBO: ~$0.05-0.08 pro Nachricht (25K tokens)
- 1h Paar-Session (Opus): ~$4-5 | (Sonnet): ~$2.50-3

📊 **Tier 3+** (ab $200 Einzahlung, 160K/min):
- TURBO: ~$0.19 pro Nachricht (150K cached context)
- 1h Paar-Session (Opus): ~$8-11 | (Sonnet): ~$6-7

📊 **Tier 4** (ab $400, 400K/min):
- TURBO: ~$0.23 pro Nachricht (180K cached context!)
- Agnes hat Zugriff auf fast 1/3 der gesamten Wissensbasis pro Nachricht

⚡ Cache: 90% günstiger ab Nachricht 2!
Modell umschaltbar in den Einstellungen (Opus für Paar, Sonnet für Einzel/Test).
`.trim();
}

// ================================
// Chunk all documents
// ================================

export function chunkAllDocuments(documents: Document[]): DocumentChunk[] {
  const allChunks: DocumentChunk[] = [];

  for (const doc of documents) {
    const chunks = chunkDocument(doc);
    allChunks.push(...chunks);
  }

  // Sort by priority
  allChunks.sort((a, b) => b.priority - a.priority);

  console.log(`[Archivar] ${documents.length} Dokumente → ${allChunks.length} Chunks`);

  return allChunks;
}
