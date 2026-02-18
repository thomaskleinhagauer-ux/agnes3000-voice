// ================================
// IMAGO VOICE - Local Storage Layer
// ================================

import { AppState, Settings, Message, Document, StrategyDocument, SessionMetadata, ArchivedMessage, RoomMessage, EmotionAnalysis, RoomType } from './types';

const STORAGE_KEY = 'imago-voice-data';
const BACKUP_RESTORE_FLAG = 'imago-voice-restore-flag';

// ================================
// Server Sync (Railway Backend)
// ================================

// Detect if we're running with a backend (same origin serves API)
const API_BASE = '';  // Same origin - works on Railway, empty for Vercel

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export const syncToServer = (state: AppState): void => {
  // Debounce: sync 3s after last state change
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      if (res.ok) {
        console.log('[Server Sync] State saved to server');
      }
    } catch {
      // Server not available (Vercel/local) - silently ignore
    }
  }, 3000);
};

export const loadFromServer = async (): Promise<AppState | null> => {
  try {
    const res = await fetch(`${API_BASE}/api/state`);
    if (res.ok) {
      const data = await res.json();
      console.log('[Server Sync] State loaded from server');
      return {
        ...defaultAppState,
        ...data,
        settings: { ...defaultSettings, ...data.settings },
        messages: {
          paar: data.messages?.paar || [],
          tom: data.messages?.tom || [],
          lisa: data.messages?.lisa || [],
          assessment: data.messages?.assessment || [],
        },
      };
    }
  } catch {
    // Server not available - use localStorage
  }
  return null;
};

export const defaultSettings: Settings = {
  user1Name: 'Tom',
  user2Name: 'Lisa',
  user1Password: '',
  user2Password: '',
  paarRoomPassword: '',
  aiProvider: 'claude',
  claudeApiKey: 'agnes3001',
  claudeModel: 'claude-opus-4-6',
  geminiApiKey: 'agnes3001',
  ttsEnabled: true,
  ttsSpeed: 1.0,
  voicePaar: 'Gacrux',
  voiceTom: 'Gacrux',
  voiceLisa: 'Kore',
  testMode: false,
  therapySchool: 'imago',
  cameraEnabled: false,
  emotionTrackingEnabled: false,
  defaultSessionDuration: 45,
  contextRouterEnabled: true,
};

export const defaultAppState: AppState = {
  settings: defaultSettings,
  messages: {
    paar: [],
    tom: [],
    lisa: [],
    assessment: [],
  },
  documents: [],
  strategies: [],
  sessions: [],
  archivedMessages: [],
  roomMessages: [],
  emotionHistory: [],
};

// ================================
// Local Storage Operations
// ================================

export const loadFromLocalStorage = (): AppState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to ensure all fields exist
      return {
        ...defaultAppState,
        ...parsed,
        settings: { ...defaultSettings, ...parsed.settings },
        messages: {
          paar: parsed.messages?.paar || [],
          tom: parsed.messages?.tom || [],
          lisa: parsed.messages?.lisa || [],
          assessment: parsed.messages?.assessment || [],
        },
      };
    }
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
  }
  return defaultAppState;
};

export const saveToLocalStorage = (state: AppState): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
    // Check if it's a quota exceeded error
    if (error instanceof DOMException && (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    )) {
      // Try to clear some space by removing old emotion history
      try {
        const reducedState = {
          ...state,
          emotionHistory: state.emotionHistory.slice(0, 100), // Keep only last 100
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reducedState));
        console.log('Reduced emotion history to save space');
        return true;
      } catch {
        console.error('Still unable to save - localStorage full');
      }
    }
    return false;
  }
};

// ================================
// Backup/Restore Helpers
// ================================

export const setRestoreFlag = (success: boolean): void => {
  sessionStorage.setItem(BACKUP_RESTORE_FLAG, success ? 'success' : 'failed');
};

export const getAndClearRestoreFlag = (): 'success' | 'failed' | null => {
  const flag = sessionStorage.getItem(BACKUP_RESTORE_FLAG) as 'success' | 'failed' | null;
  sessionStorage.removeItem(BACKUP_RESTORE_FLAG);
  return flag;
};

export const exportToJson = (state: AppState): string => {
  return JSON.stringify({
    ...state,
    version: '2.0.0',
    exportedAt: Date.now(),
  }, null, 2);
};

export const exportToBase64 = (state: AppState): string => {
  const json = exportToJson(state);
  return btoa(unescape(encodeURIComponent(json)));
};

export const importFromJson = (jsonString: string): AppState | null => {
  try {
    const parsed = JSON.parse(jsonString);
    return {
      ...defaultAppState,
      ...parsed,
      settings: { ...defaultSettings, ...parsed.settings },
    };
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    return null;
  }
};

export const importFromBase64 = (base64String: string): AppState | null => {
  try {
    const json = decodeURIComponent(escape(atob(base64String.trim())));
    return importFromJson(json);
  } catch (error) {
    console.error('Failed to decode Base64:', error);
    return null;
  }
};

export const smartImport = (input: string): AppState | null => {
  // Try Base64 first
  const base64Result = importFromBase64(input);
  if (base64Result) return base64Result;

  // Try raw JSON
  const jsonResult = importFromJson(input);
  if (jsonResult) return jsonResult;

  return null;
};

// ================================
// Message Helpers
// ================================

export const addMessage = (
  messages: Record<RoomType, Message[]>,
  room: RoomType,
  message: Message
): Record<RoomType, Message[]> => {
  return {
    ...messages,
    [room]: [...(messages[room] || []), message],
  };
};

export const clearRoomMessages = (
  messages: Record<RoomType, Message[]>,
  room: RoomType
): Record<RoomType, Message[]> => {
  return {
    ...messages,
    [room]: [],
  };
};

// ================================
// Document Helpers
// ================================

export const addDocument = (docs: Document[], doc: Document): Document[] => {
  return [...docs, doc];
};

export const updateDocument = (docs: Document[], docId: string, updates: Partial<Document>): Document[] => {
  return docs.map(d => d.id === docId ? { ...d, ...updates, updatedAt: Date.now() } : d);
};

export const deleteDocument = (docs: Document[], docId: string): Document[] => {
  return docs.filter(d => d.id !== docId);
};

// ================================
// Session Helpers
// ================================

export const createSession = (
  room: RoomType,
  duration: number,
  goal: string,
  participants: string[]
): SessionMetadata => {
  return {
    id: crypto.randomUUID(),
    room,
    startTime: Date.now(),
    duration,
    goal,
    participants,
    messageCount: 0,
  };
};

export const endSession = (session: SessionMetadata, messageCount: number): SessionMetadata => {
  return {
    ...session,
    endTime: Date.now(),
    messageCount,
  };
};

// ================================
// Room Message Helpers
// ================================

export const createRoomMessage = (
  from: RoomType,
  to: RoomType,
  content: string
): RoomMessage => {
  return {
    id: crypto.randomUUID(),
    from,
    to,
    content,
    timestamp: Date.now(),
    isRead: false,
  };
};

export const markMessageAsRead = (messages: RoomMessage[], messageId: string): RoomMessage[] => {
  return messages.map(m => m.id === messageId ? { ...m, isRead: true } : m);
};

export const getUnreadCount = (messages: RoomMessage[], room: RoomType): number => {
  return messages.filter(m => m.to === room && !m.isRead).length;
};
