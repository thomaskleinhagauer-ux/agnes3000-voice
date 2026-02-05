// ================================
// AGNES 3000 - Knowledge Cache System
// TIER 1 (Cached) + TIER 2 (Archivar)
// ================================

import Anthropic from '@anthropic-ai/sdk';
import { TIER1_EMBEDDED_CONTENT } from './tier1EmbeddedContent';

// ================================
// Types
// ================================

export interface Tier1Document {
  name: string;
  priority: number;
  description: string;
  estimatedTokens: number;
  content: string;
  hash?: string;
  loadedAt?: string;
}

export interface Tier2Document {
  path: string;
  description: string;
  triggers: string[];
  category: string;
}

export interface ArchivarResult {
  query: string;
  source: string;
  quotes: ArchivarQuote[];
  summary: string;
}

export interface ArchivarQuote {
  date: string;
  content: string;
  source: string;
  lineNumber?: number;
}

export interface CacheStats {
  tier1Documents: number;
  tier1Tokens: number;
  tier1Ready: boolean;
  lastSync: string | null;
  budgetUsedPercent: number;
}

// ================================
// TIER 1 Configuration
// ================================

export const TIER1_CONFIG: Omit<Tier1Document, 'content'>[] = [
  {
    name: 'CHRONOLOGIE_100_PUNKTE.txt',
    priority: 1,
    description: 'Strukturierte Beziehungs-Chronologie Punkte 1-100',
    estimatedTokens: 18000,
  },
  {
    name: 'BEZIEHUNGSANALYSE_ERWEITERUNG_FEB2026.txt',
    priority: 2,
    description: 'Chronologie-Erweiterung Punkte 101-150',
    estimatedTokens: 4500,
  },
  {
    name: 'beziehungsstand_full.txt',
    priority: 3,
    description: 'Agnes-Definition, Tom 3000, Regeln, vollständiger Kontext',
    estimatedTokens: 55000,
  },
  {
    name: 'ergaenzungen.txt',
    priority: 4,
    description: 'Therapeutische Tools: 4-Elemente-Plan, Gaslighting, Erfolge',
    estimatedTokens: 5000,
  },
  {
    name: 'KOMMUNIKATIONS_VERGLEICHSANALYSE.txt',
    priority: 5,
    description: 'Wissenschaftliche Kommunikationsmuster mit Quellenzitationen',
    estimatedTokens: 6000,
  },
];

// ================================
// TIER 2 Configuration
// ================================

export const TIER2_CONFIG: Record<string, Record<string, Tier2Document>> = {
  kommunikation: {
    whatsapp_liisa_inland: {
      path: 'whatsapp_named/Liisa Inland.txt',
      description: 'WhatsApp 2014-2026, 13 Jahre Kommunikation',
      triggers: ['kommunikation von', 'whatsapp', 'nachricht vom', 'zeig mir', 'was hat sie geschrieben'],
      category: 'kommunikation',
    },
    whatsapp_liisa: {
      path: 'whatsapp_named/Liisa.txt',
      description: 'Aktuelle WhatsApp-Kommunikation',
      triggers: ['aktuelle whatsapp', 'neueste nachrichten', 'letzte nachricht'],
      category: 'kommunikation',
    },
    imessages: {
      path: 'iMessages_Tom_Liisa.txt',
      description: '3.549 iMessages 2019-2025',
      triggers: ['imessage', 'sms', 'textnachricht'],
      category: 'kommunikation',
    },
    gmail_liisa: {
      path: 'gmail_liisa_komplett.txt',
      description: '358 E-Mails von Liisa',
      triggers: ['email', 'e-mail', 'mail von liisa'],
      category: 'kommunikation',
    },
  },
  freundeskreis: {
    una: {
      path: 'whatsapp_named/Una (una).txt',
      description: 'Una-Kommunikation und Konflikt',
      triggers: ['una', 'freundin una', 'una-konflikt'],
      category: 'freundeskreis',
    },
    larissa: {
      path: 'whatsapp_named/Larissa.txt',
      description: 'Larissa-Kommunikation',
      triggers: ['larissa', 'larissa-konflikt'],
      category: 'freundeskreis',
    },
    stammtisch: {
      path: 'whatsapp_named/Stammtisch (4).txt',
      description: 'Freundeskreis-Dynamik',
      triggers: ['stammtisch', 'freundeskreis', 'freunde'],
      category: 'freundeskreis',
    },
  },
  familie: {
    familie: {
      path: 'whatsapp_named/Familie.txt',
      description: 'Familiendynamik Tom',
      triggers: ['familie', 'toms familie', 'eltern'],
      category: 'familie',
    },
  },
};

// ================================
// Knowledge Cache Manager
// ================================

class KnowledgeCacheManager {
  private tier1Cache: Map<string, Tier1Document> = new Map();
  private tier2Index: Map<string, Tier2Document> = new Map();
  private lastSync: Date | null = null;
  private isInitialized = false;

  // Static content storage (loaded from localStorage or API)
  private staticContent: Map<string, string> = new Map();

