import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  Copy,
  Crop,
  ExternalLink,
  ImagePlus,
  Loader2,
  Monitor,
  MonitorOff,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { APP_CONFIG } from '../config/appConfig';
import { fetchRuntimeHealth } from '../services/tutorApi';
import type { CapturedScreenRegion } from '../types/tutor';
import {
  classifyScreenCaptureError,
  detectBrowserScreenCaptureEnvironment,
  resolveStandaloneAppUrl,
  type ScreenCaptureEnvInfo,
  type ScreenCaptureErrorDetails,
} from '../utils/screenCaptureDiagnostics';
import {
  clampSelectionToRect,
  computeBoundedOutputSize,
  computeVideoContentRect,
  mapPreviewSelectionToVideoPixels,
  type BoxRect,
} from '../utils/screenCaptureMath';

interface ScreenLearnPanelProps {
  capturedRegion: CapturedScreenRegion | null;
  question: string;
  isAnalyzing: boolean;
  onChangeQuestion: (value: string) => void;
  onCaptureRegion: (region: CapturedScreenRegion | null) => void;
  onVisualize: (questionText: string) => void;
}

/**
 * Interactive "Learn from Screen" workflow:
 * Requests permission via navigator.mediaDevices.getDisplayMedia ONLY on button click,
 * lets the user draw/adjust a rectangular region over the live preview, crops the exact
 * video coordinates via an offscreen canvas, and sends the image + question to Gemini.
 */
