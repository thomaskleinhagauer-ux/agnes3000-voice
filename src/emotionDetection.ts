// ================================
// IMAGO VOICE - Professional Emotion Detection
// Using face-api.js for facial expression recognition
// ================================

import * as faceapi from '@vladmandic/face-api';

// Emotion types supported by face-api.js
export type FaceEmotion = 'angry' | 'disgusted' | 'fearful' | 'happy' | 'neutral' | 'sad' | 'surprised';

// Extended emotion analysis result
export interface FaceEmotionAnalysis {
  dominant: FaceEmotion;
  confidence: number;
  all: Record<FaceEmotion, number>;
  faceDetected: boolean;
  timestamp: number;
}

// Model loading state
let modelsLoaded = false;
let modelsLoading = false;

// CDN URL for face-api models
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

/**
 * Load face-api.js models from CDN
 */
export const loadFaceApiModels = async (): Promise<boolean> => {
  if (modelsLoaded) return true;
  if (modelsLoading) {
    // Wait for models to load
    while (modelsLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return modelsLoaded;
  }

  modelsLoading = true;

  try {
    console.log('Loading face-api.js models...');

    // Load required models
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ]);

    modelsLoaded = true;
    console.log('Face-api.js models loaded successfully');
    return true;
  } catch (error) {
    console.error('Failed to load face-api.js models:', error);
    modelsLoading = false;
    return false;
  } finally {
    modelsLoading = false;
  }
};

/**
 * Check if models are loaded
 */
export const areModelsLoaded = (): boolean => modelsLoaded;

/**
 * Detect emotions from a video element
 */
export const detectEmotionFromVideo = async (
  videoElement: HTMLVideoElement
): Promise<FaceEmotionAnalysis | null> => {
  if (!modelsLoaded) {
    const loaded = await loadFaceApiModels();
    if (!loaded) return null;
  }

  try {
    // Detect face with expressions
    const detection = await faceapi
      .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.5
      }))
      .withFaceExpressions();

    if (!detection) {
      return {
        dominant: 'neutral',
        confidence: 0,
        all: {
          angry: 0,
          disgusted: 0,
          fearful: 0,
          happy: 0,
          neutral: 1,
          sad: 0,
          surprised: 0,
        },
        faceDetected: false,
        timestamp: Date.now(),
      };
    }

    // Get all expression scores
    const expressions = detection.expressions;
    const all: Record<FaceEmotion, number> = {
      angry: expressions.angry,
      disgusted: expressions.disgusted,
      fearful: expressions.fearful,
      happy: expressions.happy,
      neutral: expressions.neutral,
      sad: expressions.sad,
      surprised: expressions.surprised,
    };

    // Find dominant emotion
    let dominant: FaceEmotion = 'neutral';
    let maxScore = 0;

    for (const [emotion, score] of Object.entries(all)) {
      if (score > maxScore) {
        maxScore = score;
        dominant = emotion as FaceEmotion;
      }
    }

    return {
      dominant,
      confidence: maxScore,
      all,
      faceDetected: true,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Emotion detection error:', error);
    return null;
  }
};

/**
 * Detect emotions from a canvas or image element
 */
export const detectEmotionFromImage = async (
  imageElement: HTMLCanvasElement | HTMLImageElement
): Promise<FaceEmotionAnalysis | null> => {
  if (!modelsLoaded) {
    const loaded = await loadFaceApiModels();
    if (!loaded) return null;
  }

  try {
    const detection = await faceapi
      .detectSingleFace(imageElement, new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.5
      }))
      .withFaceExpressions();

    if (!detection) {
      return null;
    }

    const expressions = detection.expressions;
    const all: Record<FaceEmotion, number> = {
      angry: expressions.angry,
      disgusted: expressions.disgusted,
      fearful: expressions.fearful,
      happy: expressions.happy,
      neutral: expressions.neutral,
      sad: expressions.sad,
      surprised: expressions.surprised,
    };

    let dominant: FaceEmotion = 'neutral';
    let maxScore = 0;

    for (const [emotion, score] of Object.entries(all)) {
      if (score > maxScore) {
        maxScore = score;
        dominant = emotion as FaceEmotion;
      }
    }

    return {
      dominant,
      confidence: maxScore,
      all,
      faceDetected: true,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Emotion detection error:', error);
    return null;
  }
};

/**
 * Map face-api emotions to German descriptions
 */
export const emotionToGerman: Record<FaceEmotion, string> = {
  angry: 'Wütend',
  disgusted: 'Angewidert',
  fearful: 'Ängstlich',
  happy: 'Glücklich',
  neutral: 'Neutral',
  sad: 'Traurig',
  surprised: 'Überrascht',
};

/**
 * Map face-api emotions to therapy-relevant descriptions
 */
export const emotionToTherapyContext: Record<FaceEmotion, string> = {
  angry: 'zeigt Frustration oder Ärger',
  disgusted: 'wirkt abgestoßen oder ablehnend',
  fearful: 'zeigt Angst oder Besorgnis',
  happy: 'wirkt zufrieden und positiv gestimmt',
  neutral: 'zeigt keine starken Emotionen',
  sad: 'wirkt traurig oder niedergeschlagen',
  surprised: 'zeigt Überraschung oder Erstaunen',
};

/**
 * Get a summary of detected emotions for the AI context
 */
export const getEmotionSummary = (analysis: FaceEmotionAnalysis): string => {
  if (!analysis.faceDetected) {
    return 'Kein Gesicht erkannt.';
  }

  const dominant = emotionToGerman[analysis.dominant];
  const context = emotionToTherapyContext[analysis.dominant];
  const confidence = Math.round(analysis.confidence * 100);

  // Find secondary emotion if significant
  const sorted = Object.entries(analysis.all)
    .filter(([emotion]) => emotion !== analysis.dominant)
    .sort(([, a], [, b]) => b - a);

  const secondary = sorted[0];
  const secondaryInfo = secondary && secondary[1] > 0.2
    ? ` Mit Anzeichen von ${emotionToGerman[secondary[0] as FaceEmotion]} (${Math.round(secondary[1] * 100)}%).`
    : '';

  return `${dominant} (${confidence}% Konfidenz) - ${context}.${secondaryInfo}`;
};
