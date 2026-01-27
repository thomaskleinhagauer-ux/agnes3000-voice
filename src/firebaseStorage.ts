// ================================
// IMAGO VOICE - Firebase Cloud Storage Layer
// ================================

import { doc, setDoc, getDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { AppState } from './types';

const COLLECTION_NAME = 'userData';

export const saveToFirebase = async (userId: string, data: AppState): Promise<boolean> => {
  try {
    const db = getFirebaseDb();
    if (!db) return false;

    const docRef = doc(db, COLLECTION_NAME, userId);
    await setDoc(docRef, {
      ...data,
      lastSync: Date.now()
    });

    return true;
  } catch (error) {
    console.error('Firebase save error:', error);
    return false;
  }
};

export const loadFromFirebase = async (userId: string): Promise<AppState | null> => {
  try {
    const db = getFirebaseDb();
    if (!db) return null;

    const docRef = doc(db, COLLECTION_NAME, userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as AppState;
    }

    return null;
  } catch (error) {
    console.error('Firebase load error:', error);
    return null;
  }
};

export const subscribeToFirebase = (
  userId: string,
  callback: (data: AppState | null) => void
): Unsubscribe | null => {
  try {
    const db = getFirebaseDb();
    if (!db) return null;

    const docRef = doc(db, COLLECTION_NAME, userId);

    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data() as AppState);
      } else {
        callback(null);
      }
    });
  } catch (error) {
    console.error('Firebase subscribe error:', error);
    return null;
  }
};

export const mergeFirebaseData = (local: AppState, remote: AppState): AppState => {
  // Merge strategy: remote wins for settings, merge arrays by ID
  return {
    settings: remote.settings,
    messages: {
      paar: mergeMessageArrays(local.messages.paar, remote.messages.paar),
      tom: mergeMessageArrays(local.messages.tom, remote.messages.tom),
      lisa: mergeMessageArrays(local.messages.lisa, remote.messages.lisa),
      assessment: mergeMessageArrays(local.messages.assessment, remote.messages.assessment),
    },
    documents: mergeByField(local.documents, remote.documents, 'updatedAt'),
    strategies: mergeByField(local.strategies, remote.strategies, 'updatedAt'),
    sessions: mergeByField(local.sessions, remote.sessions, 'startTime'),
    archivedMessages: mergeArchivedMessages(local.archivedMessages, remote.archivedMessages),
    roomMessages: mergeByField(local.roomMessages, remote.roomMessages, 'timestamp'),
    emotionHistory: [...local.emotionHistory, ...remote.emotionHistory]
      .filter((v, i, a) => a.findIndex(t => t.timestamp === v.timestamp) === i)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 1000), // Keep last 1000 emotion analyses
  };
};

const mergeMessageArrays = <T extends { id: string; timestamp: number }>(
  local: T[],
  remote: T[]
): T[] => {
  const merged = new Map<string, T>();

  local.forEach(item => merged.set(item.id, item));
  remote.forEach(item => {
    const existing = merged.get(item.id);
    if (!existing || item.timestamp > existing.timestamp) {
      merged.set(item.id, item);
    }
  });

  return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
};

const mergeByField = <T extends { id: string }>(
  local: T[],
  remote: T[],
  compareField: keyof T
): T[] => {
  const merged = new Map<string, T>();

  local.forEach(item => merged.set(item.id, item));
  remote.forEach(item => {
    const existing = merged.get(item.id);
    if (!existing || (item[compareField] as number) > (existing[compareField] as number)) {
      merged.set(item.id, item);
    }
  });

  return Array.from(merged.values());
};

// Special merge for ArchivedMessage (uses sessionId instead of id)
import { ArchivedMessage } from './types';

const mergeArchivedMessages = (
  local: ArchivedMessage[],
  remote: ArchivedMessage[]
): ArchivedMessage[] => {
  const merged = new Map<string, ArchivedMessage>();

  local.forEach(item => merged.set(item.sessionId, item));
  remote.forEach(item => {
    // Remote wins for same sessionId (later sync is assumed more complete)
    merged.set(item.sessionId, item);
  });

  return Array.from(merged.values());
};