  // ================================
  // Initialization
  // ================================

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('📚 Initialisiere AGNES 3000 Knowledge Cache...');

    // Try to load from localStorage first
    const cached = localStorage.getItem('agnes3000_tier1_cache');
    let loadedFromCache = false;

    if (cached) {
      try {
        const data = JSON.parse(cached);
        this.tier1Cache = new Map(Object.entries(data.documents));
        this.lastSync = data.lastSync ? new Date(data.lastSync) : null;
        loadedFromCache = this.tier1Cache.size === TIER1_CONFIG.length;
        if (loadedFromCache) {
          console.log(`  ✓ Cache aus localStorage geladen (${this.tier1Cache.size} Dokumente)`);
        }
      } catch (e) {
        console.warn('  ⚠️ Konnte Cache nicht laden, verwende eingebettete Daten');
      }
    }

    // Auto-load from embedded content if cache is empty or incomplete
    if (!loadedFromCache && Object.keys(TIER1_EMBEDDED_CONTENT).length > 0) {
      console.log('  📥 Lade eingebettete TIER 1 Dokumente...');
      this.loadAllTier1FromContent(TIER1_EMBEDDED_CONTENT);
      console.log(`  ✓ ${Object.keys(TIER1_EMBEDDED_CONTENT).length} Dokumente aus Bundle geladen`);
    }

    // Build TIER 2 index
    this.buildTier2Index();

    this.isInitialized = true;
  }

  private buildTier2Index(): void {
    Object.entries(TIER2_CONFIG).forEach(([category, documents]) => {
      Object.entries(documents).forEach(([key, doc]) => {
        this.tier2Index.set(key, doc);
      });
    });
    console.log(`  ✓ TIER 2 Index: ${this.tier2Index.size} Dokumente registriert`);
  }

  // ================================
  // TIER 1 - Cache Management
  // ================================

  setTier1Content(name: string, content: string): void {
    const config = TIER1_CONFIG.find(c => c.name === name);
    if (!config) {
      console.warn(`Unbekanntes TIER 1 Dokument: ${name}`);
      return;
    }

    this.tier1Cache.set(name, {
      ...config,
      content,
      hash: this.simpleHash(content),
      loadedAt: new Date().toISOString(),
    });

    this.saveToLocalStorage();
  }

  loadAllTier1FromContent(documents: Record<string, string>): void {
    Object.entries(documents).forEach(([name, content]) => {
      this.setTier1Content(name, content);
    });
    this.lastSync = new Date();
    this.saveToLocalStorage();
    console.log(`✓ ${Object.keys(documents).length} TIER 1 Dokumente geladen`);
  }

  private saveToLocalStorage(): void {
    try {
      const data = {
        documents: Object.fromEntries(this.tier1Cache),
        lastSync: this.lastSync?.toISOString(),
      };
      localStorage.setItem('agnes3000_tier1_cache', JSON.stringify(data));
    } catch (e) {
      console.warn('Konnte Cache nicht in localStorage speichern:', e);
    }
  }

  private simpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  // ================================
  // Get Cached Context for Prompt Caching
  // ================================

  getTier1CachedContext(): string {
    if (this.tier1Cache.size === 0) {
      console.warn('⚠️ TIER 1 Cache ist leer!');
      return '';
    }

    const parts: string[] = [];

    // Header
    parts.push('=' .repeat(80));
    parts.push('AGNES 3000 - WISSENSDATENBANK (TIER 1 CACHE)');
    parts.push(`Geladen: ${this.lastSync?.toLocaleString('de-DE') || 'Unbekannt'}`);
    parts.push('=' .repeat(80));
    parts.push('');

    // Sort by priority
    const sortedDocs = Array.from(this.tier1Cache.values())
      .sort((a, b) => a.priority - b.priority);

    for (const doc of sortedDocs) {
      parts.push('');
      parts.push('=' .repeat(80));
      parts.push(`DOKUMENT: ${doc.name}`);
      parts.push(`BESCHREIBUNG: ${doc.description}`);
      parts.push('=' .repeat(80));
      parts.push('');
      parts.push(doc.content);
    }

    return parts.join('\n');
  }

  /**
   * Builds system prompt blocks with cache_control for Anthropic API
   * Use this with client.messages.create({ system: buildCacheBlocks() })
   */
  buildCacheBlocks(): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
    const blocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = [];

    // Block 1: Agnes Character & Rules (first 8000 chars of beziehungsstand)
    const beziehungsstand = this.tier1Cache.get('beziehungsstand_full.txt');
    if (beziehungsstand) {
      blocks.push({
        type: 'text',
        text: `Du bist AGNES 3000 - eine optimierte, weise Version der Paartherapeutin Agnes.

DEINE WISSENSBASIS ENTHÄLT:
1. Chronologie (150 Punkte) - Die komplette Beziehungsgeschichte
2. Therapeutische Tools - 4-Elemente-Plan, SOS-Karten, Mantras
3. Kommunikationsmuster - Wissenschaftliche Analyse über 13 Jahre
4. Bindungsstile und Dynamiken

AGNES-CHARAKTER UND REGELN:
${beziehungsstand.content.substring(0, 8000)}
`,
        cache_control: { type: 'ephemeral' },
      });
    }

    // Block 2: Chronologie (cached)
    const chronologie = this.tier1Cache.get('CHRONOLOGIE_100_PUNKTE.txt');
    const erweiterung = this.tier1Cache.get('BEZIEHUNGSANALYSE_ERWEITERUNG_FEB2026.txt');

    if (chronologie || erweiterung) {
      blocks.push({
        type: 'text',
        text: `
CHRONOLOGIE DER BEZIEHUNG (Punkte 1-150):

${chronologie?.content || ''}

${erweiterung?.content || ''}
`,
        cache_control: { type: 'ephemeral' },
      });
    }

    // Block 3: Therapeutic Tools (cached)
    const ergaenzungen = this.tier1Cache.get('ergaenzungen.txt');
    const kommunikation = this.tier1Cache.get('KOMMUNIKATIONS_VERGLEICHSANALYSE.txt');

    if (ergaenzungen || kommunikation) {
      blocks.push({
        type: 'text',
        text: `
THERAPEUTISCHE TOOLS & ERKENNTNISSE:

${ergaenzungen?.content || ''}

KOMMUNIKATIONSMUSTER:

${kommunikation?.content || ''}
`,
        cache_control: { type: 'ephemeral' },
      });
    }

    return blocks;
  }

  // ================================
  // Statistics
  // ================================

  getStats(): CacheStats {
    const totalTokens = Array.from(this.tier1Cache.values())
      .reduce((sum, doc) => sum + doc.estimatedTokens, 0);

    const maxTokens = 100000;

    return {
      tier1Documents: this.tier1Cache.size,
      tier1Tokens: totalTokens,
      tier1Ready: this.tier1Cache.size === TIER1_CONFIG.length,
      lastSync: this.lastSync?.toISOString() || null,
      budgetUsedPercent: (totalTokens / maxTokens) * 100,
    };
  }

  // ================================
  // TIER 2 - Archivar
  // ================================

  detectArchivarNeed(userMessage: string): Tier2Document | null {
    const lowerMessage = userMessage.toLowerCase();

    for (const [_key, doc] of this.tier2Index) {
      for (const trigger of doc.triggers) {
        if (lowerMessage.includes(trigger.toLowerCase())) {
          return doc;
        }
      }
    }

    return null;
  }

  /**
   * Generates a proactive suggestion for the archivar
   * Call this after each user message to check if archive data would help
   */
  getProactiveSuggestion(userMessage: string, context: string): string | null {
    const doc = this.detectArchivarNeed(userMessage);
    if (!doc) return null;

    return `[ARCHIVAR-HINWEIS: Für diese Anfrage könnten relevante Daten aus "${doc.description}" hilfreich sein. Soll ich im Archiv nach "${doc.path}" suchen?]`;
  }
}