export function ScreenLearnPanel({
  capturedRegion,
  question,
  isAnalyzing,
  onChangeQuestion,
  onCaptureRegion,
  onVisualize,
}: ScreenLearnPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const [isSharing, setIsSharing] = useState(false);
  const [sourceLabel, setSourceLabel] = useState('Shared Screen');
  const [isSelectMode, setIsSelectMode] = useState(true);
  const [selectionRect, setSelectionRect] = useState<BoxRect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<ScreenCaptureErrorDetails | null>(
    null,
  );
  const [envInfo, setEnvInfo] = useState<ScreenCaptureEnvInfo>(() =>
    detectBrowserScreenCaptureEnvironment(),
  );
  const [serverAppUrl, setServerAppUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [previewSize, setPreviewSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });
  const [videoDimensions, setVideoDimensions] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  const stopMediaStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsSharing(false);
    setIsDragging(false);
    dragOriginRef.current = null;
  }, []);

  useEffect(() => {
    setEnvInfo(detectBrowserScreenCaptureEnvironment());
    let active = true;
    void fetchRuntimeHealth().then((health) => {
      if (active && health?.appUrl) {
        setServerAppUrl(health.appUrl);
      }
    });
    return () => {
      active = false;
      stopMediaStream();
    };
  }, [stopMediaStream]);

  // Keep preview container dimensions synced for exact coordinate clamping
  useEffect(() => {
    const box = previewBoxRef.current;
    if (!box) return;
    const syncSize = () => {
      setPreviewSize({ w: box.clientWidth, h: box.clientHeight });
    };
    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(box);
    return () => observer.disconnect();
  }, [isSharing]);

  const standaloneAppUrl = resolveStandaloneAppUrl({
    windowLocationHref:
      typeof window !== 'undefined' ? window.location.href : null,
    serverAppUrl,
  });

  const handleCopyStandaloneUrl = () => {
    if (!standaloneAppUrl || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(standaloneAppUrl).then(
      () => {
        setCopiedUrl(true);
        window.setTimeout(() => setCopiedUrl(false), 2000);
      },
      () => {
        // Ignore clipboard errors in restricted frames
      },
    );
  };

  const attachStreamToVideo = useCallback(
    (stream: MediaStream) => {
      streamRef.current = stream;
      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        setSourceLabel(videoTrack.label?.trim() || 'Shared Screen');
        videoTrack.addEventListener('ended', () => {
          stopMediaStream();
        });
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        void video.play().catch(() => {
          // Autoplay promise may resolve after metadata loads
        });
      }
      setIsSharing(true);
      setIsSelectMode(true);
      setSelectionRect(null);
      setErrorMessage(null);
      setCaptureError(null);
    },
    [stopMediaStream],
  );

  const reportCaptureFailure = useCallback((err: unknown) => {
    const latestEnv = detectBrowserScreenCaptureEnvironment();
    setEnvInfo(latestEnv);
    const details = classifyScreenCaptureError({ error: err, env: latestEnv });
    console.error(
      '[Learn from Screen] getDisplayMedia failed:',
      details.errorName,
      details.errorMessage,
      err,
    );
    setCaptureError(details);
    setErrorMessage(null);
  }, []);

  const handleStartScreenShare = () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reportCaptureFailure(
        new DOMException(
          'Screen sharing requires a secure HTTPS or localhost origin.',
          'SecurityError',
        ),
      );
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getDisplayMedia !== 'function'
    ) {
      reportCaptureFailure(
        new DOMException(
          'navigator.mediaDevices.getDisplayMedia is unavailable in this browser or context.',
          'NotSupportedError',
        ),
      );
      return;
    }

    // Call getDisplayMedia synchronously and directly inside the click handler
    // with zero preceding await or state mutations to preserve user activation.
    let capturePromise: Promise<MediaStream>;
    try {
      capturePromise = navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    } catch (syncErr: unknown) {
      stopMediaStream();
      reportCaptureFailure(syncErr);
      return;
    }

    setErrorMessage(null);
    setCaptureError(null);

    capturePromise.then(
      (stream) => {
        stopMediaStream();
        attachStreamToVideo(stream);
      },
      (asyncErr: unknown) => {
        stopMediaStream();
        reportCaptureFailure(asyncErr);
      },
    );
  };

  const captureCropFromVideo = useCallback(
    (rect: BoxRect | null) => {
      const video = videoRef.current;
      const box = previewBoxRef.current;
      if (!video || !box || video.videoWidth <= 0 || video.videoHeight <= 0) {
        return;
      }

      let sx = 0;
      let sy = 0;
      let sw = video.videoWidth;
      let sh = video.videoHeight;

      if (rect) {
        const mapped = mapPreviewSelectionToVideoPixels(
          rect,
          box.clientWidth,
          box.clientHeight,
          video.videoWidth,
          video.videoHeight,
        );
        if (!mapped) {
          setErrorMessage(
            'Selection fell outside the active video area. Drag inside the shared screen content.',
          );
          return;
        }
        sx = mapped.sx;
        sy = mapped.sy;
        sw = mapped.sw;
        sh = mapped.sh;
      }

      const { width: outW, height: outH } = computeBoundedOutputSize(
        sw,
        sh,
        APP_CONFIG.screenCaptureDefaults.maxImageDimension,
      );

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setErrorMessage('Unable to create offscreen canvas for region capture.');
        return;
      }

      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
      const mimeType: 'image/jpeg' = 'image/jpeg';
      const dataUrl = canvas.toDataURL(
        mimeType,
        APP_CONFIG.screenCaptureDefaults.jpegQuality,
      );
      const base64Idx = dataUrl.indexOf(';base64,');
      const base64 = base64Idx !== -1 ? dataUrl.slice(base64Idx + ';base64,'.length) : '';

      if (!base64) {
        setErrorMessage('Failed to encode captured screen region.');
        return;
      }

      setErrorMessage(null);
      onCaptureRegion({
        dataUrl,
        base64,
        mimeType,
        width: outW,
        height: outH,
        sourceLabel,
      });
    },
    [onCaptureRegion, sourceLabel],
  );

  const getRelativePoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = previewBoxRef.current;
    if (!box) return { x: 0, y: 0 };
    const bounds = box.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
      y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isSharing || !isSelectMode || event.button !== 0) {
      return;
    }
    const point = getRelativePoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOriginRef.current = point;
    setIsDragging(true);
    setSelectionRect({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragOriginRef.current || !previewBoxRef.current) {
      return;
    }
    const current = getRelativePoint(event);
    const origin = dragOriginRef.current;
    const rawRect: BoxRect = {
      x: Math.min(origin.x, current.x),
      y: Math.min(origin.y, current.y),
      width: Math.abs(current.x - origin.x),
      height: Math.abs(current.y - origin.y),
    };

    const contentBounds = computeVideoContentRect(
      previewBoxRef.current.clientWidth,
      previewBoxRef.current.clientHeight,
      videoDimensions.w || previewBoxRef.current.clientWidth,
      videoDimensions.h || previewBoxRef.current.clientHeight,
    );
    setSelectionRect(clampSelectionToRect(rawRect, contentBounds));
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDragging(false);
    dragOriginRef.current = null;

    if (
      selectionRect &&
      selectionRect.width >= APP_CONFIG.screenCaptureDefaults.minSelectionPx &&
      selectionRect.height >= APP_CONFIG.screenCaptureDefaults.minSelectionPx
    ) {
      captureCropFromVideo(selectionRect);
    } else {
      setSelectionRect(null);
    }
  };

  const handleUploadImageFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const validTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!validTypes.has(file.type)) {
      setErrorMessage('Please choose a PNG, JPEG, or WebP image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!resultUrl) {
        setErrorMessage('Could not read the selected image file.');
        return;
      }
      const img = new Image();
      img.onload = () => {
        const { width: outW, height: outH } = computeBoundedOutputSize(
          img.naturalWidth || 800,
          img.naturalHeight || 600,
          APP_CONFIG.screenCaptureDefaults.maxImageDimension,
        );
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setErrorMessage('Unable to process uploaded image.');
          return;
        }
        ctx.drawImage(img, 0, 0, outW, outH);
        const mimeType: 'image/jpeg' = 'image/jpeg';
        const dataUrl = canvas.toDataURL(
          mimeType,
          APP_CONFIG.screenCaptureDefaults.jpegQuality,
        );
        const base64Idx = dataUrl.indexOf(';base64,');
        const base64 = base64Idx !== -1 ? dataUrl.slice(base64Idx + ';base64,'.length) : '';
        if (!base64) {
          setErrorMessage('Failed to encode uploaded image.');
          return;
        }
        setErrorMessage(null);
        setCaptureError(null);
        onCaptureRegion({
          dataUrl,
          base64,
          mimeType,
          width: outW,
          height: outH,
          sourceLabel: file.name,
        });
      };
      img.onerror = () => {
        setErrorMessage('Unable to decode the uploaded image.');
      };
      img.src = resultUrl;
    };
    reader.onerror = () => {
      setErrorMessage('Could not read the selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || !capturedRegion || isAnalyzing) {
      return;
    }
    onVisualize(trimmed);
  };

  const activeContentBox = computeVideoContentRect(
    previewSize.w,
    previewSize.h,
    videoDimensions.w,
    videoDimensions.h,
  );

  return (
    <div
      data-testid="screen-learn-panel"
      className="flex-1 min-h-0 flex flex-col overflow-y-auto studio-scroll p-3.5 gap-3 bg-[#090D16]"
    >
      {/* Screen Share Action Bar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 bg-[#0C111D] border border-slate-800 rounded-md p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={imageInputRef}
            id="screen-image-upload-input"
            data-testid="upload-image-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleUploadImageFile}
            className="sr-only"
          />

          {!isSharing ? (
            <>
              <button
                type="button"
                data-testid="start-screen-share-btn"
                onClick={handleStartScreenShare}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
                Start Screen Sharing
              </button>
              <button
                type="button"
                data-testid="upload-image-btn"
                onClick={() => imageInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                Upload Image
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="stop-screen-share-btn"
              onClick={stopMediaStream}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-100 bg-rose-600/80 hover:bg-rose-500 rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <MonitorOff className="w-3.5 h-3.5" aria-hidden="true" />
              Stop Sharing
            </button>
          )}

          {isSharing && (
            <>
              <button
                type="button"
                data-testid="select-region-toggle-btn"
                aria-pressed={isSelectMode}
                onClick={() => setIsSelectMode((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isSelectMode
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <Crop className="w-3.5 h-3.5" aria-hidden="true" />
                Select Region
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectionRect(null);
                  captureCropFromVideo(null);
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-700/80 rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                Full Frame
              </button>

              {selectionRect && (
                <button
                  type="button"
                  onClick={() => setSelectionRect(null)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-100 rounded transition-colors whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                  Clear Box
                </button>
              )}
            </>
          )}
        </div>

        <span className="text-[11px] font-mono text-slate-400 truncate max-w-[180px]">
          {isSharing
            ? `${sourceLabel}${videoDimensions.w ? ` · ${videoDimensions.w}×${videoDimensions.h}` : ''}`
            : 'No active screen stream'}
        </span>
      </div>

      {/* Embedded Preview Policy Warning (shown when iframe blocks display-capture) */}
      {envInfo.isBlockedByEmbeddedPreview && !isSharing && (
        <div
          data-testid="embedded-preview-banner"
          className="shrink-0 px-3 py-2.5 bg-amber-950/35 border border-amber-500/40 rounded-md space-y-2 text-xs text-amber-100"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="w-4 h-4 text-amber-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-amber-200">
                Embedded preview blocks browser screen sharing
              </p>
              <p className="text-[11px] text-amber-100/85 leading-relaxed">
                This embedded frame restricts the{' '}
                <code className="font-mono text-amber-200">display-capture</code>{' '}
                Permissions Policy. Open the standalone app in its own browser tab to
                launch Chrome&apos;s screen, window, and tab picker.
              </p>
            </div>
          </div>

          {standaloneAppUrl && (
            <div className="flex flex-wrap items-center gap-2 pl-6">
              <a
                href={standaloneAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="open-standalone-app-link"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                Open Standalone App
              </a>
              <button
                type="button"
                onClick={handleCopyStandaloneUrl}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-200 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 rounded transition-colors whitespace-nowrap"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
                    Copied URL
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    Copy App URL
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Screen Capture Error Banner (shows actual browser error + standalone escape hatch) */}
      {(captureError || errorMessage) && (
        <div
          role="alert"
          data-testid="screen-error-banner"
          className="shrink-0 px-3 py-2.5 bg-rose-950/50 border border-rose-500/40 rounded-md space-y-2 text-xs text-rose-100"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1.5 min-w-0">
              <p className="leading-relaxed">
                {captureError ? captureError.summary : errorMessage}
              </p>
              {captureError && (
                <p
                  data-testid="screen-raw-error"
                  className="font-mono text-[11px] text-rose-200 bg-rose-950/80 border border-rose-500/30 rounded px-2 py-1 break-all"
                >
                  Browser error: {captureError.rawBrowserError}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setCaptureError(null);
                setErrorMessage(null);
              }}
              aria-label="Dismiss screen error"
              className="text-rose-300 hover:text-white p-0.5 shrink-0"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {captureError?.shouldOfferStandaloneApp &&
            standaloneAppUrl &&
            !envInfo.isBlockedByEmbeddedPreview && (
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <a
                  href={standaloneAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="open-standalone-app-link"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  Open Standalone App
                </a>
                <button
                  type="button"
                  onClick={handleCopyStandaloneUrl}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-100 bg-rose-950/70 hover:bg-rose-900/70 border border-rose-400/40 rounded transition-colors whitespace-nowrap"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
                      Copied URL
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      Copy App URL
                    </>
                  )}
                </button>
              </div>
            )}
        </div>
      )}

      {/* Live Screen Preview + Interactive Region Selection Overlay */}
      <div className="shrink-0 space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="font-medium text-slate-300">Live Screen Preview</span>
          <span>
            {isSharing
              ? isSelectMode
                ? 'Drag on the preview to select a region'
                : 'Enable Select Region to crop'
              : 'Share a tab, window, or display to begin'}
          </span>
        </div>

        <div
          ref={previewBoxRef}
          data-testid="screen-preview-box"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`relative w-full aspect-video bg-[#060910] border border-slate-800 rounded-md overflow-hidden select-none touch-none ${
            isSharing && isSelectMode ? 'cursor-crosshair' : 'cursor-default'
          }`}
        >
          <video
            ref={videoRef}
            data-testid="screen-live-video"
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setVideoDimensions({
                  w: videoRef.current.videoWidth,
                  h: videoRef.current.videoHeight,
                });
              }
            }}
            className={`w-full h-full object-contain pointer-events-none ${
              isSharing ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {!isSharing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 gap-2">
              <Monitor className="w-7 h-7 text-slate-600" aria-hidden="true" />
              <p className="text-xs font-medium text-slate-300">
                Share any browser tab, diagram, lecture slide, or simulation
              </p>
              <p className="text-[11px] text-slate-500 max-w-xs">
                Draw a rectangle over what you want to understand and ask Gemini to explain or visualize it.
              </p>
            </div>
          )}

          {/* Subtle boundary indicator for active video content when letterboxed */}
          {isSharing && activeContentBox.width > 0 && (
            <div
              className="pointer-events-none absolute border border-slate-700/40"
              style={{
                left: activeContentBox.x,
                top: activeContentBox.y,
                width: activeContentBox.width,
                height: activeContentBox.height,
              }}
            />
          )}

          {/* User-Drawn Selection Rectangle */}
          {isSharing && selectionRect && selectionRect.width > 1 && selectionRect.height > 1 && (
            <div
              data-testid="screen-selection-rect"
              className="pointer-events-none absolute border-2 border-cyan-400 bg-cyan-400/12 shadow-[0_0_0_1px_rgba(8,11,18,0.65)]"
              style={{
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.width,
                height: selectionRect.height,
              }}
            >
              <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-cyan-500 text-slate-950 font-mono text-[10px] font-semibold whitespace-nowrap">
                {Math.round(selectionRect.width)}×{Math.round(selectionRect.height)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Captured Region Preview */}
      {capturedRegion && (
        <div
          data-testid="captured-region-card"
          className="shrink-0 bg-[#0C111D] border border-cyan-500/35 rounded-md p-2.5 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-cyan-300">
              Selected Region Preview · {capturedRegion.width}×{capturedRegion.height}px
            </span>
            <button
              type="button"
              data-testid="clear-capture-btn"
              onClick={() => {
                onCaptureRegion(null);
                setSelectionRect(null);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-300 transition-colors"
            >
              <Trash2 className="w-3 h-3" aria-hidden="true" />
              Clear Capture
            </button>
          </div>
          <div className="bg-[#060910] border border-slate-800 rounded p-1.5 flex items-center justify-center max-h-36 overflow-hidden">
            <img
              src={capturedRegion.dataUrl}
              alt="Captured screen selection"
              data-testid="captured-region-img"
              className="max-h-32 w-auto object-contain rounded-sm"
            />
          </div>
        </div>
      )}

      {/* Question Input & Visualize This Action */}
      <form
        onSubmit={handleFormSubmit}
        className="shrink-0 bg-[#0C111D] border border-slate-800 rounded-md p-3 space-y-2.5"
      >
        <label
          htmlFor="screen-question-input"
          className="block text-xs font-medium text-slate-300"
        >
          Ask about the selected region
        </label>
        <textarea
          id="screen-question-input"
          data-testid="screen-question-input"
          rows={2}
          value={question}
          disabled={isAnalyzing}
          onChange={(e) => onChangeQuestion(e.target.value)}
          placeholder={
            capturedRegion
              ? 'e.g., How does this component work, and can you visualize it?'
              : 'Select a region on the live preview first, then type your question...'
          }
          className="w-full bg-[#080B12] border border-slate-700/80 rounded-md px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 resize-none focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 disabled:opacity-60"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 min-w-0 truncate">
            {capturedRegion
              ? 'Ready — follow-up keeps capture'
              : 'No region captured yet'}
          </span>
          <button
            type="submit"
            data-testid="visualize-screen-btn"
            disabled={!capturedRegion || !question.trim() || isAnalyzing}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:bg-slate-800 disabled:text-slate-500 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                Visualize This
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
