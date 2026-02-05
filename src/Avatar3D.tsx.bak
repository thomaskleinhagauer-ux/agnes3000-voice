// ================================
// IMAGO VOICE - 3D Avatar Component
// Professional avatar with emotion display
// ================================

import React, { useRef, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { FaceEmotion } from './emotionDetection';

// Default Ready Player Me avatar URL (professional female therapist avatar)
const DEFAULT_AVATAR_URL = 'https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb';

// Emotion to morph target mapping for Ready Player Me avatars
const EMOTION_MORPHS: Record<FaceEmotion, Record<string, number>> = {
  happy: {
    mouthSmile: 0.8,
    eyeSquintLeft: 0.3,
    eyeSquintRight: 0.3,
    browInnerUp: 0.2,
  },
  sad: {
    mouthFrownLeft: 0.6,
    mouthFrownRight: 0.6,
    browDownLeft: 0.4,
    browDownRight: 0.4,
    eyeSquintLeft: 0.2,
    eyeSquintRight: 0.2,
  },
  angry: {
    browDownLeft: 0.7,
    browDownRight: 0.7,
    mouthFrownLeft: 0.4,
    mouthFrownRight: 0.4,
    jawForward: 0.3,
  },
  surprised: {
    eyeWideLeft: 0.8,
    eyeWideRight: 0.8,
    browInnerUp: 0.6,
    browOuterUpLeft: 0.5,
    browOuterUpRight: 0.5,
    mouthOpen: 0.4,
  },
  fearful: {
    eyeWideLeft: 0.6,
    eyeWideRight: 0.6,
    browInnerUp: 0.8,
    mouthOpen: 0.3,
  },
  disgusted: {
    noseSneerLeft: 0.6,
    noseSneerRight: 0.6,
    browDownLeft: 0.3,
    browDownRight: 0.3,
    mouthUpperUpLeft: 0.4,
  },
  neutral: {},
};

// Speaking animation morph targets
const SPEAKING_MORPHS = ['viseme_aa', 'viseme_O', 'viseme_U', 'viseme_E', 'viseme_I'];

interface AvatarModelProps {
  url: string;
  emotion: FaceEmotion;
  isSpeaking: boolean;
  scale?: number;
}

// The actual 3D model component
function AvatarModel({ url, emotion, isSpeaking, scale = 2 }: AvatarModelProps) {
  const { scene } = useGLTF(url);
  const meshRef = useRef<THREE.Group>(null);
  const [morphTargets, setMorphTargets] = useState<THREE.Mesh | null>(null);
  const speakingPhase = useRef(0);

  // Find the mesh with morph targets
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.morphTargetInfluences) {
        setMorphTargets(child);
      }
    });
  }, [scene]);

  // Animate morph targets
  useFrame((state, delta) => {
    if (!morphTargets || !morphTargets.morphTargetDictionary || !morphTargets.morphTargetInfluences) return;

    const dict = morphTargets.morphTargetDictionary;
    const influences = morphTargets.morphTargetInfluences;

    // Reset all morph targets gradually
    for (let i = 0; i < influences.length; i++) {
      influences[i] = THREE.MathUtils.lerp(influences[i], 0, delta * 5);
    }

    // Apply emotion morphs
    const emotionMorphs = EMOTION_MORPHS[emotion] || {};
    for (const [morphName, targetValue] of Object.entries(emotionMorphs)) {
      const index = dict[morphName];
      if (index !== undefined) {
        influences[index] = THREE.MathUtils.lerp(influences[index], targetValue, delta * 3);
      }
    }

    // Apply speaking animation
    if (isSpeaking) {
      speakingPhase.current += delta * 8;
      const visemeIndex = Math.floor(speakingPhase.current % SPEAKING_MORPHS.length);
      const visemeName = SPEAKING_MORPHS[visemeIndex];
      const index = dict[visemeName];

      if (index !== undefined) {
        const intensity = (Math.sin(speakingPhase.current * 2) + 1) / 2 * 0.6;
        influences[index] = intensity;
      }

      // Jaw movement for speaking
      const jawIndex = dict['jawOpen'];
      if (jawIndex !== undefined) {
        influences[jawIndex] = (Math.sin(speakingPhase.current * 3) + 1) / 2 * 0.3;
      }
    }

    // Idle animation - subtle breathing and blinking
    const time = state.clock.elapsedTime;

    // Blinking
    const blinkCycle = (time * 0.5) % 4;
    if (blinkCycle > 3.8) {
      const blinkLeft = dict['eyeBlinkLeft'];
      const blinkRight = dict['eyeBlinkRight'];
      if (blinkLeft !== undefined) influences[blinkLeft] = 1;
      if (blinkRight !== undefined) influences[blinkRight] = 1;
    }

    // Subtle head movement
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(time * 0.3) * 0.05;
      meshRef.current.rotation.x = Math.sin(time * 0.2) * 0.02;
    }
  });

  return (
    <group ref={meshRef} scale={[scale, scale, scale]} position={[0, -1.5, 0]}>
      <primitive object={scene} />
    </group>
  );
}

interface Avatar3DProps {
  emotion?: FaceEmotion;
  isSpeaking?: boolean;
  avatarUrl?: string;
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

// Main Avatar component with Canvas
export const Avatar3D: React.FC<Avatar3DProps> = ({
  emotion = 'neutral',
  isSpeaking = false,
  avatarUrl = DEFAULT_AVATAR_URL,
  className = '',
  size = 'medium',
}) => {
  const sizeClasses = {
    small: 'w-20 h-20',
    medium: 'w-32 h-32',
    large: 'w-48 h-48',
  };

  const [error, setError] = useState(false);

  if (error) {
    // Fallback to emoji if 3D fails
    const emotionEmojis: Record<FaceEmotion, string> = {
      happy: '😊',
      sad: '😢',
      angry: '😠',
      surprised: '😲',
      fearful: '😨',
      disgusted: '🤢',
      neutral: '😐',
    };

    return (
      <div className={`${sizeClasses[size]} flex items-center justify-center text-4xl ${className}`}>
        {emotionEmojis[emotion]}
      </div>
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full overflow-hidden bg-gradient-to-b from-amber-100 to-amber-200 ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 2.5], fov: 30 }}
        onError={() => setError(true)}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          <AvatarModel
            url={avatarUrl}
            emotion={emotion}
            isSpeaking={isSpeaking}
            scale={2.2}
          />
          <Environment preset="studio" />
        </Suspense>
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 2.5}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  );
};

// Preload the default avatar
useGLTF.preload(DEFAULT_AVATAR_URL);

export default Avatar3D;