// ================================
// Archivar (Haiku)
// ================================

export class Archivar {
  private client: Anthropic;
  private cacheManager: KnowledgeCacheManager;

  constructor(apiKey: string, cacheManager: KnowledgeCacheManager) {
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
    this.cacheManager = cacheManager;
  }

  async search(query: string, documentContent: string, source: string): Promise<ArchivarResult> {
    const prompt = `Du bist der ARCHIVAR für die agnes3000 Paartherapie-App.

Durchsuche das folgende Archiv-Dokument nach Informationen zur Anfrage.

ANFRAGE: "${query}"

DOKUMENT (${source}):
---
${documentContent.substring(0, 50000)}
---

AUFGABE:
1. Finde die relevantesten Stellen
2. Extrahiere max. 5 präzise Zitate mit Datum
3. Fasse kurz zusammen

Antworte als JSON:
{
  "quotes": [
    { "date": "DD.MM.YYYY", "content": "Zitat...", "source": "${source}" }
  ],
  "summary": "Kurze Zusammenfassung..."
}`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-haiku-3-5-20241022',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            query,
            source,
            quotes: parsed.quotes || [],
            summary: parsed.summary || '',
          };
        }
      }
    } catch (error) {
      console.error('Archivar search error:', error);
    }

    return {
      query,
      source,
      quotes: [],
      summary: 'Keine relevanten Informationen gefunden.',
    };
  }
}

// ================================
// Singleton Export
// ================================

export const knowledgeCache = new KnowledgeCacheManager();

// ================================
// Sync Utility
// ================================

/**
 * Loads TIER 1 documents from provided content
 * Call this with content loaded via file input or fetch
 */
export async function syncTier1Documents(documents: Record<string, string>): Promise<void> {
  await knowledgeCache.initialize();
  knowledgeCache.loadAllTier1FromContent(documents);
}

/**
 * Creates a file input handler for uploading TIER 1 documents
 */
export function createUploadHandler(): (files: FileList) => Promise<void> {
  return async (files: FileList) => {
    const documents: Record<string, string> = {};

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const content = await file.text();
      documents[file.name] = content;
    }

    await syncTier1Documents(documents);
  };
}

// Default export
export default knowledgeCache;
