// ================================
// IMAGO VOICE - Knowledge Optimizer
// KI-gestützte Wissensdatenbank-Optimierung
// ================================

import { AppState, Document, StrategyDocument, Message, RoomType } from './types';

// Constants
export const MAX_BACKPACK_SIZE = 128 * 1024; // 128K in bytes
export const CHARS_PER_TOKEN = 4; // Approximate: 1 token ≈ 4 chars

// ================================
// Size Calculation
// ================================

export interface KnowledgeStats {
  totalBytes: number;
  totalChars: number;
  estimatedTokens: number;
  documentsSize: number;
  strategiesSize: number;
  messagesSize: number;
  breakdown: {
    documents: { count: number; size: number };
    strategies: { count: number; size: number };
    messages: { [key in RoomType]: { count: number; size: number } };
  };
  needsOptimization: boolean;
  backpacksNeeded: number;
}

export const calculateKnowledgeStats = (state: AppState): KnowledgeStats => {
  // Calculate document sizes
  const documentsJson = JSON.stringify(state.documents);
  const strategiesJson = JSON.stringify(state.strategies);

  // Calculate message sizes per room
  const messagesSizes: { [key in RoomType]: { count: number; size: number } } = {
    paar: { count: state.messages.paar.length, size: JSON.stringify(state.messages.paar).length },
    tom: { count: state.messages.tom.length, size: JSON.stringify(state.messages.tom).length },
    lisa: { count: state.messages.lisa.length, size: JSON.stringify(state.messages.lisa).length },
    assessment: { count: state.messages.assessment.length, size: JSON.stringify(state.messages.assessment).length },
  };

  const totalMessagesSize = Object.values(messagesSizes).reduce((sum, m) => sum + m.size, 0);
  const totalChars = documentsJson.length + strategiesJson.length + totalMessagesSize;
  const totalBytes = new Blob([documentsJson, strategiesJson, JSON.stringify(state.messages)]).size;

  return {
    totalBytes,
    totalChars,
    estimatedTokens: Math.ceil(totalChars / CHARS_PER_TOKEN),
    documentsSize: documentsJson.length,
    strategiesSize: strategiesJson.length,
    messagesSize: totalMessagesSize,
    breakdown: {
      documents: { count: state.documents.length, size: documentsJson.length },
      strategies: { count: state.strategies.length, size: strategiesJson.length },
      messages: messagesSizes,
    },
    needsOptimization: totalBytes > MAX_BACKPACK_SIZE,
    backpacksNeeded: Math.ceil(totalBytes / MAX_BACKPACK_SIZE),
  };
};

// ================================
// Backpack Splitting
// ================================

export interface Backpack {
  id: number;
  content: string;
  size: number;
  items: BackpackItem[];
}

export interface BackpackItem {
  type: 'document' | 'strategy' | 'message';
  id: string;
  title?: string;
  size: number;
  content: string;
}

export const splitIntoBackpacks = (state: AppState): Backpack[] => {
  const backpacks: Backpack[] = [];
  let currentBackpack: Backpack = { id: 1, content: '', size: 0, items: [] };

  // Helper to add item to backpack
  const addToBackpack = (item: BackpackItem) => {
    if (currentBackpack.size + item.size > MAX_BACKPACK_SIZE) {
      // Start new backpack
      backpacks.push(currentBackpack);
      currentBackpack = {
        id: backpacks.length + 1,
        content: '',
        size: 0,
        items: []
      };
    }
    currentBackpack.items.push(item);
    currentBackpack.content += item.content + '\n---\n';
    currentBackpack.size += item.size;
  };

  // Add documents
  state.documents.forEach(doc => {
    const content = `[DOC:${doc.id}] ${doc.title}\n${doc.content}`;
    addToBackpack({
      type: 'document',
      id: doc.id,
      title: doc.title,
      size: content.length,
      content,
    });
  });

  // Add strategies
  state.strategies.forEach(strategy => {
    const content = `[STRATEGY:${strategy.id}] ${strategy.title}\n${strategy.content}`;
    addToBackpack({
      type: 'strategy',
      id: strategy.id,
      title: strategy.title,
      size: content.length,
      content,
    });
  });

  // Add messages (grouped by room)
  (Object.keys(state.messages) as RoomType[]).forEach(room => {
    const roomMessages = state.messages[room];
    if (roomMessages.length > 0) {
      const content = `[MESSAGES:${room}]\n` + roomMessages.map(m =>
        `${m.role}${m.speaker ? ` (${m.speaker})` : ''}: ${m.content}`
      ).join('\n');
      addToBackpack({
        type: 'message',
        id: `messages-${room}`,
        title: `Nachrichten: ${room}`,
        size: content.length,
        content,
      });
    }
  });

  // Push last backpack if not empty
  if (currentBackpack.items.length > 0) {
    backpacks.push(currentBackpack);
  }

  return backpacks;
};

