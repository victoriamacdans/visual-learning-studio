import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APP_CONFIG,
  type ExplanationDifficulty,
  type NarratorPersonality,
} from '../config/appConfig';
import {
  createGeminiTtsSpeechProvider,
  type SpeechProvider,
  type SpeechVoiceOption,
} from '../services/speechProvider';
import type {
  TeachLessonResponse,
  TeachLessonSegment,
} from '../types/tutor';

export type VoiceLessonStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'error';

interface UseVoiceLessonPlayerOptions {
  speechProvider?: SpeechProvider;
  onActivateSegment: (segment: TeachLessonSegment, index: number) => void;
}

export interface VoiceLessonStartupMetrics {
  readonly lessonFetchMs: number;
  readonly firstAudioMs: number;
  readonly fromCache: boolean;
}

export interface VoiceLessonPlayerState {
  readonly lesson: TeachLessonResponse | null;
  readonly status: VoiceLessonStatus;
  readonly currentSegmentIndex: number;
  readonly activeSegment: TeachLessonSegment | null;
  readonly isBufferingAudio: boolean;
  readonly errorMessage: string | null;
  readonly speechSupported: boolean;
  readonly voices: readonly SpeechVoiceOption[];
  readonly selectedVoiceId: string;
  readonly difficulty: ExplanationDifficulty;
  readonly personality: NarratorPersonality;
  readonly captionsEnabled: boolean;
  readonly settingsChangedSinceLesson: boolean;
  readonly startupMetrics: VoiceLessonStartupMetrics | null;
  readonly setSelectedVoiceId: (voiceId: string) => void;
  readonly setDifficulty: (level: ExplanationDifficulty) => void;
  readonly setPersonality: (personality: NarratorPersonality) => void;
  readonly setCaptionsEnabled: (enabled: boolean) => void;
  readonly beginLoading: () => void;
  readonly failLoading: (message: string) => void;
  readonly startLesson: (lesson: TeachLessonResponse) => void;
  readonly mergeRemainingSegments: (fullLesson: TeachLessonResponse) => void;
  readonly togglePlayPause: () => void;
  readonly retryCurrentSegment: () => void;
  readonly stop: () => void;
  readonly replay: () => void;
  readonly jumpToSegment: (index: number) => void;
  readonly clearLesson: () => void;
}

/**
 * Manages synchronized sequential voice narration across lesson segments.
 * Plays Segment 1 fast via Gemini neural TTS, sequentially preloads upcoming
 * segments in the background, and pauses with retry recovery on audio errors.
 */
