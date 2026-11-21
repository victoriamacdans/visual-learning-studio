/**
 * Centralized application configuration for Visual Learning Studio.
 * All UI defaults, simulation bounds, screen capture constraints, and Gemini
 * model settings are maintained here rather than hardcoded inside components.
 */

export type StudyModuleId =
  | 'turbofan'
  | 'brayton-cycle'
  | 'supersonic-nozzle'
  | 'thrust-vectoring';

export type PanelId = 'pdf' | 'visualization' | 'tutor';

export type VisualizationLayerMode = 'cutaway' | 'airflow' | 'thermal';

export type LearningInputMode = 'pdf' | 'screen';

export type ExplanationDifficulty =
  | 'beginner'
  | 'simple'
  | 'intermediate'
  | 'advanced';

export type NarratorPersonality = 'friendly' | 'professional' | 'gen-z';

export type GeminiVoiceName = 'Puck' | 'Zephyr' | 'Kore' | 'Charon' | 'Fenrir';

export interface GeminiVoiceCatalogEntry {
  readonly id: GeminiVoiceName;
  readonly label: string;
  readonly character: string;
}

export const GEMINI_TTS_VOICES: readonly GeminiVoiceCatalogEntry[] = [
  { id: 'Puck', label: 'Puck (Bright & Energetic)', character: 'Bright, energetic' },
  { id: 'Zephyr', label: 'Zephyr (Warm & Upbeat)', character: 'Warm, upbeat' },
  { id: 'Kore', label: 'Kore (Clear & Balanced)', character: 'Clear, balanced' },
  { id: 'Charon', label: 'Charon (Calm & Deep)', character: 'Calm, steady' },
  { id: 'Fenrir', label: 'Fenrir (Bold & Expressive)', character: 'Bold, expressive' },
];

export interface AppConfig {
  readonly appName: string;
  readonly themeLabel: string;
  readonly pdfDefaults: {
    readonly initialZoomPercent: number;
    readonly minZoomPercent: number;
    readonly maxZoomPercent: number;
    readonly zoomStepPercent: number;
    readonly maxUploadBytes: number;
    readonly maxContextChars: number;
  };
  readonly screenCaptureDefaults: {
    readonly maxImageDimension: number;
    readonly jpegQuality: number;
    readonly maxBase64Chars: number;
    readonly minSelectionPx: number;
  };
  readonly simulationDefaults: {
    readonly initialThrottlePercent: number;
    readonly minThrottlePercent: number;
    readonly maxThrottlePercent: number;
    readonly simulationModelNote: string;
  };
  readonly aiTutorConfig: {
    readonly defaultModel: string;
    readonly maxQuestionChars: number;
    readonly maxHighlightChars: number;
  };
  readonly voiceTutorConfig: {
    readonly defaultDifficulty: ExplanationDifficulty;
    readonly defaultPersonality: NarratorPersonality;
    readonly ttsModel: string;
    readonly defaultVoiceName: GeminiVoiceName;
    readonly maxTtsChars: number;
    readonly minSegments: number;
    readonly maxSegments: number;
    readonly defaultSpeechRate: number;
  };
  readonly scene3DLimits: {
    readonly maxComponents: number;
    readonly maxSubShapesPerComponent: number;
    readonly maxConnections: number;
    readonly maxPointsPerProfile: number;
    readonly maxCoordinateMagnitude: number;
    readonly minDimension: number;
    readonly maxDimension: number;
    readonly maxAnimationSpeed: number;
    readonly maxExplodeDistance: number;
  };
  readonly assetDefaults: {
    readonly maxGlbUploadBytes: number;
    readonly targetNormalizedExtent: number;
  };
  readonly showcaseDefaults: {
    readonly defaultPlaybackSpeed: number;
    readonly minPlaybackSpeed: number;
    readonly maxPlaybackSpeed: number;
    readonly inlineSixFiringOrder: readonly [number, number, number, number, number, number];
    readonly robotDefaultBaseTurnDeg: number;
  };
}

export const APP_CONFIG: AppConfig = {
  appName: 'Visual Learning Studio',
  themeLabel: 'Element 119 · Five Showcase Demonstrations',
  pdfDefaults: {
    initialZoomPercent: 100,
    minZoomPercent: 60,
    maxZoomPercent: 180,
    zoomStepPercent: 15,
    maxUploadBytes: 25 * 1024 * 1024,
    maxContextChars: 4000,
  },
  screenCaptureDefaults: {
    maxImageDimension: 1280,
    jpegQuality: 0.88,
    maxBase64Chars: 5_000_000,
    minSelectionPx: 14,
  },
  simulationDefaults: {
    initialThrottlePercent: 62,
    minThrottlePercent: 15,
    maxThrottlePercent: 100,
    simulationModelNote: 'Simplified educational model',
  },
  aiTutorConfig: {
    defaultModel: 'gemini-4-hydrogen',
    maxQuestionChars: 1000,
    maxHighlightChars: 2000,
  },
  voiceTutorConfig: {
    defaultDifficulty: 'beginner',
    defaultPersonality: 'friendly',
    ttsModel: 'gemini-3.8-flash-lite-tts',
    defaultVoiceName: 'Puck',
    maxTtsChars: 750,
    minSegments: 4,
    maxSegments: 6,
    defaultSpeechRate: 1.0,
  },
  scene3DLimits: {
    maxComponents: 16,
    maxSubShapesPerComponent: 8,
    maxConnections: 24,
    maxPointsPerProfile: 28,
    maxCoordinateMagnitude: 20,
    minDimension: 0.02,
    maxDimension: 16,
    maxAnimationSpeed: 12,
    maxExplodeDistance: 6,
  },
  assetDefaults: {
    maxGlbUploadBytes: 50 * 1024 * 1024,
    targetNormalizedExtent: 5.8,
  },
  showcaseDefaults: {
    defaultPlaybackSpeed: 1,
    minPlaybackSpeed: 0.25,
    maxPlaybackSpeed: 3,
    inlineSixFiringOrder: [1, 5, 3, 6, 2, 4],
    robotDefaultBaseTurnDeg: 90,
  },
};

