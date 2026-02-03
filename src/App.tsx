// ================================
// IMAGO VOICE - Intelligente Paartherapie-Plattform
// Vollständige App mit allen 21 Features
// ================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import {
  Users, User, Lock, MessageSquare, FileText, Settings as SettingsIcon,
  Clock, Send, Mic, MicOff, Save, Download, Upload, Camera, CameraOff,
  Sparkles, Home, History, Cloud, ChevronRight, X, Check, Trash2,
  Edit3, Plus, RefreshCw, Volume2, VolumeX, AlertCircle, Archive, RotateCcw
} from 'lucide-react';

import {
  RoomType, ViewType, SpeakerType, EmotionType, Message, Document,
  StrategyDocument, SessionMetadata, RoomMessage, Settings, AssessmentQuestion,
  EmotionAnalysis, AppState
} from './types';

import {
  loadFromLocalStorage, saveToLocalStorage, defaultSettings,
  exportToJson, exportToBase64, smartImport, setRestoreFlag, getAndClearRestoreFlag,
  addMessage, clearRoomMessages, createSession, endSession, getUnreadCount
} from './storage';

import {
  ClaudeClient, GeminiClient, getSystemPrompt, getAssessmentPrompt,
  getStrategyPrompt, extractEmotion, removeEmotionTag, getEmotionAnalysisPrompt,
  GENERAL_PASSWORD_CHECK
} from './ai';

import {
  loadFaceApiModels,
  detectEmotionFromVideo,
  emotionToGerman,
  getEmotionSummary,
  FaceEmotionAnalysis,
  FaceEmotion
} from './emotionDetection';

import { AnimatedAvatar } from './AnimatedAvatar';

import { signInAnonymousUser } from './firebase';
import { saveToFirebase, loadFromFirebase } from './firebaseStorage';
import {
  calculateKnowledgeStats,
  splitIntoBackpacks,
  findDuplicates,
  optimizeKnowledge,
  mergeBackpacks,
  generateAIAnalysisPrompt,
  KnowledgeStats,
  Backpack,
  DuplicateGroup,
  OptimizationResult,
  MAX_BACKPACK_SIZE,
} from './knowledgeOptimizer';

import { routeContext, DEFAULT_ROUTER_CONFIG } from './contextRouter';

// ================================
// Constants
// ================================

// iOS Detection for TTS fallback
const isIOS = (() => {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
})();

// Emotion to Avatar mapping
const EMOTION_AVATARS: Record<EmotionType, string> = {
  neutral: '😐',
  empathetic: '🤗',
  encouraging: '😊',
  concerned: '😟',
  thoughtful: '🤔',
  proud: '🥹',
  sad: '😢',
};

// ================================
// Main App Component
// ================================