export function useVoiceLessonPlayer({
  speechProvider,
  onActivateSegment,
}: UseVoiceLessonPlayerOptions): VoiceLessonPlayerState {
  const providerRef = useRef<SpeechProvider>(
    speechProvider ?? createGeminiTtsSpeechProvider(),
  );
  const onActivateSegmentRef = useRef(onActivateSegment);
  onActivateSegmentRef.current = onActivateSegment;

  const playbackRunIdRef = useRef(0);
  const preloadRunIdRef = useRef(0);
  const hasStartedSegmentAudioRef = useRef(false);
  const lessonRef = useRef<TeachLessonResponse | null>(null);
  const teachStartTimestampRef = useRef<number | null>(null);
  const lessonLoadedTimestampRef = useRef<number | null>(null);
  const selectedVoiceIdRef = useRef<string>(
    APP_CONFIG.voiceTutorConfig.defaultVoiceName,
  );

  const [lesson, setLesson] = useState<TeachLessonResponse | null>(null);
  const [status, setStatus] = useState<VoiceLessonStatus>('idle');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(0);
  const [isBufferingAudio, setIsBufferingAudio] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startupMetrics, setStartupMetrics] = useState<VoiceLessonStartupMetrics | null>(
    null,
  );
  const [speechSupported] = useState<boolean>(() =>
    providerRef.current.isSupported(),
  );
  const [voices, setVoices] = useState<SpeechVoiceOption[]>(() =>
    providerRef.current.getVoices(),
  );
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(() => {
    const initial = providerRef.current.getVoices();
    const preferred =
      initial.find((v) => v.isDefault) ??
      initial[0];
    return preferred?.id ?? APP_CONFIG.voiceTutorConfig.defaultVoiceName;
  });
  const [difficulty, setDifficulty] = useState<ExplanationDifficulty>(
    APP_CONFIG.voiceTutorConfig.defaultDifficulty,
  );
  const [personality, setPersonality] = useState<NarratorPersonality>(
    APP_CONFIG.voiceTutorConfig.defaultPersonality,
  );
  const [captionsEnabled, setCaptionsEnabled] = useState<boolean>(true);

  selectedVoiceIdRef.current = selectedVoiceId;
  lessonRef.current = lesson;

  useEffect(() => {
    const provider = providerRef.current;
    const syncVoices = () => {
      const next = provider.getVoices();
      setVoices(next);
      setSelectedVoiceId((prev) => {
        if (prev && next.some((v) => v.id === prev)) return prev;
        const preferred = next.find((v) => v.isDefault) ?? next[0];
        return preferred?.id ?? APP_CONFIG.voiceTutorConfig.defaultVoiceName;
      });
    };
    syncVoices();
    const unsubscribe = provider.subscribeVoicesChanged(syncVoices);
    return () => {
      unsubscribe();
      provider.dispose?.();
      provider.stop();
    };
  }, []);

  const preloadUpcomingSegments = useCallback(
    async (
      targetLesson: TeachLessonResponse,
      fromIndex: number,
      voiceId: string,
      preloadRunId: number,
    ) => {
      const preloadFn = providerRef.current.preload;
      if (!preloadFn) return;
      const tasks: Array<Promise<void>> = [];
      for (let i = fromIndex; i < targetLesson.segments.length; i += 1) {
        if (preloadRunId !== preloadRunIdRef.current) return;
        tasks.push(
          preloadFn(targetLesson.segments[i].spokenText, {
            voiceId,
            styleContext: {
              personality: targetLesson.personality,
              difficulty: targetLesson.difficulty,
            },
          }),
        );
      }
      // SpeechProvider enforces max concurrency = 2 so Segment 1 is never starved
      await Promise.all(tasks);
    },
    [],
  );

  const speakSegmentAtIndex = useCallback(
    (targetLesson: TeachLessonResponse, index: number, runId: number) => {
      if (runId !== playbackRunIdRef.current) return;
      const activeLessonNow = lessonRef.current ?? targetLesson;
      if (index < 0 || index >= activeLessonNow.segments.length) {
        setIsBufferingAudio(false);
        setStatus('completed');
        return;
      }

      const segment = activeLessonNow.segments[index];
      hasStartedSegmentAudioRef.current = false;
      setCurrentSegmentIndex(index);
      setErrorMessage(null);
      setStatus('playing');

      // Synchronize 3D camera, component highlight, and animation immediately on segment start
      onActivateSegmentRef.current(segment, index);

      if (!providerRef.current.isSupported()) {
        setIsBufferingAudio(false);
        setStatus('paused');
        setErrorMessage(
          'Audio playback is unavailable in this browser; captions and 3D steps remain active.',
        );
        return;
      }

      const activeVoiceId = selectedVoiceIdRef.current;

      providerRef.current.speak(
        segment.spokenText,
        {
          voiceId: activeVoiceId || undefined,
          rate: APP_CONFIG.voiceTutorConfig.defaultSpeechRate,
          styleContext: {
            personality: activeLessonNow.personality,
            difficulty: activeLessonNow.difficulty,
          },
        },
        {
          onBufferingChange: (buffering) => {
            if (runId !== playbackRunIdRef.current) return;
            setIsBufferingAudio(buffering);
          },
          onStart: () => {
            if (runId !== playbackRunIdRef.current) return;
            hasStartedSegmentAudioRef.current = true;
            setIsBufferingAudio(false);
            if (index === 0 && teachStartTimestampRef.current !== null) {
              const now = performance.now();
              const tLesson = lessonLoadedTimestampRef.current ?? now;
              setStartupMetrics({
                lessonFetchMs: Math.round(tLesson - teachStartTimestampRef.current),
                firstAudioMs: Math.round(now - teachStartTimestampRef.current),
                fromCache: Boolean(activeLessonNow.cached),
              });
              teachStartTimestampRef.current = null;
            }
            // Begin bounded-concurrency preloading of upcoming segments using latest merged lesson
            const latestLesson = lessonRef.current ?? activeLessonNow;
            preloadRunIdRef.current += 1;
            void preloadUpcomingSegments(
              latestLesson,
              index + 1,
              activeVoiceId,
              preloadRunIdRef.current,
            );
          },
          onEnd: () => {
            if (runId !== playbackRunIdRef.current) return;
            setIsBufferingAudio(false);
            const latestLesson = lessonRef.current ?? activeLessonNow;
            const nextIndex = index + 1;
            if (nextIndex < latestLesson.segments.length) {
              speakSegmentAtIndex(latestLesson, nextIndex, runId);
            } else {
              setStatus('completed');
            }
          },
          onError: (msg) => {
            if (runId !== playbackRunIdRef.current) return;
            // Pause cleanly with retry recovery while keeping 3D focus and captions active
            setIsBufferingAudio(false);
            setStatus('paused');
            setErrorMessage(msg);
          },
        },
      );
    },
    [preloadUpcomingSegments],
  );

  const beginLoading = useCallback(() => {
    teachStartTimestampRef.current = performance.now();
    lessonLoadedTimestampRef.current = null;
    playbackRunIdRef.current += 1;
    preloadRunIdRef.current += 1;
    providerRef.current.unlock();
    providerRef.current.stop();
    setIsBufferingAudio(false);
    setErrorMessage(null);
    setStatus('loading');
  }, []);

  const failLoading = useCallback((message: string) => {
    teachStartTimestampRef.current = null;
    playbackRunIdRef.current += 1;
    preloadRunIdRef.current += 1;
    providerRef.current.stop();
    setIsBufferingAudio(false);
    setErrorMessage(message);
    setStatus('error');
  }, []);

  const startLesson = useCallback(
    (nextLesson: TeachLessonResponse) => {
      lessonLoadedTimestampRef.current = performance.now();
      playbackRunIdRef.current += 1;
      preloadRunIdRef.current += 1;
      const runId = playbackRunIdRef.current;
      lessonRef.current = nextLesson;
      setLesson(nextLesson);
      setCurrentSegmentIndex(0);
      speakSegmentAtIndex(nextLesson, 0, runId);

      // Immediately start preloading Segment 2 alongside Segment 1 playback (bounded concurrency = 2)
      if (nextLesson.segments.length > 1) {
        preloadRunIdRef.current += 1;
        void preloadUpcomingSegments(
          nextLesson,
          1,
          selectedVoiceIdRef.current,
          preloadRunIdRef.current,
        );
      }
    },
    [preloadUpcomingSegments, speakSegmentAtIndex],
  );

  /**
   * Merges full 4–6 segment response onto an already-started fast Segment 1 lesson
   * without interrupting active Segment 1 audio or resetting playback state.
   */
  const mergeRemainingSegments = useCallback(
    (fullLesson: TeachLessonResponse) => {
      const current = lessonRef.current;
      if (!current) {
        startLesson(fullLesson);
        return;
      }
      if (current.segments.length >= fullLesson.segments.length && !current.isPartialFirstSegment) {
        return;
      }
      // Keep Segment 0 intact so active audio never swaps out from under the student,
      // and append segments 1..N from the full lesson
      const firstSeg = current.segments[0];
      const tailSegs = fullLesson.segments.slice(1);
      const merged: TeachLessonResponse = {
        ...fullLesson,
        isPartialFirstSegment: false,
        segments: firstSeg ? [firstSeg, ...tailSegs] : fullLesson.segments,
      };
      lessonRef.current = merged;
      setLesson(merged);

      preloadRunIdRef.current += 1;
      void preloadUpcomingSegments(
        merged,
        1,
        selectedVoiceIdRef.current,
        preloadRunIdRef.current,
      );
    },
    [preloadUpcomingSegments, startLesson],
  );

  const retryCurrentSegment = useCallback(() => {
    const activeLesson = lessonRef.current;
    if (!activeLesson) return;
    providerRef.current.unlock();
    playbackRunIdRef.current += 1;
    const safeIdx = Math.max(
      0,
      Math.min(activeLesson.segments.length - 1, currentSegmentIndex),
    );
    speakSegmentAtIndex(activeLesson, safeIdx, playbackRunIdRef.current);
  }, [currentSegmentIndex, speakSegmentAtIndex]);

  const togglePlayPause = useCallback(() => {
    const activeLesson = lessonRef.current;
    if (!activeLesson) return;
    providerRef.current.unlock();

    if (status === 'playing') {
      providerRef.current.pause();
      setStatus('paused');
      return;
    }

    if (status === 'paused') {
      if (!providerRef.current.isSupported()) {
        return;
      }
      // If paused due to an audio synthesis error or before audio loaded, re-trigger segment synthesis
      if (errorMessage || !hasStartedSegmentAudioRef.current) {
        playbackRunIdRef.current += 1;
        speakSegmentAtIndex(
          activeLesson,
          currentSegmentIndex,
          playbackRunIdRef.current,
        );
        return;
      }
      providerRef.current.resume();
      setStatus('playing');
      return;
    }

    // From idle / completed / error, play from current (or restart if completed)
    const startIdx =
      status === 'completed' || currentSegmentIndex >= activeLesson.segments.length
        ? 0
        : currentSegmentIndex;
    playbackRunIdRef.current += 1;
    speakSegmentAtIndex(activeLesson, startIdx, playbackRunIdRef.current);
  }, [currentSegmentIndex, errorMessage, speakSegmentAtIndex, status]);

  const stop = useCallback(() => {
    playbackRunIdRef.current += 1;
    preloadRunIdRef.current += 1;
    providerRef.current.stop();
    setIsBufferingAudio(false);
    setCurrentSegmentIndex(0);
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  const replay = useCallback(() => {
    const activeLesson = lessonRef.current;
    if (!activeLesson) return;
    providerRef.current.unlock();
    playbackRunIdRef.current += 1;
    speakSegmentAtIndex(activeLesson, 0, playbackRunIdRef.current);
  }, [speakSegmentAtIndex]);

  const jumpToSegment = useCallback(
    (index: number) => {
      const activeLesson = lessonRef.current;
      if (!activeLesson) return;
      providerRef.current.unlock();
      const clamped = Math.max(0, Math.min(activeLesson.segments.length - 1, index));
      playbackRunIdRef.current += 1;
      speakSegmentAtIndex(activeLesson, clamped, playbackRunIdRef.current);
    },
    [speakSegmentAtIndex],
  );

  const clearLesson = useCallback(() => {
    playbackRunIdRef.current += 1;
    preloadRunIdRef.current += 1;
    providerRef.current.stop();
    lessonRef.current = null;
    setLesson(null);
    setIsBufferingAudio(false);
    setCurrentSegmentIndex(0);
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  const handleSelectVoiceId = useCallback(
    (voiceId: string) => {
      selectedVoiceIdRef.current = voiceId;
      setSelectedVoiceId(voiceId);
      preloadRunIdRef.current += 1;
      const activeLesson = lessonRef.current;
      if (status === 'playing' && activeLesson) {
        providerRef.current.unlock();
        playbackRunIdRef.current += 1;
        speakSegmentAtIndex(
          activeLesson,
          currentSegmentIndex,
          playbackRunIdRef.current,
        );
      }
    },
    [currentSegmentIndex, speakSegmentAtIndex, status],
  );

  const activeSegment =
    lesson && lesson.segments[currentSegmentIndex]
      ? lesson.segments[currentSegmentIndex]
      : null;

  const settingsChangedSinceLesson = Boolean(
    lesson &&
      (lesson.difficulty !== difficulty || lesson.personality !== personality),
  );

  return {
    lesson,
    status,
    currentSegmentIndex,
    activeSegment,
    isBufferingAudio,
    errorMessage,
    speechSupported,
    voices,
    selectedVoiceId,
    difficulty,
    personality,
    captionsEnabled,
    settingsChangedSinceLesson,
    startupMetrics,
    setSelectedVoiceId: handleSelectVoiceId,
    setDifficulty,
    setPersonality,
    setCaptionsEnabled,
    beginLoading,
    failLoading,
    startLesson,
    mergeRemainingSegments,
    togglePlayPause,
    retryCurrentSegment,
    stop,
    replay,
    jumpToSegment,
    clearLesson,
  };
}