// ================================
// Duplicate Detection
// ================================

export interface DuplicateGroup {
  hash: string;
  items: DuplicateItem[];
  suggestedReference: string;
  canOptimize: boolean;
  reason?: string;
}

export interface DuplicateItem {
  type: 'document' | 'strategy' | 'message';
  id: string;
  title?: string;
  content: string;
  timestamp?: number;
}

// Simple hash function for content comparison
const hashContent = (content: string): string => {
  const normalized = content.toLowerCase().trim().replace(/\s+/g, ' ');
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
};

// Similarity check (Jaccard similarity on word sets)
const calculateSimilarity = (text1: string, text2: string): number => {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
};

export const findDuplicates = (state: AppState): DuplicateGroup[] => {
  const duplicateGroups: DuplicateGroup[] = [];
  const contentMap = new Map<string, DuplicateItem[]>();

  // Collect all items with their content
  const allItems: DuplicateItem[] = [];

  // Documents
  state.documents.forEach(doc => {
    allItems.push({
      type: 'document',
      id: doc.id,
      title: doc.title,
      content: doc.content,
      timestamp: doc.createdAt,
    });
  });

  // Strategies
  state.strategies.forEach(strategy => {
    allItems.push({
      type: 'strategy',
      id: strategy.id,
      title: strategy.title,
      content: strategy.content,
      timestamp: strategy.createdAt,
    });
  });

  // Messages
  (Object.keys(state.messages) as RoomType[]).forEach(room => {
    state.messages[room].forEach(msg => {
      allItems.push({
        type: 'message',
        id: msg.id,
        content: msg.content,
        timestamp: msg.timestamp,
      });
    });
  });

  // Group by hash
  allItems.forEach(item => {
    const hash = hashContent(item.content);
    if (!contentMap.has(hash)) {
      contentMap.set(hash, []);
    }
    contentMap.get(hash)!.push(item);
  });

  // Find groups with multiple items (potential duplicates)
  contentMap.forEach((items, hash) => {
    if (items.length > 1) {
      // Check if they are truly similar (not just hash collision)
      const firstContent = items[0].content;
      const allSimilar = items.every(item =>
        calculateSimilarity(firstContent, item.content) > 0.9
      );

      if (allSimilar) {
        // Sort by timestamp (oldest first)
        items.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        // Check if optimization is safe
        const hasAdditionalContext = items.some(item => {
          // Check for unique contextual information
          const otherContents = items.filter(i => i.id !== item.id).map(i => i.content);
          const uniqueWords = item.content.split(/\s+/).filter(word =>
            !otherContents.some(c => c.includes(word))
          );
          return uniqueWords.length > item.content.split(/\s+/).length * 0.1;
        });

        duplicateGroups.push({
          hash,
          items,
          suggestedReference: `[REF:${items[0].id}:${items.length}x]`,
          canOptimize: !hasAdditionalContext,
          reason: hasAdditionalContext
            ? 'Enthält zusätzlichen Kontext der nicht optimiert werden kann'
            : undefined,
        });
      }
    }
  });

  return duplicateGroups;
};

// ================================
// Optimization Result
// ================================

export interface OptimizationResult {
  originalSize: number;
  optimizedSize: number;
  savingsBytes: number;
  savingsPercent: number;
  optimizedState: AppState;
  duplicatesFound: number;
  duplicatesOptimized: number;
  skippedWithContext: number;
  fitsInSingleBackpack: boolean;
  requiresManualEdit: boolean;
  report: string;
}