function App() {
  // ================================
  // State Management
  // ================================

  const [appState, setAppState] = useState<AppState>(() => loadFromLocalStorage());
  const [currentRoom, setCurrentRoom] = useState<RoomType | null>(null);
  const [activeView, setActiveView] = useState<ViewType>('rooms');
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  // Paar-Raum Speaker
  const [currentSpeaker, setCurrentSpeaker] = useState<SpeakerType>('tom');

  // Avatar Emotion
  const [avatarEmotion, setAvatarEmotion] = useState<EmotionType>('neutral');

  // Session
  const [activeSession, setActiveSession] = useState<SessionMetadata | null>(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionGoal, setSessionGoal] = useState('');
  const [sessionDuration, setSessionDuration] = useState(45);
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState<number | null>(null);

  // Password Modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [pendingRoom, setPendingRoom] = useState<RoomType | null>(null);

  // Assessment
  const [isAssessing, setIsAssessing] = useState(false);
  const [assessmentPerson, setAssessmentPerson] = useState<'tom' | 'lisa' | null>(null);
  const [assessmentQuestions, setAssessmentQuestions] = useState<AssessmentQuestion[]>([]);
  const [assessmentAnswers, setAssessmentAnswers] = useState<Record<string, string>>({});
  const [isGeneratingAssessment, setIsGeneratingAssessment] = useState(false);
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);
  const [showAssessmentPasswordModal, setShowAssessmentPasswordModal] = useState(false);
  const [assessmentPasswordInput, setAssessmentPasswordInput] = useState('');
  const [pendingStrategy, setPendingStrategy] = useState<{
    content: string;
    person: 'tom' | 'lisa';
    questions: AssessmentQuestion[];
    answers: Record<string, string>;
  } | null>(null);

  // Camera & Emotion Tracking
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [currentEmotionAnalysis, setCurrentEmotionAnalysis] = useState<EmotionAnalysis | null>(null);
  const [faceEmotion, setFaceEmotion] = useState<FaceEmotionAnalysis | null>(null);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Document Editor
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [showDocEditor, setShowDocEditor] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');

  // Firebase
  const [firebaseUserId, setFirebaseUserId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Backup Import
  const [importText, setImportText] = useState('');

  // KI-Optimierungs-Cockpit
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats | null>(null);
  const [backpacks, setBackpacks] = useState<Backpack[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showOptimizationReport, setShowOptimizationReport] = useState(false);
  const [selectedBackpack, setSelectedBackpack] = useState<number | null>(null);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);

  // Refs
  const claudeClientRef = useRef<ClaudeClient | null>(null);
  const geminiClientRef = useRef<GeminiClient | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const emotionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isRecordingRef = useRef(false);

  // Destructure settings for convenience
  const { settings, messages, documents, strategies, sessions, roomMessages } = appState;

  // ================================
  // Effects
  // ================================

  // Save to localStorage on state change
  useEffect(() => {
    saveToLocalStorage(appState);
  }, [appState]);

  // Initialize AI clients - always try to init, clients handle env var fallback
  useEffect(() => {
    if (settings.aiProvider === 'claude') {
      claudeClientRef.current = new ClaudeClient(settings.claudeApiKey || 'agnes3001', settings.claudeModel);
    }
    // Always init Gemini for TTS
    geminiClientRef.current = new GeminiClient(settings.geminiApiKey || 'agnes3001');
  }, [settings.aiProvider, settings.claudeApiKey, settings.claudeModel, settings.geminiApiKey]);

  // Check for restore flag on mount
  useEffect(() => {
    const restoreFlag = getAndClearRestoreFlag();
    if (restoreFlag === 'success') {
      toast.success('Backup erfolgreich wiederhergestellt!', { duration: 3000 });
    } else if (restoreFlag === 'failed') {
      toast.error('Backup-Wiederherstellung fehlgeschlagen', { duration: 3000 });
    }
  }, []);

  // Initialize Firebase with retry
  useEffect(() => {
    const initFirebase = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          const userId = await signInAnonymousUser();
          if (userId) {
            setFirebaseUserId(userId);
            // Try to load from Firebase
            const remoteData = await loadFromFirebase(userId);
            if (remoteData) {
              setAppState(prev => ({
                ...prev,
                ...remoteData,
                settings: { ...prev.settings, ...remoteData.settings },
              }));
            }
            return; // Success
          }
        } catch (error) {
          console.error(`Firebase init attempt ${i + 1} failed:`, error);
        }
        // Wait before retry (exponential backoff)
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
      }
      console.warn('Firebase init failed after retries');
    };
    initFirebase();
  }, []);

  // Session timer
  useEffect(() => {
    if (activeSession && sessionTimeRemaining !== null && sessionTimeRemaining > 0) {
      sessionTimerRef.current = setInterval(() => {
        setSessionTimeRemaining(prev => {
          if (prev !== null && prev > 0) {
            return prev - 1;
          }
          return prev;
        });
      }, 60000); // Update every minute
    }

    return () => {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
      }
    };
  }, [activeSession, sessionTimeRemaining]);

  // Load face-api models on mount
  useEffect(() => {
    loadFaceApiModels().then(loaded => {
      setFaceApiReady(loaded);
      if (loaded) {
        console.log('Face-api.js ready for emotion detection');
      }
    });
  }, []);

  // Emotion tracking interval using face-api.js - professional emotion detection
  useEffect(() => {
    if (isCameraOn && settings.emotionTrackingEnabled && faceApiReady && videoRef.current) {
      emotionIntervalRef.current = setInterval(async () => {
        if (!videoRef.current) return;

        // Use face-api.js for emotion detection (much faster and runs locally)
        const faceAnalysis = await detectEmotionFromVideo(videoRef.current);
        if (faceAnalysis) {
          setFaceEmotion(faceAnalysis);

          // Convert to legacy format for compatibility
          if (faceAnalysis.faceDetected) {
            const legacyAnalysis: EmotionAnalysis = {
              tom: currentRoom === 'tom' || currentRoom === 'paar' ? {
                emotion: faceAnalysis.dominant,
                confidence: faceAnalysis.confidence,
              } : undefined,
              lisa: currentRoom === 'lisa' ? {
                emotion: faceAnalysis.dominant,
                confidence: faceAnalysis.confidence,
              } : undefined,
              timestamp: faceAnalysis.timestamp,
            };
            setCurrentEmotionAnalysis(legacyAnalysis);
          }
        }
      }, 500); // face-api.js is fast enough for 500ms intervals
    }

    return () => {
      if (emotionIntervalRef.current) {
        clearInterval(emotionIntervalRef.current);
      }
    };
  }, [isCameraOn, settings.emotionTrackingEnabled, faceApiReady, currentRoom]);

  // ================================
  // Helper Functions
  // ================================

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else toast(message, { icon: '⚠️' });
  }, []);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setAppState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...updates },
    }));
  }, []);

  // ================================
  // Password System
  // ================================

  const checkPassword = useCallback((room: RoomType, inputPw: string): boolean => {
    // General password works for all rooms (dev-only)
    if (inputPw === GENERAL_PASSWORD_CHECK) return true;

    // Room-specific passwords
    if (room === 'paar') return !settings.paarRoomPassword || inputPw === settings.paarRoomPassword;
    if (room === 'tom') return inputPw === settings.user1Password;
    if (room === 'lisa') return inputPw === settings.user2Password;

    return false;
  }, [settings]);

  const attemptRoomEntry = useCallback((room: RoomType) => {
    // Assessment and Paar room might not need password
    if (room === 'assessment') {
      setCurrentRoom('assessment');
      setActiveView('rooms');
      return;
    }

    if (room === 'paar' && !settings.paarRoomPassword) {
      setCurrentRoom('paar');
      setActiveView('rooms');
      return;
    }

    // Need password for personal rooms
    if (room === 'tom' && !settings.user1Password) {
      showToast('Tom hat noch kein Assessment durchgeführt', 'warning');
      return;
    }
    if (room === 'lisa' && !settings.user2Password) {
      showToast('Lisa hat noch kein Assessment durchgeführt', 'warning');
      return;
    }

    setPendingRoom(room);
    setPasswordInput('');
    setShowPasswordModal(true);
  }, [settings, showToast]);

  const submitPassword = useCallback(() => {
    if (!pendingRoom) return;

    if (checkPassword(pendingRoom, passwordInput)) {
      setCurrentRoom(pendingRoom);
      setActiveView('rooms');
      setShowPasswordModal(false);
      setPendingRoom(null);
      setPasswordInput('');
    } else {
      // Wrong password = message to room owner
      if (pendingRoom !== 'paar' && passwordInput.trim()) {
        const newMessage: RoomMessage = {
          id: crypto.randomUUID(),
          from: currentRoom || 'paar',
          to: pendingRoom,
          content: passwordInput,
          timestamp: Date.now(),
          isRead: false,
        };
        setAppState(prev => ({
          ...prev,
          roomMessages: [...prev.roomMessages, newMessage],
        }));
        showToast(`Nachricht an ${pendingRoom === 'tom' ? settings.user1Name : settings.user2Name} gesendet`, 'success');
      } else {
        showToast('Falsches Passwort', 'error');
      }
      setShowPasswordModal(false);
      setPendingRoom(null);
      setPasswordInput('');
    }
  }, [pendingRoom, passwordInput, checkPassword, currentRoom, settings, showToast]);

  // ================================
  // Session Management
  // ================================

  const startSession = useCallback(() => {
    if (!currentRoom || currentRoom === 'assessment') return;

    const session = createSession(
      currentRoom,
      sessionDuration,
      sessionGoal,
      currentRoom === 'paar' ? [settings.user1Name, settings.user2Name] : [currentRoom === 'tom' ? settings.user1Name : settings.user2Name]
    );

    setActiveSession(session);
    setSessionTimeRemaining(sessionDuration);
    setAppState(prev => ({
      ...prev,
      sessions: [...prev.sessions, session],
    }));

    showToast(`Sitzung gestartet: ${sessionDuration} Minuten`, 'success');
  }, [currentRoom, sessionDuration, sessionGoal, settings, showToast]);

  const stopSession = useCallback(() => {
    if (!activeSession || !currentRoom) return;

    const messageCount = messages[currentRoom]?.length || 0;
    const ended = endSession(activeSession, messageCount);

    setAppState(prev => ({
      ...prev,
      sessions: prev.sessions.map(s => s.id === ended.id ? ended : s),
    }));

    setActiveSession(null);
    setSessionTimeRemaining(null);
    showToast('Sitzung beendet', 'success');
  }, [activeSession, currentRoom, messages, showToast]);

  // ================================
  // TTS (before sendMessage so it can be used as dependency)
  // ================================

  const playTTS = useCallback(async (text: string) => {
    if (!settings.ttsEnabled || !geminiClientRef.current) return;

    const voice = currentRoom === 'paar' ? settings.voicePaar :
                  currentRoom === 'tom' ? settings.voiceTom :
                  currentRoom === 'lisa' ? settings.voiceLisa :
                  settings.voicePaar;

    try {
      setIsSpeaking(true);
      const audioData = await geminiClientRef.current.generateTTS(text, voice);
      if (!audioData) {
        setIsSpeaking(false);
        return;
      }

      // iOS Fallback: Use HTMLAudioElement with user interaction handling
      if (isIOS) {
        try {
          const base64 = btoa(String.fromCharCode(...audioData));
          const audio = new Audio(`data:audio/wav;base64,${base64}`);
          (audio as any).playsInline = true; // iOS attribute
          audio.onended = () => setIsSpeaking(false);
          await audio.play();
        } catch (err) {
          console.error('iOS audio play error:', err);
          setIsSpeaking(false);
          // iOS requires user interaction for audio - show toast once
          if ((err as Error).name === 'NotAllowedError') {
            showToast('Tippe auf den Bildschirm um Audio zu aktivieren', 'warning');
          }
        }
        return;
      }

      // Desktop: Use Web Audio API
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000
        });
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const audioBuffer = ctx.createBuffer(1, audioData.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < audioData.length; i++) {
        channelData[i] = (audioData[i] - 128) / 128;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsSpeaking(false);
      source.start();

    } catch (error) {
      console.error('TTS error:', error);
      setIsSpeaking(false);
    }
  }, [settings, currentRoom, showToast]);

  // ================================
  // AI Chat
  // ================================

  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || !currentRoom || currentRoom === 'assessment') return;
    if (!claudeClientRef.current && !geminiClientRef.current) {
      showToast('Bitte API-Key in Einstellungen eingeben', 'error');
      return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputText.trim(),
      timestamp: Date.now(),
      speaker: currentRoom === 'paar' ? currentSpeaker : undefined,
    };

    setAppState(prev => ({
      ...prev,
      messages: addMessage(prev.messages, currentRoom, userMessage),
    }));
    setInputText('');
    setIsLoading(true);

    try {
      // Build context
      // Limit strategies to prevent token overflow (max ~30k chars = ~7.5k tokens)
      const MAX_STRATEGY_CHARS = 30000;
      let stratChars = 0;
      const relevantStrategies = strategies
        .filter(s => currentRoom === 'paar' || s.person === (currentRoom as 'tom' | 'lisa'))
        .sort((a, b) => b.updatedAt - a.updatedAt) // newest first
        .reduce((acc: string[], s) => {
          if (stratChars + s.content.length <= MAX_STRATEGY_CHARS) {
            stratChars += s.content.length;
            acc.push(s.content);
          }
          return acc;
        }, []);

      // Build document context - use Vermittler-KI (Context Router) for large KBs
      const activeDocs = documents.filter(d => !d.isArchived);
      const totalDocChars = activeDocs.reduce((sum, d) => sum + d.content.length, 0);
      let relevantDocs: string[];

      if (
        settings.contextRouterEnabled &&
        settings.aiProvider === 'claude' &&
        claudeClientRef.current &&
        totalDocChars > DEFAULT_ROUTER_CONFIG.skipThresholdChars &&
        activeDocs.length > 3
      ) {
        // Vermittler-KI: Haiku selects relevant docs, then Opus gets only those
        console.log(`[Vermittler-KI] Routing aktiviert (${Math.round(totalDocChars / 1000)}K chars, ${activeDocs.length} Dokumente)`);
        const routerResult = await routeContext(
          inputText.trim(),
          currentRoom,
          documents,
          claudeClientRef.current.getClient(),
          settings.user1Name,
          settings.user2Name,
        );
        const selectedIdSet = new Set(routerResult.selectedDocIds);
        relevantDocs = activeDocs
          .filter(d => selectedIdSet.has(d.id))
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map(d => `[${d.title}]\n${d.content}`);
      } else {
        // Small KB: send all docs up to limit
        const MAX_DOC_CHARS = 600000;
        let docChars = 0;
        relevantDocs = activeDocs
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .reduce((acc: string[], d) => {
            const docText = `[${d.title}]\n${d.content}`;
            if (docChars + docText.length <= MAX_DOC_CHARS) {
              docChars += docText.length;
              acc.push(docText);
            }
            return acc;
          }, []);
      }

      // Pass document contents to system prompt so AI has context
      const systemPrompt = getSystemPrompt(
        currentRoom,
        settings.therapySchool,
        settings.user1Name,
        settings.user2Name,
        relevantStrategies,
        relevantDocs, // Documents as context for AI
        currentRoom === 'paar' ? currentSpeaker : undefined,
        activeSession ? {
          remaining: sessionTimeRemaining || 0,
          total: activeSession.duration,
          goal: activeSession.goal || '',
        } : undefined,
        currentEmotionAnalysis || undefined
      );

      const history = [...(messages[currentRoom] || []), userMessage];

      let fullResponse = '';

      // Use non-streaming API for reliability (streaming had issues with SDK v0.71)
      if (settings.aiProvider === 'claude' && claudeClientRef.current) {
        fullResponse = await claudeClientRef.current.generateText(systemPrompt, history);
        if (settings.ttsEnabled && fullResponse.trim() && geminiClientRef.current) {
          playTTS(fullResponse);
        }
      } else if (geminiClientRef.current) {
        fullResponse = await geminiClientRef.current.generateText(systemPrompt, history);
        if (settings.ttsEnabled) {
          playTTS(fullResponse);
        }
      }
      // Extract emotion and clean response
      const emotion = extractEmotion(fullResponse);
      const cleanResponse = removeEmotionTag(fullResponse);
      setAvatarEmotion(emotion);

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: cleanResponse,
        timestamp: Date.now(),
        emotion,
      };

      setAppState(prev => ({
        ...prev,
        messages: addMessage(prev.messages, currentRoom, aiMessage),
      }));

    } catch (error) {
      console.error('❌ AI error:', error);
      console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      showToast('Fehler: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler'), 'error');
    } finally {
      console.log('🏁 sendMessage finished');
      setIsLoading(false);
    }
  }, [inputText, currentRoom, currentSpeaker, settings, messages, strategies, documents, activeSession, sessionTimeRemaining, currentEmotionAnalysis, showToast, playTTS]);

  // ================================
  // Speech Recognition (STT)
  // ================================

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      isRecordingRef.current = false;
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      // iOS Safari warning - Web Speech API has limited support
      if (isIOS) {
        showToast('Spracherkennung auf iOS eingeschränkt - bitte Safari verwenden', 'warning');
      }

      if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'de-DE';
        recognition.continuous = !isIOS; // iOS doesn't support continuous well
        recognition.interimResults = true;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalTranscript += result[0].transcript + ' ';
            }
          }

          // Only add final results to input, ignore interim to prevent duplicates
          if (finalTranscript.trim()) {
            setInputText(prev => prev + finalTranscript);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', event.error);
          if (event.error === 'not-allowed') {
            showToast('Mikrofon-Zugriff verweigert', 'error');
          }
          isRecordingRef.current = false;
          setIsRecording(false);
        };

        recognition.onend = () => {
          // Use ref to avoid stale closure - isRecording state would be stale here
          if (isRecordingRef.current && !isIOS) {
            recognition.start(); // Continue recording (not on iOS)
          } else {
            isRecordingRef.current = false;
            setIsRecording(false);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        isRecordingRef.current = true;
        setIsRecording(true);
      } else {
        showToast('Spracherkennung nicht unterstützt - bitte Chrome oder Safari verwenden', 'error');
      }
    }
  }, [isRecording, showToast]);

  // ================================
  // Camera & Emotion Analysis
  // ================================

  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      // Stop camera
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      setIsCameraOn(false);
      setCurrentEmotionAnalysis(null);
    } else {
      // Start camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setIsCameraOn(true);
        showToast('Kamera aktiviert - Emotion-Tracking läuft', 'success');
      } catch (error) {
        console.error('Camera error:', error);
        showToast('Kamera-Zugriff verweigert', 'error');
      }
    }
  }, [isCameraOn, showToast]);

  const captureAndAnalyzeEmotion = useCallback(async (): Promise<EmotionAnalysis | null> => {
    if (!videoRef.current || !canvasRef.current || !claudeClientRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    const prompt = getEmotionAnalysisPrompt(settings.user1Name, settings.user2Name);

    return claudeClientRef.current.analyzeImage(base64, prompt);
  }, [settings.user1Name, settings.user2Name]);

  // ================================
  // Assessment
  // ================================

  const startAssessment = useCallback(async (person: 'tom' | 'lisa') => {
    if (!claudeClientRef.current && !geminiClientRef.current) {
      showToast('Bitte API-Key in Einstellungen eingeben', 'error');
      return;
    }

    setAssessmentPerson(person);
    setIsGeneratingAssessment(true);

    try {
      const personName = person === 'tom' ? settings.user1Name : settings.user2Name;
      const prompt = getAssessmentPrompt(person, personName);

      let response = '';
      if (settings.aiProvider === 'claude' && claudeClientRef.current) {
        response = await claudeClientRef.current.generateText(prompt, []);
      } else if (geminiClientRef.current) {
        response = await geminiClientRef.current.generateText(prompt, []);
      }

      // Parse JSON
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const questions = JSON.parse(jsonMatch[0]) as AssessmentQuestion[];
        setAssessmentQuestions(questions);
        setIsAssessing(true);
      } else {
        throw new Error('Invalid response format');
      }

    } catch (error) {
      console.error('Assessment error:', error);
      showToast('Fehler beim Generieren der Fragen', 'error');
    } finally {
      setIsGeneratingAssessment(false);
    }
  }, [settings, showToast]);

  const submitAssessment = useCallback(async () => {
    if (!assessmentPerson || (!claudeClientRef.current && !geminiClientRef.current)) return;

    // Check if all questions answered
    const answeredCount = Object.keys(assessmentAnswers).length;
    if (answeredCount < assessmentQuestions.length) {
      showToast(`Bitte alle ${assessmentQuestions.length} Fragen beantworten`, 'warning');
      return;
    }

    setIsGeneratingStrategy(true);

    try {
      const personName = assessmentPerson === 'tom' ? settings.user1Name : settings.user2Name;
      const prompt = getStrategyPrompt(personName, assessmentQuestions, assessmentAnswers);

      let strategyContent = '';
      if (settings.aiProvider === 'claude' && claudeClientRef.current) {
        strategyContent = await claudeClientRef.current.generateText(prompt, [], { maxTokens: 8192 });
      } else if (geminiClientRef.current) {
        strategyContent = await geminiClientRef.current.generateText(prompt, []);
      }

      // Show password modal
      setShowAssessmentPasswordModal(true);
      setAssessmentPasswordInput('');

      // Store pending strategy in React state
      setPendingStrategy({
        content: strategyContent,
        person: assessmentPerson,
        questions: assessmentQuestions,
        answers: assessmentAnswers,
      });

    } catch (error) {
      console.error('Strategy error:', error);
      showToast('Fehler beim Generieren der Strategie', 'error');
      setIsGeneratingStrategy(false);
    }
  }, [assessmentPerson, assessmentQuestions, assessmentAnswers, settings, showToast]);

  const confirmAssessmentPassword = useCallback(() => {
    if (!assessmentPasswordInput || assessmentPasswordInput.length < 4) {
      showToast('Passwort muss mindestens 4 Zeichen haben', 'error');
      return;
    }

    if (!pendingStrategy || !assessmentPerson) return;

    // Save password
    if (assessmentPerson === 'tom') {
      updateSettings({ user1Password: assessmentPasswordInput });
    } else {
      updateSettings({ user2Password: assessmentPasswordInput });
    }

    // Create strategy document
    const existingCount = strategies.filter(s => s.person === assessmentPerson).length;
    const newStrategy: StrategyDocument = {
      id: crypto.randomUUID(),
      title: `${assessmentPerson === 'tom' ? settings.user1Name : settings.user2Name} - Strategie #${existingCount + 1}`,
      content: pendingStrategy.content,
      type: 'strategy',
      person: assessmentPerson,
      assessmentNumber: existingCount + 1,
      questions: pendingStrategy.questions,
      answers: pendingStrategy.answers,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setAppState(prev => ({
      ...prev,
      strategies: [...prev.strategies, newStrategy],
    }));

    // Cleanup
    setShowAssessmentPasswordModal(false);
    setIsGeneratingStrategy(false);
    setIsAssessing(false);
    setAssessmentPerson(null);
    setAssessmentQuestions([]);
    setAssessmentAnswers({});
    setPendingStrategy(null);

    showToast('Assessment abgeschlossen! Strategie gespeichert.', 'success');
  }, [assessmentPasswordInput, assessmentPerson, pendingStrategy, strategies, settings, updateSettings, showToast]);

  // ================================
  // Documents
  // ================================

  const saveDocument = useCallback(() => {
    if (!docTitle.trim()) {
      showToast('Titel erforderlich', 'error');
      return;
    }

    if (editingDoc) {
      // Update existing
      setAppState(prev => ({
        ...prev,
        documents: prev.documents.map(d =>
          d.id === editingDoc.id
            ? { ...d, title: docTitle, content: docContent, updatedAt: Date.now() }
            : d
        ),
      }));
    } else {
      // Create new
      const newDoc: Document = {
        id: crypto.randomUUID(),
        title: docTitle,
        content: docContent,
        type: 'note',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setAppState(prev => ({
        ...prev,
        documents: [...prev.documents, newDoc],
      }));
    }

    setEditingDoc(null);
    setShowDocEditor(false);
    setDocTitle('');
    setDocContent('');
    showToast('Dokument gespeichert', 'success');
  }, [docTitle, docContent, editingDoc, showToast]);

  const deleteDocumentFn = useCallback((docId: string) => {
    if (!confirm('Dokument wirklich löschen?')) return;

    setAppState(prev => ({
      ...prev,
      documents: prev.documents.filter(d => d.id !== docId),
    }));
    showToast('Dokument gelöscht', 'success');
  }, [showToast]);

  const archiveDocumentFn = useCallback((docId: string) => {
    setAppState(prev => ({
      ...prev,
      documents: prev.documents.map(d =>
        d.id === docId ? { ...d, isArchived: true, updatedAt: Date.now() } : d
      ),
    }));
    showToast('Dokument archiviert', 'success');
  }, [showToast]);

  const restoreDocumentFn = useCallback((docId: string) => {
    setAppState(prev => ({
      ...prev,
      documents: prev.documents.map(d =>
        d.id === docId ? { ...d, isArchived: false, updatedAt: Date.now() } : d
      ),
    }));
    showToast('Dokument wiederhergestellt', 'success');
  }, [showToast]);

  const createSessionSummary = useCallback(async () => {
    if (!currentRoom || !claudeClientRef.current) return;

    const roomMessages = messages[currentRoom] || [];
    if (roomMessages.length === 0) {
      showToast('Keine Nachrichten zum Zusammenfassen', 'warning');
      return;
    }

    setIsLoading(true);

    try {
      const prompt = `Erstelle eine Zusammenfassung dieser Therapie-Sitzung:

${roomMessages.map(m => `${m.role === 'user' ? (m.speaker === 'tom' ? settings.user1Name : m.speaker === 'lisa' ? settings.user2Name : 'User') : 'AGNES'}: ${m.content}`).join('\n\n')}

Format:
1. Hauptthemen
2. Wichtige Erkenntnisse
3. Emotionale Highlights
4. Empfehlungen für nächste Sitzung`;

      const summary = await claudeClientRef.current.generateText(prompt, []);

      const summaryDoc: Document = {
        id: crypto.randomUUID(),
        title: `Sitzung ${new Date().toLocaleDateString('de-DE')} - ${currentRoom === 'paar' ? 'Paar-Raum' : currentRoom === 'tom' ? settings.user1Name : settings.user2Name}`,
        content: summary,
        type: 'summary',
        person: currentRoom === 'paar' ? 'both' : currentRoom as 'tom' | 'lisa',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setAppState(prev => ({
        ...prev,
        documents: [...prev.documents, summaryDoc],
      }));

      showToast('Zusammenfassung erstellt', 'success');
    } catch (error) {
      console.error('Summary error:', error);
      showToast('Fehler bei der Zusammenfassung', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [currentRoom, messages, settings, showToast]);

  // ================================
  // Backup & Sync
  // ================================

  const handleExportJson = useCallback(() => {
    const json = exportToJson(appState);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `imago-voice-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup heruntergeladen', 'success');
  }, [appState, showToast]);

  const handleExportBase64 = useCallback(() => {
    const base64 = exportToBase64(appState);
    navigator.clipboard.writeText(base64);
    showToast('Backup-Code in Zwischenablage kopiert', 'success');
  }, [appState, showToast]);

  const handleImport = useCallback(() => {
    const imported = smartImport(importText);
    if (imported) {
      saveToLocalStorage(imported);
      setRestoreFlag(true);
      window.location.reload();
    } else {
      showToast('Ungültiges Backup-Format', 'error');
    }
  }, [importText, showToast]);

  const handleFileImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const imported = smartImport(content);
      if (imported) {
        saveToLocalStorage(imported);
        setRestoreFlag(true);
        window.location.reload();
      } else {
        showToast('Ungültige Backup-Datei', 'error');
      }
    };
    reader.readAsText(file);
  }, [showToast]);

  // ================================
  // KI-Optimierungs-Cockpit
  // ================================

  const analyzeKnowledge = useCallback(() => {
    const stats = calculateKnowledgeStats(appState);
    setKnowledgeStats(stats);

    // Always calculate backpacks and duplicates so user can see structure
    const bps = splitIntoBackpacks(appState);
    setBackpacks(bps);
    const dups = findDuplicates(appState);
    setDuplicates(dups);
    setAiAnalysisResult(null);
  }, [appState]);

  const runOptimization = useCallback(async () => {
    if (duplicates.length === 0) {
      showToast('Keine Duplikate gefunden', 'success');
      return;
    }

    setIsOptimizing(true);
    try {
      const result = optimizeKnowledge(appState, duplicates);
      setOptimizationResult(result);
      setShowOptimizationReport(true);

      if (result.fitsInSingleBackpack) {
        showToast(`Optimierung erfolgreich! ${(result.savingsPercent).toFixed(1)}% eingespart`, 'success');
      } else {
        showToast('Optimierung abgeschlossen - manuelles Editieren empfohlen', 'warning');
      }
    } catch (error) {
      console.error('Optimization error:', error);
      showToast('Fehler bei der Optimierung', 'error');
    } finally {
      setIsOptimizing(false);
    }
  }, [appState, duplicates, showToast]);

  const applyOptimization = useCallback(() => {
    if (!optimizationResult) return;

    saveToLocalStorage(optimizationResult.optimizedState);
    setRestoreFlag(true);
    showToast('Optimierung angewendet - Seite wird neu geladen', 'success');
    setTimeout(() => window.location.reload(), 1500);
  }, [optimizationResult, showToast]);

  const runAIAnalysis = useCallback(async (backpackId: number) => {
    const backpack = backpacks.find(bp => bp.id === backpackId);
    if (!backpack || !claudeClientRef.current) {
      showToast('KI-Analyse nicht verfügbar - API-Key prüfen', 'error');
      return;
    }

    setSelectedBackpack(backpackId);
    setIsOptimizing(true);
    setAiAnalysisResult(null);

    try {
      const prompt = generateAIAnalysisPrompt(backpack);
      const response = await claudeClientRef.current.generateText(prompt, []);

      setAiAnalysisResult(response);
      showToast('KI-Analyse abgeschlossen', 'success');
    } catch (error) {
      console.error('AI analysis error:', error);
      showToast('Fehler bei der KI-Analyse', 'error');
    } finally {
      setIsOptimizing(false);
    }
  }, [backpacks, showToast]);

  // Update stats when view changes to backup
  useEffect(() => {
    if (activeView === 'backup') {
      analyzeKnowledge();
    }
  }, [activeView, analyzeKnowledge]);

  const syncToFirebase = useCallback(async () => {
    if (!firebaseUserId) {
      showToast('Firebase nicht verbunden', 'error');
      return;
    }

    setIsSyncing(true);
    try {
      await saveToFirebase(firebaseUserId, appState);
      showToast('Mit Cloud synchronisiert', 'success');
    } catch {
      showToast('Sync fehlgeschlagen', 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [firebaseUserId, appState, showToast]);

  // ================================
  // Clear Room
  // ================================

  const clearCurrentRoom = useCallback(() => {
    if (!currentRoom || currentRoom === 'assessment') return;
    if (!confirm('Alle Nachrichten in diesem Raum löschen?')) return;

    setAppState(prev => ({
      ...prev,
      messages: clearRoomMessages(prev.messages, currentRoom),
    }));
    showToast('Raum geleert', 'success');
  }, [currentRoom, showToast]);

  // ================================
  // Render Helpers
  // ================================

  const getUnreadBadge = (room: RoomType) => {
    const count = getUnreadCount(roomMessages, room);
    if (count === 0) return null;
    return (
      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
        {count}
      </span>
    );
  };

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // ================================
  // Main Render
  // ================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50">
      <Toaster position="top-center" />

      {/* Hidden video and canvas for emotion tracking */}
      <video
        ref={videoRef}
        className="hidden"
        autoPlay
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex h-screen safe-area-top safe-area-bottom">
        {/* Sidebar - Desktop */}
        <div className="hidden md:flex w-64 bg-white/80 backdrop-blur border-r border-amber-200 flex-col">
          {/* Logo */}
          <div className="p-4 sm:p-6 border-b border-amber-200">
            <h1 className="font-serif text-xl sm:text-2xl font-bold text-amber-900">IMAGO VOICE</h1>
            <p className="text-xs sm:text-sm text-amber-600">Intelligente Paartherapie</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 sm:p-4 space-y-2">
            <button
              onClick={() => { setCurrentRoom(null); setActiveView('rooms'); }}
              className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-xl transition ${
                activeView === 'rooms' && !currentRoom ? 'bg-amber-100 text-amber-900' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <Home size={18} className="sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Übersicht</span>
            </button>

            {/* Room buttons */}
            {(['paar', 'tom', 'lisa'] as const).map(room => (
              <button
                key={room}
                onClick={() => attemptRoomEntry(room)}
                className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-xl transition relative ${
                  currentRoom === room ? 'bg-amber-100 text-amber-900' : 'text-amber-700 hover:bg-amber-50'
                }`}
              >
                {room === 'paar' ? <Users size={18} className="sm:w-5 sm:h-5" /> : <User size={18} className="sm:w-5 sm:h-5" />}
                <span className="text-sm sm:text-base">
                  {room === 'paar' ? 'Paar-Raum' : room === 'tom' ? settings.user1Name : settings.user2Name}
                </span>
                {room !== 'paar' && <Lock size={12} className="ml-auto opacity-50" />}
                {getUnreadBadge(room)}
              </button>
            ))}

            <button
              onClick={() => { setCurrentRoom('assessment'); setActiveView('rooms'); }}
              className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-xl transition ${
                currentRoom === 'assessment' ? 'bg-amber-100 text-amber-900' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <Sparkles size={18} className="sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Assessment</span>
            </button>

            <hr className="border-amber-200 my-3 sm:my-4" />

            <button
              onClick={() => setActiveView('documents')}
              className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-xl transition ${
                activeView === 'documents' ? 'bg-amber-100 text-amber-900' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <FileText size={18} className="sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Dokumente</span>
            </button>

            <button
              onClick={() => setActiveView('history')}
              className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-xl transition ${
                activeView === 'history' ? 'bg-amber-100 text-amber-900' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <History size={18} className="sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Verlauf</span>
            </button>

            <button
              onClick={() => setActiveView('messages')}
              className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-xl transition relative ${
                activeView === 'messages' ? 'bg-amber-100 text-amber-900' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <MessageSquare size={18} className="sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Nachrichten</span>
              {roomMessages.filter(m => !m.isRead).length > 0 && (
                <span className="absolute top-2 right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {roomMessages.filter(m => !m.isRead).length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveView('backup')}
              className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-xl transition ${
                activeView === 'backup' ? 'bg-amber-100 text-amber-900' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <Cloud size={18} className="sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Backup</span>
            </button>

            <button
              onClick={() => setActiveView('settings')}
              className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-xl transition ${
                activeView === 'settings' ? 'bg-amber-100 text-amber-900' : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <SettingsIcon size={18} className="sm:w-5 sm:h-5" />
              <span className="text-sm sm:text-base">Einstellungen</span>
            </button>
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile Header */}
          <div className="md:hidden bg-white/80 backdrop-blur border-b border-amber-200 px-4 py-3 flex items-center justify-between">
            <h1 className="font-serif text-lg font-bold text-amber-900">IMAGO VOICE</h1>
            {sessionTimeRemaining !== null && (
              <div className="flex items-center gap-2 text-red-600 font-mono text-sm">
                <Clock size={14} />
                t- {formatTime(sessionTimeRemaining)}
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            {/* Rooms Overview */}
            {activeView === 'rooms' && !currentRoom && (
              <div className="p-4 sm:p-6 md:p-8">
                <div className="max-w-4xl mx-auto">
                  <div className="text-center mb-6 sm:mb-8">
                    <h1 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-amber-900 mb-2">
                      IMAGO VOICE
                    </h1>
                    <p className="text-amber-600 text-sm sm:text-base">Intelligente Paartherapie-Plattform</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    {/* Paar-Raum */}
                    <button
                      onClick={() => attemptRoomEntry('paar')}
                      className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition border-2 border-amber-200 relative"
                    >
                      <Users className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-3 text-amber-600" />
                      <h2 className="font-serif text-lg sm:text-xl font-bold text-amber-900 mb-1">Paar-Raum</h2>
                      <p className="text-xs sm:text-sm text-amber-600">
                        Gemeinsamer Therapieraum für {settings.user1Name} & {settings.user2Name}
                      </p>
                      {getUnreadBadge('paar')}
                    </button>

                    {/* Tom-Raum */}
                    <button
                      onClick={() => attemptRoomEntry('tom')}
                      className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition border-2 border-sky-200 relative"
                    >
                      <div className="absolute top-3 right-3">
                        <Lock size={14} className="text-sky-400" />
                      </div>
                      <User className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-3 text-sky-600" />
                      <h2 className="font-serif text-lg sm:text-xl font-bold text-sky-900 mb-1">{settings.user1Name}</h2>
                      <p className="text-xs sm:text-sm text-sky-600">Persönlicher Einzelraum</p>
                      {getUnreadBadge('tom')}
                    </button>

                    {/* Lisa-Raum */}
                    <button
                      onClick={() => attemptRoomEntry('lisa')}
                      className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition border-2 border-rose-200 relative"
                    >
                      <div className="absolute top-3 right-3">
                        <Lock size={14} className="text-rose-400" />
                      </div>
                      <User className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-3 text-rose-600" />
                      <h2 className="font-serif text-lg sm:text-xl font-bold text-rose-900 mb-1">{settings.user2Name}</h2>
                      <p className="text-xs sm:text-sm text-rose-600">Persönlicher Einzelraum</p>
                      {getUnreadBadge('lisa')}
                    </button>

                    {/* Assessment */}
                    <button
                      onClick={() => { setCurrentRoom('assessment'); setActiveView('rooms'); }}
                      className="bg-white rounded-2xl p-4 sm:p-6 shadow-lg hover:shadow-xl transition border-2 border-purple-200"
                    >
                      <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-3 text-purple-600" />
                      <h2 className="font-serif text-lg sm:text-xl font-bold text-purple-900 mb-1">Assessment Center</h2>
                      <p className="text-xs sm:text-sm text-purple-600">Psychologische Konfiguration</p>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Chat Room */}
            {currentRoom && currentRoom !== 'assessment' && (
              <div className="flex flex-col h-full">
                {/* Header with Timer */}
                <div className="bg-white/80 backdrop-blur border-b border-amber-200 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={() => { setCurrentRoom(null); setActiveView('rooms'); }} className="p-2 hover:bg-amber-100 rounded-lg">
                      <ChevronRight size={20} className="rotate-180 text-amber-600" />
                    </button>
                    <div>
                      <h2 className="font-serif text-lg sm:text-xl font-bold text-amber-900">
                        {currentRoom === 'paar' ? 'Paar-Raum' : currentRoom === 'tom' ? settings.user1Name : settings.user2Name}
                      </h2>
                      {activeSession && (
                        <p className="text-xs text-amber-600">Ziel: {activeSession.goal}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Camera toggle */}
                    {settings.cameraEnabled && (
                      <button
                        onClick={toggleCamera}
                        className={`p-2 rounded-lg transition ${isCameraOn ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {isCameraOn ? <Camera size={18} /> : <CameraOff size={18} />}
                      </button>
                    )}

                    {/* Timer */}
                    {sessionTimeRemaining !== null && (
                      <div className="hidden sm:flex items-center gap-1 text-red-600 font-mono text-sm bg-red-50 px-3 py-1 rounded-lg">
                        <Clock size={14} />
                        t- {formatTime(sessionTimeRemaining)}
                      </div>
                    )}

                    {/* Session controls */}
                    {!activeSession ? (
                      <button
                        onClick={() => setShowSessionModal(true)}
                        className="bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-amber-700"
                      >
                        Sitzung starten
                      </button>
                    ) : (
                      <button
                        onClick={stopSession}
                        className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-700"
                      >
                        Beenden
                      </button>
                    )}
                  </div>
                </div>

                {/* Avatar & Emotion Display - Professional face-api.js detection */}
                {faceEmotion && faceEmotion.faceDetected && (
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-b border-purple-200 px-4 py-2 flex items-center justify-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-purple-700">Erkannte Emotion:</span>
                      <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full font-semibold">
                        {emotionToGerman[faceEmotion.dominant]} ({Math.round(faceEmotion.confidence * 100)}%)
                      </span>
                    </div>
                    {/* Secondary emotions */}
                    <div className="flex gap-1 text-xs text-purple-600">
                      {Object.entries(faceEmotion.all)
                        .filter(([e, v]) => e !== faceEmotion.dominant && v > 0.15)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 2)
                        .map(([emotion, value]) => (
                          <span key={emotion} className="bg-purple-50 px-2 py-0.5 rounded">
                            {emotionToGerman[emotion as FaceEmotion]}: {Math.round(value * 100)}%
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages[currentRoom]?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-amber-400">
                      <AnimatedAvatar
                        emotion={faceEmotion?.dominant || 'neutral'}
                        isSpeaking={isSpeaking}
                        size="large"
                        className="mb-3"
                      />
                      <p className="font-serif text-lg">Raum ist bereit...</p>
                    </div>
                  ) : (
                    messages[currentRoom]?.map(msg => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                            msg.role === 'user'
                              ? msg.speaker === 'tom'
                                ? 'bg-sky-100 text-sky-900'
                                : msg.speaker === 'lisa'
                                ? 'bg-rose-100 text-rose-900'
                                : 'bg-amber-100 text-amber-900'
                              : 'bg-white shadow text-amber-900'
                          }`}
                        >
                          {msg.role === 'user' && msg.speaker && currentRoom === 'paar' && (
                            <span className={`text-xs font-bold mb-1 block ${msg.speaker === 'tom' ? 'text-sky-600' : 'text-rose-600'}`}>
                              {msg.speaker === 'tom' ? settings.user1Name : settings.user2Name}
                            </span>
                          )}
                          {msg.role === 'assistant' && (
                            <div className="flex items-center gap-2 mb-1">
                              <AnimatedAvatar
                                emotion={msg.emotion === 'empathetic' ? 'happy' :
                                         msg.emotion === 'encouraging' ? 'happy' :
                                         msg.emotion === 'concerned' ? 'sad' :
                                         msg.emotion === 'thoughtful' ? 'neutral' :
                                         msg.emotion === 'proud' ? 'happy' :
                                         msg.emotion === 'sad' ? 'sad' : 'neutral'}
                                size="small"
                              />
                              <span className="text-xs font-bold text-amber-600">AGNES</span>
                            </div>
                          )}
                          <p className="text-sm sm:text-base whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white shadow rounded-2xl px-4 py-3">
                        <div className="flex items-center gap-2">
                          <AnimatedAvatar emotion="neutral" isSpeaking={true} size="small" />
                          <span className="text-amber-600">tippt...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Speaker Selection (Paar-Raum only) */}
                {currentRoom === 'paar' && (
                  <div className="bg-white/80 border-t border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-2">
                    <span className="text-xs text-amber-600 mr-2">Wer spricht?</span>
                    <button
                      onClick={() => setCurrentSpeaker('tom')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        currentSpeaker === 'tom'
                          ? 'bg-sky-500 text-white'
                          : 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                      }`}
                    >
                      {settings.user1Name}
                    </button>
                    <button
                      onClick={() => setCurrentSpeaker('lisa')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        currentSpeaker === 'lisa'
                          ? 'bg-rose-500 text-white'
                          : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                      }`}
                    >
                      {settings.user2Name}
                    </button>
                  </div>
                )}

                {/* Input */}
                <div className="bg-white border-t border-amber-200 p-3 sm:p-4">
                  <div className="max-w-4xl mx-auto flex gap-2">
                    <textarea
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Gedanken teilen..."
                      disabled={isLoading}
                      rows={2}
                      className="flex-1 px-4 py-2.5 border border-amber-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 resize-none text-sm sm:text-base"
                    />
                    <button
                      onClick={toggleRecording}
                      className={`p-2.5 rounded-xl transition ${
                        isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      }`}
                    >
                      {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    <button
                      onClick={sendMessage}
                      disabled={isLoading || !inputText.trim()}
                      className="px-4 py-2.5 bg-amber-600 text-white rounded-xl hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send size={20} />
                    </button>
                  </div>

                  {/* Quick actions */}
                  <div className="max-w-4xl mx-auto mt-2 flex gap-2 flex-wrap">
                    <button
                      onClick={createSessionSummary}
                      disabled={isLoading}
                      className="text-xs px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50"
                    >
                      📝 Zusammenfassung
                    </button>
                    <button
                      onClick={clearCurrentRoom}
                      className="text-xs px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                    >
                      🗑️ Raum leeren
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Assessment Center */}
            {currentRoom === 'assessment' && !isAssessing && (
              <div className="p-4 sm:p-6 md:p-8">
                <div className="max-w-2xl mx-auto">
                  <div className="text-center mb-6 sm:mb-8">
                    <Sparkles className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 text-purple-600" />
                    <h2 className="font-serif text-2xl sm:text-3xl font-bold text-purple-900 mb-2">Assessment Center</h2>
                    <p className="text-purple-600 text-sm sm:text-base">
                      Wer möchte ein psychologisches Assessment durchführen?
                    </p>
                  </div>

                  {isGeneratingAssessment ? (
                    <div className="text-center py-8">
                      <div className="animate-spin w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full mx-auto mb-4" />
                      <p className="text-purple-600">Generiere Fragebogen...</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => startAssessment('tom')}
                        className="bg-sky-100 border-2 border-sky-300 rounded-2xl p-4 sm:p-6 hover:shadow-lg transition"
                      >
                        <User className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 text-sky-600" />
                        <h3 className="font-serif text-lg sm:text-xl font-bold text-sky-900">{settings.user1Name}</h3>
                        <p className="text-xs sm:text-sm text-sky-600 mt-1">
                          Strategie #{strategies.filter(s => s.person === 'tom').length + 1}
                        </p>
                      </button>

                      <button
                        onClick={() => startAssessment('lisa')}
                        className="bg-rose-100 border-2 border-rose-300 rounded-2xl p-4 sm:p-6 hover:shadow-lg transition"
                      >
                        <User className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 text-rose-600" />
                        <h3 className="font-serif text-lg sm:text-xl font-bold text-rose-900">{settings.user2Name}</h3>
                        <p className="text-xs sm:text-sm text-rose-600 mt-1">
                          Strategie #{strategies.filter(s => s.person === 'lisa').length + 1}
                        </p>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => { setCurrentRoom(null); setActiveView('rooms'); }}
                    className="mt-6 w-full py-2 text-purple-600 hover:text-purple-800"
                  >
                    ← Zurück zur Übersicht
                  </button>
                </div>
              </div>
            )}

            {/* Assessment Questions */}
            {currentRoom === 'assessment' && isAssessing && assessmentPerson && (
              <div className="p-4 sm:p-6 md:p-8">
                <div className="max-w-3xl mx-auto">
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-purple-900 mb-2">
                    Assessment: {assessmentPerson === 'tom' ? settings.user1Name : settings.user2Name}
                  </h2>
                  <p className="text-purple-600 text-sm mb-6">
                    Beantworte alle {assessmentQuestions.length} Fragen ehrlich.
                  </p>

                  <div className="space-y-6">
                    {assessmentQuestions.map((q, index) => (
                      <div key={q.id} className="bg-white rounded-xl p-4 shadow">
                        <p className="font-medium text-purple-900 mb-3">
                          {index + 1}. {q.question}
                        </p>
                        <div className="space-y-2">
                          {q.options.map((option, optIndex) => (
                            <label
                              key={optIndex}
                              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition ${
                                assessmentAnswers[q.id] === String(optIndex)
                                  ? 'bg-purple-100 border-2 border-purple-400'
                                  : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                              }`}
                            >
                              <input
                                type="radio"
                                name={q.id}
                                value={optIndex}
                                checked={assessmentAnswers[q.id] === String(optIndex)}
                                onChange={() => setAssessmentAnswers(prev => ({ ...prev, [q.id]: String(optIndex) }))}
                                className="w-4 h-4 text-purple-600"
                              />
                              <span className="text-sm text-gray-700">{option}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex gap-4">
                    <button
                      onClick={() => {
                        setIsAssessing(false);
                        setAssessmentPerson(null);
                        setAssessmentQuestions([]);
                        setAssessmentAnswers({});
                      }}
                      className="flex-1 py-3 text-purple-600 border border-purple-300 rounded-xl hover:bg-purple-50"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={submitAssessment}
                      disabled={isGeneratingStrategy || Object.keys(assessmentAnswers).length < assessmentQuestions.length}
                      className="flex-1 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50"
                    >
                      {isGeneratingStrategy ? 'Generiere Strategie...' : 'Assessment abschließen'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Documents View */}
            {activeView === 'documents' && (
              <div className="p-4 sm:p-6 md:p-8">
                <div className="max-w-4xl mx-auto">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">Dokumente</h2>
                    <button
                      onClick={() => { setEditingDoc(null); setDocTitle(''); setDocContent(''); setShowDocEditor(true); }}
                      className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 flex items-center gap-2"
                    >
                      <Plus size={18} /> Neu
                    </button>
                  </div>

                  {/* Document Editor */}
                  {(editingDoc || showDocEditor) && (
                    <div className="bg-white rounded-xl p-4 shadow mb-6">
                      <input
                        value={docTitle}
                        onChange={e => setDocTitle(e.target.value)}
                        placeholder="Titel..."
                        className="w-full text-lg font-bold mb-3 p-2 border-b border-amber-200 focus:outline-none focus:border-amber-400"
                      />
                      <textarea
                        value={docContent}
                        onChange={e => setDocContent(e.target.value)}
                        placeholder="Inhalt..."
                        rows={10}
                        className="w-full p-2 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                      />
                      <div className="flex gap-2 mt-3">
                        <button onClick={saveDocument} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2">
                          <Save size={16} /> Speichern
                        </button>
                        <button
                          onClick={() => { setEditingDoc(null); setShowDocEditor(false); setDocTitle(''); setDocContent(''); }}
                          className="px-4 py-2 text-amber-600 hover:text-amber-800"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Archive Toggle */}
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={() => setShowArchived(false)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        !showArchived ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      }`}
                    >
                      Aktiv ({[...documents, ...strategies].filter(d => !d.isArchived).length})
                    </button>
                    <button
                      onClick={() => setShowArchived(true)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                        showArchived ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Archive size={14} />
                      Archiv ({[...documents, ...strategies].filter(d => d.isArchived).length})
                    </button>
                  </div>

                  {/* Document List */}
                  <div className="space-y-3">
                    {[...documents, ...strategies]
                      .filter(d => showArchived ? d.isArchived : !d.isArchived)
                      .sort((a, b) => b.updatedAt - a.updatedAt)
                      .map(doc => (
                      <div key={doc.id} className={`rounded-xl p-4 shadow flex items-center justify-between ${
                        showArchived ? 'bg-gray-50 border border-gray-200' : 'bg-white'
                      }`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              doc.type === 'strategy' ? 'bg-purple-100 text-purple-700' :
                              doc.type === 'summary' ? 'bg-blue-100 text-blue-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {doc.type === 'strategy' ? 'Strategie' : doc.type === 'summary' ? 'Zusammenfassung' : 'Notiz'}
                            </span>
                            {showArchived && (
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">Archiviert</span>
                            )}
                            <h3 className={`font-medium truncate ${showArchived ? 'text-gray-600' : 'text-amber-900'}`}>{doc.title}</h3>
                          </div>
                          <p className="text-xs text-amber-600 mt-1">
                            {new Date(doc.updatedAt).toLocaleDateString('de-DE')}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {!showArchived ? (
                            <>
                              <button
                                onClick={() => { setEditingDoc(doc); setShowDocEditor(true); setDocTitle(doc.title); setDocContent(doc.content); }}
                                className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg"
                                title="Bearbeiten"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                onClick={() => archiveDocumentFn(doc.id)}
                                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                                title="Archivieren"
                              >
                                <Archive size={16} />
                              </button>
                              <button
                                onClick={() => deleteDocumentFn(doc.id)}
                                className="p-2 text-red-600 hover:bg-red-100 rounded-lg"
                                title="Löschen"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => restoreDocumentFn(doc.id)}
                                className="p-2 text-green-600 hover:bg-green-100 rounded-lg"
                                title="Wiederherstellen"
                              >
                                <RotateCcw size={16} />
                              </button>
                              <button
                                onClick={() => deleteDocumentFn(doc.id)}
                                className="p-2 text-red-600 hover:bg-red-100 rounded-lg"
                                title="Endgültig löschen"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    {!showArchived && documents.filter(d => !d.isArchived).length === 0 && strategies.filter(d => !d.isArchived).length === 0 && (
                      <p className="text-center text-amber-600 py-8">Noch keine Dokumente vorhanden</p>
                    )}
                    {showArchived && documents.filter(d => d.isArchived).length === 0 && strategies.filter(d => d.isArchived).length === 0 && (
                      <p className="text-center text-gray-500 py-8">Keine archivierten Dokumente</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* History View */}
            {activeView === 'history' && (
              <div className="p-4 sm:p-6 md:p-8">
                <div className="max-w-4xl mx-auto">
                  <h2 className="font-serif text-2xl sm:text-3xl font-bold text-amber-900 mb-6">Sitzungsverlauf</h2>

                  <div className="space-y-3">
                    {sessions.sort((a, b) => b.startTime - a.startTime).map(session => (
                      <div key={session.id} className="bg-white rounded-xl p-4 shadow">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium text-amber-900">
                              {session.room === 'paar' ? 'Paar-Raum' : session.room === 'tom' ? settings.user1Name : settings.user2Name}
                            </h3>
                            <p className="text-xs text-amber-600">
                              {new Date(session.startTime).toLocaleDateString('de-DE', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                            {session.goal && (
                              <p className="text-sm text-amber-700 mt-1">Ziel: {session.goal}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-sm text-amber-600">{session.messageCount} Nachrichten</span>
                            <p className="text-xs text-amber-500">{formatTime(session.duration)}</p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {sessions.length === 0 && (
                      <p className="text-center text-amber-600 py-8">Noch keine Sitzungen</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Messages View */}
            {activeView === 'messages' && (
              <div className="p-4 sm:p-6 md:p-8">
                <div className="max-w-4xl mx-auto">
                  <h2 className="font-serif text-2xl sm:text-3xl font-bold text-amber-900 mb-6">Nachrichten</h2>

                  <div className="space-y-3">
                    {roomMessages.sort((a, b) => b.timestamp - a.timestamp).map(msg => (
                      <div
                        key={msg.id}
                        className={`bg-white rounded-xl p-4 shadow ${!msg.isRead ? 'border-l-4 border-amber-500' : ''}`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-xs text-amber-600">
                              Von: {msg.from === 'paar' ? 'Paar-Raum' : msg.from === 'tom' ? settings.user1Name : settings.user2Name}
                              {' → '}
                              {msg.to === 'paar' ? 'Paar-Raum' : msg.to === 'tom' ? settings.user1Name : settings.user2Name}
                            </p>
                            <p className="text-amber-900 mt-1">{msg.content}</p>
                          </div>
                          <span className="text-xs text-amber-500">
                            {new Date(msg.timestamp).toLocaleString('de-DE')}
                          </span>
                        </div>
                        {!msg.isRead && (
                          <button
                            onClick={() => {
                              setAppState(prev => ({
                                ...prev,
                                roomMessages: prev.roomMessages.map(m =>
                                  m.id === msg.id ? { ...m, isRead: true } : m
                                ),
                              }));
                            }}
                            className="mt-2 text-xs text-amber-600 hover:text-amber-800"
                          >
                            Als gelesen markieren
                          </button>
                        )}
                      </div>
                    ))}

                    {roomMessages.length === 0 && (
                      <p className="text-center text-amber-600 py-8">Keine Nachrichten</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Backup View */}
            {activeView === 'backup' && (
              <div className="p-4 sm:p-6 md:p-8">
                <div className="max-w-2xl mx-auto space-y-6">
                  <h2 className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">Backup & Sync</h2>

                  {/* Export */}
                  <div className="bg-white rounded-xl p-4 shadow">
                    <h3 className="font-bold text-amber-900 mb-3">Export</h3>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={handleExportJson} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2">
                        <Download size={16} /> JSON-Datei
                      </button>
                      <button onClick={handleExportBase64} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2">
                        <Download size={16} /> Base64-Code
                      </button>
                    </div>
                  </div>

                  {/* Import */}
                  <div className="bg-white rounded-xl p-4 shadow">
                    <h3 className="font-bold text-amber-900 mb-3">Import</h3>
                    <div className="space-y-3">
                      <label className="block">
                        <span className="text-sm text-amber-700">JSON-Datei hochladen:</span>
                        <input
                          type="file"
                          accept=".json"
                          onChange={handleFileImport}
                          className="mt-1 block w-full text-sm text-amber-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-amber-100 file:text-amber-700 hover:file:bg-amber-200"
                        />
                      </label>
                      <div>
                        <span className="text-sm text-amber-700">Oder Base64-Code einfügen:</span>
                        <textarea
                          value={importText}
                          onChange={e => setImportText(e.target.value)}
                          placeholder="Base64-Code hier einfügen..."
                          rows={4}
                          className="mt-1 w-full p-2 border border-amber-200 rounded-lg text-sm"
                        />
                        <button
                          onClick={handleImport}
                          disabled={!importText.trim()}
                          className="mt-2 bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                        >
                          <Upload size={16} /> Importieren
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Firebase Sync */}
                  <div className="bg-white rounded-xl p-4 shadow">
                    <h3 className="font-bold text-amber-900 mb-3">Cloud-Sync</h3>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-amber-700">
                          Status: {firebaseUserId ? '🟢 Verbunden' : '🔴 Nicht verbunden'}
                        </p>
                        {firebaseUserId && (
                          <p className="text-xs text-amber-500">ID: {firebaseUserId.substring(0, 8)}...</p>
                        )}
                      </div>
                      <button
                        onClick={syncToFirebase}
                        disabled={!firebaseUserId || isSyncing}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                        Sync
                      </button>
                    </div>
                  </div>

                  {/* KI-Optimierungs-Cockpit */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 shadow border-2 border-indigo-200">
                    <h3 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                      <Sparkles size={20} className="text-indigo-600" />
                      KI-Optimierungs-Cockpit
                    </h3>

                    {/* Wissensdatenbank-Größe */}
                    {knowledgeStats && (
                      <div className="space-y-4">
                        {/* Größenanzeige */}
                        <div className="bg-white rounded-lg p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-gray-600">Wissensdatenbank:</span>
                            <span className={`font-mono font-bold ${knowledgeStats.needsOptimization ? 'text-red-600' : 'text-green-600'}`}>
                              {(knowledgeStats.totalBytes / 1024).toFixed(1)} KB
                            </span>
                          </div>

                          {/* Progress Bar */}
                          <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                            <div
                              className={`h-3 rounded-full transition-all ${
                                knowledgeStats.needsOptimization ? 'bg-red-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min((knowledgeStats.totalBytes / MAX_BACKPACK_SIZE) * 100, 100)}%` }}
                            />
                          </div>

                          <div className="flex justify-between text-xs text-gray-500">
                            <span>0 KB</span>
                            <span className="font-medium">128 KB Limit</span>
                          </div>

                          {/* Token-Schätzung */}
                          <div className="mt-2 text-xs text-gray-500">
                            ~{knowledgeStats.estimatedTokens.toLocaleString()} Tokens geschätzt
                          </div>
                        </div>

                        {/* Aufschlüsselung */}
                        <div className="bg-white rounded-lg p-3">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Aufschlüsselung:</h4>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex justify-between">
                              <span>📄 Dokumente:</span>
                              <span>{knowledgeStats.breakdown.documents.count} ({(knowledgeStats.breakdown.documents.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            <div className="flex justify-between">
                              <span>🎯 Strategien:</span>
                              <span>{knowledgeStats.breakdown.strategies.count} ({(knowledgeStats.breakdown.strategies.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            <div className="flex justify-between">
                              <span>💬 Paar-Raum:</span>
                              <span>{knowledgeStats.breakdown.messages.paar.count} Nachrichten</span>
                            </div>
                            <div className="flex justify-between">
                              <span>💬 Einzelräume:</span>
                              <span>{knowledgeStats.breakdown.messages.tom.count + knowledgeStats.breakdown.messages.lisa.count} Nachrichten</span>
                            </div>
                          </div>
                        </div>

                        {/* Warnung bei Überschreitung */}
                        {knowledgeStats.needsOptimization && (
                          <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
                              <div>
                                <p className="text-sm font-medium text-amber-800">
                                  Wissensdatenbank überschreitet 128K!
                                </p>
                                <p className="text-xs text-amber-700 mt-1">
                                  {knowledgeStats.backpacksNeeded} Rucksäcke benötigt. Optimierung empfohlen.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Rucksack-Übersicht - immer anzeigen wenn Daten vorhanden */}
                        {backpacks.length > 0 && (
                          <div className="bg-white rounded-lg p-3">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">
                              Rucksäcke ({backpacks.length}):
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {backpacks.map(bp => (
                                <div
                                  key={bp.id}
                                  className={`rounded-lg p-2 text-center cursor-pointer transition-all border-2 ${
                                    selectedBackpack === bp.id
                                      ? 'border-indigo-500 bg-indigo-50'
                                      : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'
                                  }`}
                                  onClick={() => setSelectedBackpack(bp.id === selectedBackpack ? null : bp.id)}
                                >
                                  <div className="text-lg">🎒</div>
                                  <div className="text-xs font-medium">Rucksack {bp.id}</div>
                                  <div className="text-xs text-gray-500">{(bp.size / 1024).toFixed(1)} KB</div>
                                  <div className="text-xs text-gray-400">{bp.items.length} Einträge</div>
                                </div>
                              ))}
                            </div>

                            {/* Rucksack-Detail wenn ausgewählt */}
                            {selectedBackpack && (() => {
                              const bp = backpacks.find(b => b.id === selectedBackpack);
                              if (!bp) return null;
                              return (
                                <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
                                  <div className="flex justify-between items-center mb-2">
                                    <h5 className="text-sm font-medium text-gray-700">
                                      Rucksack {bp.id} - Inhalt ({bp.items.length} Einträge, {(bp.size / 1024).toFixed(1)} KB)
                                    </h5>
                                    <button
                                      onClick={() => setSelectedBackpack(null)}
                                      className="text-gray-400 hover:text-gray-600"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto space-y-1">
                                    {bp.items.map((item, idx) => (
                                      <div key={idx} className="bg-white rounded p-2 text-xs flex justify-between items-start">
                                        <div className="flex-1 min-w-0">
                                          <span className={`inline-block px-1.5 py-0.5 rounded mr-1 ${
                                            item.type === 'document' ? 'bg-amber-100 text-amber-700' :
                                            item.type === 'strategy' ? 'bg-purple-100 text-purple-700' :
                                            'bg-blue-100 text-blue-700'
                                          }`}>
                                            {item.type === 'document' ? '📄' : item.type === 'strategy' ? '🎯' : '💬'}
                                          </span>
                                          <span className="font-medium">{item.title || item.id}</span>
                                          <p className="text-gray-400 mt-0.5 truncate">{item.content.substring(0, 100)}...</p>
                                        </div>
                                        <span className="text-gray-400 ml-2 whitespace-nowrap">{(item.size / 1024).toFixed(1)} KB</span>
                                      </div>
                                    ))}
                                  </div>

                                  {/* KI-Analyse Button für diesen Rucksack */}
                                  <button
                                    onClick={() => runAIAnalysis(bp.id)}
                                    disabled={isOptimizing || !claudeClientRef.current}
                                    className="mt-2 w-full bg-purple-600 text-white px-3 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                                  >
                                    {isOptimizing && selectedBackpack === bp.id ? (
                                      <RefreshCw size={14} className="animate-spin" />
                                    ) : (
                                      <Sparkles size={14} />
                                    )}
                                    {isOptimizing && selectedBackpack === bp.id ? 'Analysiere...' : `Rucksack ${bp.id} mit KI analysieren`}
                                  </button>
                                </div>
                              );
                            })()}

                            {/* KI-Analyse Ergebnis */}
                            {aiAnalysisResult && (
                              <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-3">
                                <div className="flex justify-between items-center mb-2">
                                  <h5 className="text-sm font-medium text-purple-800">KI-Analyse Ergebnis</h5>
                                  <button
                                    onClick={() => setAiAnalysisResult(null)}
                                    className="text-gray-400 hover:text-gray-600"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                                <pre className="text-xs text-purple-900 whitespace-pre-wrap max-h-64 overflow-y-auto bg-white rounded p-2 border border-purple-100">
                                  {aiAnalysisResult}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Duplikate */}
                        {duplicates.length > 0 && (
                          <div className="bg-white rounded-lg p-3">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">
                              {duplicates.length} Duplikat-Gruppen gefunden
                            </h4>
                            <div className="max-h-40 overflow-y-auto space-y-1">
                              {duplicates.map((group, i) => (
                                <div key={i} className="bg-gray-50 rounded p-2 text-xs">
                                  <div className="flex justify-between">
                                    <span className="font-medium">{group.items.length}x gleicher Inhalt</span>
                                    <span className={group.canOptimize ? 'text-green-600' : 'text-amber-600'}>
                                      {group.canOptimize ? '✅ Optimierbar' : '⚠️ Kontext behalten'}
                                    </span>
                                  </div>
                                  <p className="text-gray-400 mt-0.5 truncate">
                                    {group.items[0]?.content?.substring(0, 80)}...
                                  </p>
                                  {group.reason && (
                                    <p className="text-gray-500 mt-1">{group.reason}</p>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Optimierung starten */}
                            <button
                              onClick={runOptimization}
                              disabled={isOptimizing || duplicates.filter(d => d.canOptimize).length === 0}
                              className="mt-2 w-full bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                            >
                              {isOptimizing ? (
                                <RefreshCw size={14} className="animate-spin" />
                              ) : (
                                <Sparkles size={14} />
                              )}
                              {isOptimizing ? 'Optimiere...' : `Duplikate optimieren (${duplicates.filter(d => d.canOptimize).length} optimierbar)`}
                            </button>
                          </div>
                        )}

                        {/* Keine Duplikate Info */}
                        {duplicates.length === 0 && backpacks.length > 0 && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                            <Check className="text-green-600 flex-shrink-0" size={18} />
                            <span className="text-sm text-green-800">Keine Duplikate gefunden</span>
                          </div>
                        )}

                        {/* Optimierungsergebnis */}
                        {optimizationResult && showOptimizationReport && (
                          <div className="bg-white rounded-lg p-3 border-2 border-green-200">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-medium text-green-800">Optimierungsergebnis</h4>
                              <button
                                onClick={() => setShowOptimizationReport(false)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <X size={16} />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                              <div>
                                <span className="text-gray-500">Vorher:</span>
                                <span className="font-mono ml-2">{(optimizationResult.originalSize / 1024).toFixed(1)} KB</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Nachher:</span>
                                <span className="font-mono ml-2 text-green-600">{(optimizationResult.optimizedSize / 1024).toFixed(1)} KB</span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-gray-500">Einsparung:</span>
                                <span className="font-mono ml-2 text-green-600 font-bold">
                                  {(optimizationResult.savingsBytes / 1024).toFixed(1)} KB ({optimizationResult.savingsPercent.toFixed(1)}%)
                                </span>
                              </div>
                            </div>

                            <div className="text-xs text-gray-600 mb-3">
                              <p>✅ {optimizationResult.duplicatesOptimized} Duplikate optimiert</p>
                              <p>⚠️ {optimizationResult.skippedWithContext} Einträge mit Kontext beibehalten</p>
                            </div>

                            {optimizationResult.fitsInSingleBackpack ? (
                              <div className="bg-green-50 rounded p-2 text-sm text-green-800 mb-3">
                                ✅ Passt jetzt in einen 128K Rucksack!
                              </div>
                            ) : (
                              <div className="bg-amber-50 rounded p-2 text-sm text-amber-800 mb-3">
                                ⚠️ Noch zu groß - manuelles Editieren empfohlen
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={applyOptimization}
                                className="flex-1 bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm flex items-center justify-center gap-2"
                              >
                                <Check size={14} />
                                Optimierung anwenden
                              </button>
                              <button
                                onClick={() => setActiveView('documents')}
                                className="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 text-sm"
                              >
                                Manuell editieren
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Alles OK */}
                        {!knowledgeStats.needsOptimization && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                            <Check className="text-green-600" size={20} />
                            <span className="text-sm text-green-800">
                              Wissensdatenbank passt in einen 128K Rucksack - keine Optimierung nötig!
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Analyse starten Button (falls Stats nicht geladen) */}
                    {!knowledgeStats && (
                      <button
                        onClick={analyzeKnowledge}
                        className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2"
                      >
                        <RefreshCw size={16} />
                        Wissensdatenbank analysieren
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Settings View */}
            {activeView === 'settings' && (
              <div className="p-4 sm:p-6 md:p-8">
                <div className="max-w-2xl mx-auto space-y-6">
                  <h2 className="font-serif text-2xl sm:text-3xl font-bold text-amber-900">Einstellungen</h2>

                  {/* Partner Names */}
                  <div className="bg-white rounded-xl p-4 shadow">
                    <h3 className="font-bold text-amber-900 mb-3">Partner</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm text-amber-700">Partner 1</label>
                        <input
                          value={settings.user1Name}
                          onChange={e => updateSettings({ user1Name: e.target.value })}
                          className="w-full mt-1 p-2 border border-amber-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-amber-700">Partner 2</label>
                        <input
                          value={settings.user2Name}
                          onChange={e => updateSettings({ user2Name: e.target.value })}
                          className="w-full mt-1 p-2 border border-amber-200 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* AI Provider */}
                  <div className="bg-white rounded-xl p-4 shadow">
                    <h3 className="font-bold text-amber-900 mb-3">KI Provider</h3>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateSettings({ aiProvider: 'claude' })}
                          className={`flex-1 py-2 rounded-lg ${settings.aiProvider === 'claude' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700'}`}
                        >
                          Claude
                        </button>
                        <button
                          onClick={() => updateSettings({ aiProvider: 'gemini' })}
                          className={`flex-1 py-2 rounded-lg ${settings.aiProvider === 'gemini' ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700'}`}
                        >
                          Gemini
                        </button>
                      </div>

                      {settings.aiProvider === 'claude' && (
                        <>
                          <div>
                            <label className="text-sm text-amber-700">Claude API Key</label>
                            <input
                              type="password"
                              value={settings.claudeApiKey}
                              onChange={e => updateSettings({ claudeApiKey: e.target.value })}
                              placeholder="sk-ant-... oder agnes3001"
                              className="w-full mt-1 p-2 border border-amber-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="text-sm text-amber-700">Modell</label>
                            <select
                              value={settings.claudeModel}
                              onChange={e => updateSettings({ claudeModel: e.target.value as Settings['claudeModel'] })}
                              className="w-full mt-1 p-2 border border-amber-200 rounded-lg"
                            >
                              <option value="claude-opus-4-5-20251101">Claude Opus 4.5</option>
                              <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
                            </select>
                          </div>
                        </>
                      )}

                      <div>
                        <label className="text-sm text-amber-700">Gemini API Key (für TTS)</label>
                        <input
                          type="password"
                          value={settings.geminiApiKey}
                          onChange={e => updateSettings({ geminiApiKey: e.target.value })}
                          placeholder="AIza..."
                          className="w-full mt-1 p-2 border border-amber-200 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Voice Settings */}
                  <div className="bg-white rounded-xl p-4 shadow">
                    <h3 className="font-bold text-amber-900 mb-3">Sprachausgabe</h3>
                    <div className="space-y-3">
                      <button
                        onClick={() => updateSettings({ ttsEnabled: !settings.ttsEnabled })}
                        className={`w-full py-2 rounded-lg flex items-center justify-center gap-2 ${
                          settings.ttsEnabled ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {settings.ttsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                        {settings.ttsEnabled ? 'Aktiviert' : 'Deaktiviert'}
                      </button>

                      {settings.ttsEnabled && isIOS && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <p className="text-xs text-amber-800">
                            ℹ️ <strong>iOS:</strong> Sprachausgabe nutzt vereinfachte Wiedergabe (HTMLAudioElement).
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-sm text-amber-700">Paar-Raum</label>
                          <select
                            value={settings.voicePaar}
                            onChange={e => updateSettings({ voicePaar: e.target.value })}
                            className="w-full mt-1 p-2 border border-amber-200 rounded-lg text-sm"
                          >
                            <option value="Zephyr">Zephyr (neutral)</option>
                            <option value="Puck">Puck (männlich)</option>
                            <option value="Kore">Kore (weiblich)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm text-amber-700">{settings.user1Name}</label>
                          <select
                            value={settings.voiceTom}
                            onChange={e => updateSettings({ voiceTom: e.target.value })}
                            className="w-full mt-1 p-2 border border-amber-200 rounded-lg text-sm"
                          >
                            <option value="Puck">Puck</option>
                            <option value="Zephyr">Zephyr</option>
                            <option value="Kore">Kore</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm text-amber-700">{settings.user2Name}</label>
                          <select
                            value={settings.voiceLisa}
                            onChange={e => updateSettings({ voiceLisa: e.target.value })}
                            className="w-full mt-1 p-2 border border-amber-200 rounded-lg text-sm"
                          >
                            <option value="Kore">Kore</option>
                            <option value="Zephyr">Zephyr</option>
                            <option value="Puck">Puck</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Therapy School */}
                  <div className="bg-white rounded-xl p-4 shadow">
                    <h3 className="font-bold text-amber-900 mb-3">Therapeutische Schule</h3>
                    <select
                      value={settings.therapySchool}
                      onChange={e => updateSettings({ therapySchool: e.target.value as Settings['therapySchool'] })}
                      className="w-full p-2 border border-amber-200 rounded-lg"
                    >
                      <option value="imago">IMAGO Beziehungstherapie</option>
                      <option value="systemisch">Systemische Therapie</option>
                      <option value="tantra-awareness">Tantra-Awareness</option>
                      <option value="gestalt">Gestalttherapie</option>
                      <option value="gottman">Gottman-Methode</option>
                      <option value="eft">Emotionsfokussierte Therapie (EFT)</option>
                      <option value="cbt">Kognitive Verhaltenstherapie</option>
                      <option value="psychodynamisch">Psychodynamische Therapie</option>
                      <option value="achtsamkeit">Achtsamkeitsbasierte Therapie</option>
                      <option value="loesungsorientiert">Lösungsorientierte Kurzzeittherapie</option>
                    </select>
                  </div>

                  {/* Camera Settings */}
                  <div className="bg-white rounded-xl p-4 shadow">
                    <h3 className="font-bold text-amber-900 mb-3">Kamera & Emotion-Tracking</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-amber-700">Kamera aktivieren</span>
                        <button
                          onClick={() => updateSettings({ cameraEnabled: !settings.cameraEnabled })}
                          className={`w-12 h-6 rounded-full transition ${settings.cameraEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <div className={`w-5 h-5 bg-white rounded-full shadow transition transform ${settings.cameraEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                        </button>
                      </div>

                      {settings.cameraEnabled && (
                        <div className="flex items-center justify-between">
                          <span className="text-amber-700">Emotion-Tracking (alle 0.5s)</span>
                          <button
                            onClick={() => updateSettings({ emotionTrackingEnabled: !settings.emotionTrackingEnabled })}
                            className={`w-12 h-6 rounded-full transition ${settings.emotionTrackingEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                          >
                            <div className={`w-5 h-5 bg-white rounded-full shadow transition transform ${settings.emotionTrackingEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                      )}

                      {settings.cameraEnabled && settings.emotionTrackingEnabled && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <p className="text-xs text-purple-800 flex items-start gap-2">
                            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                            Bilder werden alle 0.5s analysiert für Echtzeit-Emotionserkennung. Keine Speicherung - nur Live-Analyse.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Session Defaults */}
                  <div className="bg-white rounded-xl p-4 shadow">
                    <h3 className="font-bold text-amber-900 mb-3">Sitzungs-Einstellungen</h3>
                    <div>
                      <label className="text-sm text-amber-700">Standard-Dauer (Minuten)</label>
                      <input
                        type="number"
                        value={settings.defaultSessionDuration}
                        onChange={e => updateSettings({ defaultSessionDuration: parseInt(e.target.value) || 45 })}
                        min={5}
                        max={120}
                        className="w-full mt-1 p-2 border border-amber-200 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Context Router / Vermittler-KI */}
                  {settings.aiProvider === 'claude' && (
                    <div className="bg-white rounded-xl p-4 shadow">
                      <h3 className="font-bold text-amber-900 mb-3">Vermittler-KI (Kontext-Router)</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-amber-700">Intelligente Dokumentenauswahl</span>
                          <button
                            onClick={() => updateSettings({ contextRouterEnabled: !settings.contextRouterEnabled })}
                            className={`w-12 h-6 rounded-full transition ${settings.contextRouterEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                          >
                            <div className={`w-5 h-5 bg-white rounded-full shadow transition transform ${settings.contextRouterEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                        <p className="text-xs text-amber-600">
                          Bei grosser Wissensbasis (&gt;100K Zeichen) waehlt eine schnelle KI (Haiku)
                          nur die relevanten Dokumente fuer jede Frage aus. Spart Kosten und verbessert
                          die Antwortqualitaet.
                        </p>
                        {!settings.contextRouterEnabled && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-xs text-amber-800 flex items-start gap-2">
                              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                              Deaktiviert: Alle Dokumente werden bei jedem Aufruf gesendet (bis 600K Zeichen).
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden bg-white border-t border-amber-200 px-2 py-2 flex justify-around">
            <button
              onClick={() => { setCurrentRoom(null); setActiveView('rooms'); }}
              className={`flex flex-col items-center p-2 rounded-lg ${activeView === 'rooms' && !currentRoom ? 'text-amber-600' : 'text-amber-400'}`}
            >
              <Home size={20} />
              <span className="text-[10px] mt-0.5">Home</span>
            </button>
            <button
              onClick={() => setActiveView('documents')}
              className={`flex flex-col items-center p-2 rounded-lg ${activeView === 'documents' ? 'text-amber-600' : 'text-amber-400'}`}
            >
              <FileText size={20} />
              <span className="text-[10px] mt-0.5">Docs</span>
            </button>
            <button
              onClick={() => setActiveView('messages')}
              className={`flex flex-col items-center p-2 rounded-lg relative ${activeView === 'messages' ? 'text-amber-600' : 'text-amber-400'}`}
            >
              <MessageSquare size={20} />
              <span className="text-[10px] mt-0.5">Chat</span>
              {roomMessages.filter(m => !m.isRead).length > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-[8px] rounded-full w-4 h-4 flex items-center justify-center">
                  {roomMessages.filter(m => !m.isRead).length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveView('history')}
              className={`flex flex-col items-center p-2 rounded-lg ${activeView === 'history' ? 'text-amber-600' : 'text-amber-400'}`}
            >
              <History size={20} />
              <span className="text-[10px] mt-0.5">Verlauf</span>
            </button>
            <button
              onClick={() => setActiveView('backup')}
              className={`flex flex-col items-center p-2 rounded-lg ${activeView === 'backup' ? 'text-amber-600' : 'text-amber-400'}`}
            >
              <Cloud size={20} />
              <span className="text-[10px] mt-0.5">Sync</span>
            </button>
            <button
              onClick={() => setActiveView('settings')}
              className={`flex flex-col items-center p-2 rounded-lg ${activeView === 'settings' ? 'text-amber-600' : 'text-amber-400'}`}
            >
              <SettingsIcon size={20} />
              <span className="text-[10px] mt-0.5">Setup</span>
            </button>
          </div>
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && pendingRoom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <div className="text-center mb-4">
              <Lock className="w-10 h-10 mx-auto text-amber-600 mb-2" />
              <h3 className="text-lg font-bold text-amber-900">
                {pendingRoom === 'tom' ? settings.user1Name : settings.user2Name}'s Raum
              </h3>
              <p className="text-sm text-amber-600">Passwort eingeben oder Nachricht hinterlassen</p>
            </div>
            <input
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitPassword()}
              placeholder="Passwort oder Nachricht..."
              className="w-full p-3 border border-amber-200 rounded-xl mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowPasswordModal(false); setPendingRoom(null); }}
                className="flex-1 py-2 text-amber-600 hover:bg-amber-50 rounded-xl"
              >
                Abbrechen
              </button>
              <button
                onClick={submitPassword}
                className="flex-1 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700"
              >
                Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assessment Password Modal */}
      {showAssessmentPasswordModal && assessmentPerson && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🔐</div>
              <h3 className="text-lg font-bold text-purple-900">Einzelraum-Passwort erstellen</h3>
              <p className="text-sm text-purple-600">
                Erstellen Sie ein <strong>persönliches Passwort</strong> für{' '}
                <strong>{assessmentPerson === 'tom' ? settings.user1Name : settings.user2Name}</strong>'s Einzelraum.
              </p>
            </div>
            <input
              type="password"
              value={assessmentPasswordInput}
              onChange={e => setAssessmentPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmAssessmentPassword()}
              placeholder="Mindestens 4 Zeichen..."
              className="w-full p-3 border border-purple-200 rounded-xl mb-4"
              autoFocus
            />
            <button
              onClick={confirmAssessmentPassword}
              disabled={assessmentPasswordInput.length < 4}
              className="w-full py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Check size={18} /> Passwort festlegen
            </button>
          </div>
        </div>
      )}

      {/* Session Start Modal */}
      {showSessionModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
          <h3 className="text-lg font-bold text-amber-900 mb-4">Neue Sitzung starten</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-amber-700">Dauer (Minuten)</label>
              <input
                type="number"
                value={sessionDuration}
                onChange={e => setSessionDuration(parseInt(e.target.value) || 45)}
                min={5}
                max={120}
                className="w-full mt-1 p-2 border border-amber-200 rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm text-amber-700">Ziel dieser Sitzung</label>
              <textarea
                value={sessionGoal}
                onChange={e => setSessionGoal(e.target.value)}
                placeholder="Was möchtet ihr heute erreichen?"
                rows={3}
                className="w-full mt-1 p-2 border border-amber-200 rounded-lg resize-none"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setShowSessionModal(false)}
              className="flex-1 py-2 text-amber-600 hover:bg-amber-50 rounded-xl"
            >
              Abbrechen
            </button>
            <button
              onClick={() => {
                startSession();
                setShowSessionModal(false);
              }}
              className="flex-1 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700"
            >
              Starten
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export default App;
