import {
  Captions,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
} from 'lucide-react';
import type {
  ExplanationDifficulty,
  NarratorPersonality,
} from '../config/appConfig';
import type { VoiceLessonPlayerState } from '../hooks/useVoiceLessonPlayer';

interface VoiceTutorBarProps {
  player: VoiceLessonPlayerState;
  activeModelTitle: string;
  onTeachMe: () => void;
}

const DIFFICULTY_OPTIONS: readonly {
  id: ExplanationDifficulty;
  label: string;
}[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'simple', label: 'Simple' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];

const PERSONALITY_OPTIONS: readonly {
  id: NarratorPersonality;
  label: string;
}[] = [
  { id: 'friendly', label: 'Friendly' },
  { id: 'professional', label: 'Professional' },
  { id: 'gen-z', label: 'Gen Z' },
];

/**
 * Compact AI Voice Tutor dock inside Panel 3.
 * Provides Teach Me generation, difficulty/personality/voice controls,
 * Play/Pause/Stop/Replay playback, captions toggle, and segment step synchronization.
 */
export function VoiceTutorBar({
  player,
  activeModelTitle,
  onTeachMe,
}: VoiceTutorBarProps) {
  const {
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
    setSelectedVoiceId,
    setDifficulty,
    setPersonality,
    setCaptionsEnabled,
    togglePlayPause,
    retryCurrentSegment,
    stop,
    replay,
    jumpToSegment,
  } = player;

  const isLoading = status === 'loading';
  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';

  return (
    <div
      data-testid="voice-tutor-bar"
      className="shrink-0 border-b border-slate-800/90 bg-[#0A0F1B] px-3 py-2.5 space-y-2"
    >
      {/* Row 1: Primary Teach Me CTA + Audio Playback Controls */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="teach-me-btn"
            disabled={isLoading}
            onClick={onTeachMe}
            title={`Generate narrated 3D lesson for ${activeModelTitle}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 disabled:text-slate-400 rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                Preparing...
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                Teach Me
              </>
            )}
          </button>

          {lesson && speechSupported && (
            <>
              <button
                type="button"
                data-testid="voice-play-pause-btn"
                onClick={togglePlayPause}
                disabled={isLoading}
                aria-label={isPlaying ? 'Pause narration' : 'Play narration'}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-100 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                {isBufferingAudio ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" aria-hidden="true" />
                    Audio...
                  </>
                ) : isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                    {isPaused ? 'Resume' : 'Play'}
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="voice-stop-btn"
                onClick={stop}
                disabled={!isPlaying && !isPaused}
                aria-label="Stop narration"
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-300 hover:text-white disabled:opacity-40 disabled:pointer-events-none bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <Square className="w-3 h-3 text-rose-400" aria-hidden="true" />
                Stop
              </button>

              <button
                type="button"
                data-testid="voice-replay-btn"
                onClick={replay}
                disabled={isLoading}
                aria-label="Replay lesson from start"
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                Replay
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          data-testid="voice-captions-toggle"
          onClick={() => setCaptionsEnabled(!captionsEnabled)}
          aria-pressed={captionsEnabled}
          className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
            captionsEnabled
              ? 'bg-cyan-500/15 border-cyan-500/45 text-cyan-200'
              : 'bg-slate-900 border-slate-700/80 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Captions className="w-3.5 h-3.5" aria-hidden="true" />
          Captions
        </button>
      </div>

      {/* Row 2: Independent Difficulty, Narrator Personality, and Browser Voice */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        <div className="min-w-0">
          <label
            htmlFor="voice-difficulty-select"
            className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-0.5"
          >
            Level
          </label>
          <select
            id="voice-difficulty-select"
            data-testid="voice-difficulty-select"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as ExplanationDifficulty)}
            className="w-full bg-[#080B12] border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            {DIFFICULTY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-0">
          <label
            htmlFor="voice-personality-select"
            className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-0.5"
          >
            Style
          </label>
          <select
            id="voice-personality-select"
            data-testid="voice-personality-select"
            value={personality}
            onChange={(e) => setPersonality(e.target.value as NarratorPersonality)}
            className="w-full bg-[#080B12] border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            {PERSONALITY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {speechSupported && voices.length > 0 && (
          <div className="col-span-2 sm:col-span-1 min-w-0">
            <label
              htmlFor="voice-select"
              className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-0.5"
            >
              Voice
            </label>
            <select
              id="voice-select"
              data-testid="voice-select"
              value={selectedVoiceId}
              onChange={(e) => setSelectedVoiceId(e.target.value)}
              className="w-full bg-[#080B12] border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!speechSupported && (
        <p className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-500/30 rounded px-2 py-1">
          Audio playback is unavailable in this environment. Guided 3D steps and captions remain active.
        </p>
      )}

      {errorMessage && (
        <div
          role="alert"
          data-testid="voice-tutor-error"
          className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-200 bg-rose-950/40 border border-rose-500/40 rounded px-2 py-1.5"
        >
          <span className="flex-1 min-w-[160px]">{errorMessage}</span>
          {lesson && speechSupported && (
            <button
              type="button"
              data-testid="voice-retry-btn"
              onClick={retryCurrentSegment}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-cyan-200 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 rounded whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              Retry Audio
            </button>
          )}
        </div>
      )}

      {/* Active Guided Lesson Progress & Step Navigation */}
      {lesson && activeSegment && (
        <div
          data-testid="voice-lesson-progress"
          className="bg-[#0F1626] border border-slate-800 rounded-md p-2 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-cyan-300 truncate">
              {lesson.lessonTitle}
            </span>
            <span className="font-mono text-slate-400 shrink-0 tabular-nums">
              Step {currentSegmentIndex + 1}/{lesson.segments.length}
            </span>
          </div>

          {isBufferingAudio && (
            <p
              data-testid="voice-buffering-indicator"
              className="text-[11px] font-mono text-cyan-300"
            >
              Preparing audio for next step...
            </p>
          )}

          <div
            role="group"
            aria-label="Voice lesson segments"
            className="flex flex-wrap gap-1"
          >
            {lesson.segments.map((seg, idx) => {
              const active = idx === currentSegmentIndex;
              return (
                <button
                  key={seg.id}
                  type="button"
                  data-testid={`voice-segment-step-${idx + 1}`}
                  onClick={() => jumpToSegment(idx)}
                  aria-current={active ? 'step' : undefined}
                  className={`px-2 py-0.5 text-[11px] rounded border transition-colors truncate max-w-[140px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    active
                      ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 font-medium'
                      : 'bg-[#090D16] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {idx + 1}. {seg.title}
                </button>
              );
            })}
          </div>

          {settingsChangedSinceLesson && (
            <p className="text-[11px] text-amber-300">
              Level or style changed — click Teach Me to regenerate with the new setting.
            </p>
          )}

          {captionsEnabled && (
            <div
              data-testid="voice-tutor-inline-caption"
              className="lg:hidden bg-[#070B13] border border-cyan-500/30 rounded px-2.5 py-1.5 text-xs text-slate-100 leading-relaxed"
            >
              {activeSegment.captionText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
