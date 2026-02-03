// ================================
// IMAGO VOICE - Type Definitions
// ================================

export type RoomType = 'paar' | 'tom' | 'lisa' | 'assessment';
export type ViewType = 'rooms' | 'documents' | 'history' | 'settings' | 'messages' | 'backup';
export type SpeakerType = 'tom' | 'lisa';
// AI Response emotions (for therapist avatar)
export type AIEmotionType = 'neutral' | 'empathetic' | 'encouraging' | 'concerned' | 'thoughtful' | 'proud' | 'sad';

// Face-api detected emotions (for user camera)
export type FaceEmotionType = 'angry' | 'disgusted' | 'fearful' | 'happy' | 'neutral' | 'sad' | 'surprised';

// Combined emotion type for backward compatibility
export type EmotionType = AIEmotionType;

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  speaker?: SpeakerType; // For Paar-Raum: who is speaking
  emotion?: EmotionType; // Detected emotion for avatar
}

export interface Document {
  id: string;
  title: string;
  content: string;
  type: 'note' | 'strategy' | 'summary' | 'pdf';
  person?: 'tom' | 'lisa' | 'both';
  createdAt: number;
  updatedAt: number;
  isArchived?: boolean;
}

export interface StrategyDocument extends Document {
  type: 'strategy';
  person: 'tom' | 'lisa';
  assessmentNumber: number;
  questions: AssessmentQuestion[];
  answers: Record<string, string>;
}

export interface AssessmentQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface SessionMetadata {
  id: string;
  room: RoomType;
  startTime: number;
  endTime?: number;
  duration: number;
  goal?: string;
  participants: string[];
  messageCount: number;
  // Note: actual message content stored separately for privacy
}

export interface ArchivedMessage {
  sessionId: string;
  messages: Message[];
}

export interface RoomMessage {
  id: string;
  from: RoomType;
  to: RoomType;
  content: string;
  timestamp: number;
  isRead: boolean;
  summary?: string; // AI-generated summary
}

export interface EmotionAnalysis {
  tom?: {
    emotion: string;
    confidence: number;
    bodyLanguage?: string[];
  };
  lisa?: {
    emotion: string;
    confidence: number;
    bodyLanguage?: string[];
  };
  timestamp: number;
}

export interface Settings {
  // User names
  user1Name: string;
  user2Name: string;

  // Passwords
  user1Password: string;
  user2Password: string;
  paarRoomPassword: string;

  // AI Provider
  aiProvider: 'claude' | 'gemini';
  claudeApiKey: string;
  claudeModel: 'claude-opus-4-5-20251101' | 'claude-sonnet-4-5-20250929';
  geminiApiKey: string;

  // Voice settings
  ttsEnabled: boolean;
  voicePaar: string;
  voiceTom: string;
  voiceLisa: string;

  // Therapy school
  therapySchool: TherapySchool;

  // Camera settings
  cameraEnabled: boolean;
  emotionTrackingEnabled: boolean;

  // Session defaults
  defaultSessionDuration: number; // minutes

  // Context Router (Vermittler-KI)
  contextRouterEnabled: boolean;
}

export type TherapySchool =
  | 'imago'
  | 'systemisch'
  | 'tantra-awareness'
  | 'gestalt'
  | 'gottman'
  | 'eft'
  | 'cbt'
  | 'psychodynamisch'
  | 'achtsamkeit'
  | 'loesungsorientiert';

export interface AppState {
  settings: Settings;
  messages: Record<RoomType, Message[]>;
  documents: Document[];
  strategies: StrategyDocument[];
  sessions: SessionMetadata[];
  archivedMessages: ArchivedMessage[];
  roomMessages: RoomMessage[];
  emotionHistory: EmotionAnalysis[];
}

// Firebase specific
export interface FirebaseUserData extends AppState {
  oderId: string;
  lastSync: number;
}

// Backup format
export interface BackupData extends AppState {
  version: string;
  exportedAt: number;
}
