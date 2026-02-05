// ================================
// IMAGO VOICE - Animated SVG Avatar
// Professional avatar without Three.js dependency
// Compatible with React 19
// ================================

import React, { useEffect, useState } from 'react';
import { FaceEmotion } from './emotionDetection';

interface AnimatedAvatarProps {
  emotion?: FaceEmotion;
  isSpeaking?: boolean;
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

// Emotion configurations for the avatar
const EMOTION_CONFIG: Record<FaceEmotion, {
  eyeShape: string;
  mouthPath: string;
  browOffset: number;
  color: string;
}> = {
  happy: {
    eyeShape: 'M12,8 Q15,6 18,8 Q15,10 12,8',
    mouthPath: 'M10,18 Q15,24 20,18',
    browOffset: -1,
    color: '#FFD700',
  },
  sad: {
    eyeShape: 'M12,9 Q15,8 18,9',
    mouthPath: 'M10,20 Q15,16 20,20',
    browOffset: 2,
    color: '#6B7280',
  },
  angry: {
    eyeShape: 'M12,9 L18,7',
    mouthPath: 'M10,19 L20,19',
    browOffset: 3,
    color: '#EF4444',
  },
  surprised: {
    eyeShape: 'M12,7 Q15,5 18,7 Q15,11 12,7',
    mouthPath: 'M13,17 Q15,22 17,17 Q15,22 13,17',
    browOffset: -3,
    color: '#8B5CF6',
  },
  fearful: {
    eyeShape: 'M12,7 Q15,5 18,7 Q15,10 12,7',
    mouthPath: 'M12,19 Q15,17 18,19',
    browOffset: -2,
    color: '#F59E0B',
  },
  disgusted: {
    eyeShape: 'M12,9 Q15,10 18,9',
    mouthPath: 'M10,18 Q12,20 15,17 Q18,20 20,18',
    browOffset: 1,
    color: '#10B981',
  },
  neutral: {
    eyeShape: 'M12,8 Q15,8 18,8',
    mouthPath: 'M10,18 L20,18',
    browOffset: 0,
    color: '#F59E0B',
  },
};

export const AnimatedAvatar: React.FC<AnimatedAvatarProps> = ({
  emotion = 'neutral',
  isSpeaking = false,
  className = '',
  size = 'medium',
}) => {
  const [blinkState, setBlinkState] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  const config = EMOTION_CONFIG[emotion];

  // Blinking animation
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinkState(true);
      setTimeout(() => setBlinkState(false), 150);
    }, 3000 + Math.random() * 2000);

    return () => clearInterval(blinkInterval);
  }, []);

  // Speaking animation
  useEffect(() => {
    if (isSpeaking) {
      const speakInterval = setInterval(() => {
        setMouthOpen(Math.random());
      }, 100);
      return () => clearInterval(speakInterval);
    } else {
      setMouthOpen(0);
    }
  }, [isSpeaking]);

  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-24 h-24',
    large: 'w-40 h-40',
  };

  const sizeValues = {
    small: 48,
    medium: 96,
    large: 160,
  };

  const svgSize = sizeValues[size];

  // Calculate mouth path based on speaking state
  const getMouthPath = () => {
    if (isSpeaking) {
      const openAmount = mouthOpen * 4;
      if (emotion === 'happy') {
        return `M10,${18 - openAmount} Q15,${24 + openAmount} 20,${18 - openAmount}`;
      }
      return `M10,${18 - openAmount} Q15,${18 + openAmount * 2} 20,${18 - openAmount}`;
    }
    return config.mouthPath;
  };

  return (
    <div className={`${sizeClasses[size]} ${className} relative`}>
      <svg
        viewBox="0 0 30 30"
        width={svgSize}
        height={svgSize}
        className="transition-all duration-300"
      >
        {/* Background circle with gradient */}
        <defs>
          <linearGradient id={`grad-${emotion}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: config.color, stopOpacity: 0.3 }} />
            <stop offset="100%" style={{ stopColor: config.color, stopOpacity: 0.1 }} />
          </linearGradient>
          <filter id="shadow">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.2" />
          </filter>
        </defs>

        {/* Face background */}
        <circle
          cx="15"
          cy="15"
          r="14"
          fill={`url(#grad-${emotion})`}
          stroke={config.color}
          strokeWidth="0.5"
          filter="url(#shadow)"
        />

        {/* Hair */}
        <path
          d="M5,12 Q5,3 15,3 Q25,3 25,12 L24,10 Q24,5 15,5 Q6,5 6,10 Z"
          fill="#8B4513"
          opacity="0.8"
        />

        {/* Left eyebrow */}
        <path
          d={`M8,${7 + config.browOffset} Q10,${5 + config.browOffset} 12,${7 + config.browOffset}`}
          stroke="#8B4513"
          strokeWidth="0.8"
          fill="none"
          strokeLinecap="round"
        />

        {/* Right eyebrow */}
        <path
          d={`M18,${7 + config.browOffset} Q20,${5 + config.browOffset} 22,${7 + config.browOffset}`}
          stroke="#8B4513"
          strokeWidth="0.8"
          fill="none"
          strokeLinecap="round"
        />

        {/* Left eye */}
        <g className="transition-all duration-150">
          {blinkState ? (
            <path d="M8,10 L13,10" stroke="#333" strokeWidth="0.8" strokeLinecap="round" />
          ) : (
            <>
              <ellipse cx="10.5" cy="10" rx="2" ry="2.2" fill="white" />
              <circle cx="10.5" cy="10" r="1.2" fill="#4A3728" />
              <circle cx="11" cy="9.5" r="0.4" fill="white" />
            </>
          )}
        </g>

        {/* Right eye */}
        <g className="transition-all duration-150">
          {blinkState ? (
            <path d="M17,10 L22,10" stroke="#333" strokeWidth="0.8" strokeLinecap="round" />
          ) : (
            <>
              <ellipse cx="19.5" cy="10" rx="2" ry="2.2" fill="white" />
              <circle cx="19.5" cy="10" r="1.2" fill="#4A3728" />
              <circle cx="20" cy="9.5" r="0.4" fill="white" />
            </>
          )}
        </g>

        {/* Nose */}
        <path
          d="M15,11 L14,14 L15,14.5 L16,14 L15,11"
          fill="#DEB887"
          opacity="0.5"
        />

        {/* Mouth */}
        <path
          d={getMouthPath()}
          stroke="#C9544D"
          strokeWidth="1"
          fill={isSpeaking ? '#8B0000' : 'none'}
          strokeLinecap="round"
          className="transition-all duration-100"
        />

        {/* Cheeks (for happy emotion) */}
        {emotion === 'happy' && (
          <>
            <circle cx="6" cy="14" r="2" fill="#FFB6C1" opacity="0.4" />
            <circle cx="24" cy="14" r="2" fill="#FFB6C1" opacity="0.4" />
          </>
        )}

        {/* Tears (for sad emotion) */}
        {emotion === 'sad' && (
          <path
            d="M8,12 Q7,15 8,17"
            stroke="#87CEEB"
            strokeWidth="0.8"
            fill="none"
            opacity="0.6"
          />
        )}

        {/* Anger marks */}
        {emotion === 'angry' && (
          <>
            <path d="M3,5 L5,6 M4,4 L5,6" stroke="#EF4444" strokeWidth="0.5" />
            <path d="M27,5 L25,6 M26,4 L25,6" stroke="#EF4444" strokeWidth="0.5" />
          </>
        )}
      </svg>

      {/* Speaking indicator */}
      {isSpeaking && (
        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 flex gap-0.5">
          <span className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      )}
    </div>
  );
};

export default AnimatedAvatar;