export const optimizeKnowledge = (
  state: AppState,
  duplicateGroups: DuplicateGroup[]
): OptimizationResult => {
  const originalStats = calculateKnowledgeStats(state);
  let optimizedState = { ...state };
  let duplicatesOptimized = 0;
  let skippedWithContext = 0;

  // Process duplicate groups
  duplicateGroups.forEach(group => {
    if (group.canOptimize && group.items.length > 1) {
      // Keep first item, remove or reference others
      const [keepItem, ...removeItems] = group.items;

      removeItems.forEach(item => {
        if (item.type === 'document') {
          optimizedState = {
            ...optimizedState,
            documents: optimizedState.documents.filter(d => d.id !== item.id),
          };
        } else if (item.type === 'strategy') {
          optimizedState = {
            ...optimizedState,
            strategies: optimizedState.strategies.filter(s => s.id !== item.id),
          };
        }
        // Messages are typically not removed but could be marked
        duplicatesOptimized++;
      });
    } else {
      skippedWithContext += group.items.length;
    }
  });

  const optimizedStats = calculateKnowledgeStats(optimizedState);
  const savingsBytes = originalStats.totalBytes - optimizedStats.totalBytes;

  // Generate report
  const report = generateOptimizationReport(
    originalStats,
    optimizedStats,
    duplicateGroups,
    duplicatesOptimized,
    skippedWithContext
  );

  return {
    originalSize: originalStats.totalBytes,
    optimizedSize: optimizedStats.totalBytes,
    savingsBytes,
    savingsPercent: (savingsBytes / originalStats.totalBytes) * 100,
    optimizedState,
    duplicatesFound: duplicateGroups.reduce((sum, g) => sum + g.items.length, 0),
    duplicatesOptimized,
    skippedWithContext,
    fitsInSingleBackpack: optimizedStats.totalBytes <= MAX_BACKPACK_SIZE,
    requiresManualEdit: optimizedStats.totalBytes > MAX_BACKPACK_SIZE,
    report,
  };
};

const generateOptimizationReport = (
  original: KnowledgeStats,
  optimized: KnowledgeStats,
  duplicates: DuplicateGroup[],
  optimizedCount: number,
  skippedCount: number
): string => {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return `
# Optimierungsbericht

## Vorher
- Gesamtgröße: ${formatSize(original.totalBytes)}
- Geschätzte Tokens: ~${original.estimatedTokens.toLocaleString()}
- Benötigte Rucksäcke: ${original.backpacksNeeded}

## Nachher
- Gesamtgröße: ${formatSize(optimized.totalBytes)}
- Geschätzte Tokens: ~${optimized.estimatedTokens.toLocaleString()}
- Benötigte Rucksäcke: ${optimized.backpacksNeeded}

## Einsparung
- ${formatSize(original.totalBytes - optimized.totalBytes)} (${((original.totalBytes - optimized.totalBytes) / original.totalBytes * 100).toFixed(1)}%)

## Duplikate
- Gefunden: ${duplicates.length} Gruppen
- Optimiert: ${optimizedCount} Einträge
- Beibehalten (zusätzlicher Kontext): ${skippedCount} Einträge

## Status
${optimized.totalBytes <= MAX_BACKPACK_SIZE
  ? '✅ Passt in einen 128K Rucksack!'
  : '⚠️ Manuelle Bearbeitung empfohlen - noch zu groß für einen Rucksack'}
`.trim();
};

// ================================
// AI-Assisted Analysis
// ================================

export interface AIAnalysisRequest {
  backpackContent: string;
  backpackId: number;
}

export const generateAIAnalysisPrompt = (backpack: Backpack): string => {
  return `Analysiere diesen Wissensrucksack auf Duplikate und Optimierungsmöglichkeiten.

WICHTIGE REGELN:
1. Menschlicher Kontext ist GRÖSSER als dem Model bewusst sein kann
2. Fakten die nicht verstanden werden, sind NICHT optimierbar
3. Nicht verstandene Informationen müssen als Zeichenketten belassen werden
4. Nur EXAKT gleiche Inhalte können mit Referenzzahlen zusammengefasst werden
5. Bei Mustern/Wiederholungen: Datum oder Wiederkehr angeben, aber NUR wenn kein zusätzlicher Kontext vorliegt

RUCKSACK INHALT (${backpack.id}/${backpack.size} bytes):
---
${backpack.content}
---

Gib deine Analyse als JSON zurück:
{
  "duplicates": [
    { "ids": ["id1", "id2"], "suggestion": "Zusammenfassen zu...", "safe": true/false, "reason": "..." }
  ],
  "patterns": [
    { "description": "...", "count": N, "canReference": true/false }
  ],
  "unknownFacts": [
    { "content": "...", "reason": "Nicht optimierbar weil..." }
  ],
  "estimatedSavings": "X KB",
  "confidence": 0.0-1.0
}`;
};

// ================================
// Merge Backpacks
// ================================

export const mergeBackpacks = (backpacks: Backpack[]): Backpack | null => {
  const totalSize = backpacks.reduce((sum, bp) => sum + bp.size, 0);

  if (totalSize > MAX_BACKPACK_SIZE) {
    return null; // Cannot merge - too large
  }

  return {
    id: 1,
    content: backpacks.map(bp => bp.content).join('\n===BACKPACK===\n'),
    size: totalSize,
    items: backpacks.flatMap(bp => bp.items),
  };
};
