export interface ScreenCaptureEnvInput {
  readonly isSecureContext: boolean;
  readonly hasGetDisplayMedia: boolean;
  readonly isEmbeddedIframe: boolean;
  readonly permissionsPolicyAllowsDisplayCapture: boolean | null;
}

export interface ScreenCaptureEnvInfo extends ScreenCaptureEnvInput {
  readonly isBlockedByEmbeddedPreview: boolean;
}

export type ScreenCaptureErrorReason =
  | 'insecure-context'
  | 'api-unavailable'
  | 'permissions-policy-blocked'
  | 'embedded-preview-blocked'
  | 'permission-cancelled'
  | 'no-source-found'
  | 'source-aborted'
  | 'other';

export interface ScreenCaptureErrorDetails {
  readonly reason: ScreenCaptureErrorReason;
  readonly errorName: string;
  readonly errorMessage: string;
  readonly rawBrowserError: string;
  readonly summary: string;
  readonly shouldOfferStandaloneApp: boolean;
}

/**
 * Pure evaluator for browser screen-capture environment capabilities.
 */
export function evaluateScreenCaptureEnvironment(
  input: ScreenCaptureEnvInput,
): ScreenCaptureEnvInfo {
  const isBlockedByEmbeddedPreview =
    input.permissionsPolicyAllowsDisplayCapture === false ||
    (input.isEmbeddedIframe && !input.hasGetDisplayMedia);

  return {
    ...input,
    isBlockedByEmbeddedPreview,
  };
}

interface PolicyCarrier {
  allowsFeature?: (feature: string) => boolean;
}

/**
 * Probes the live browser environment (secure context, getDisplayMedia support,
 * iframe embedding, and Permissions Policy) safely without triggering prompts.
 */
export function detectBrowserScreenCaptureEnvironment(): ScreenCaptureEnvInfo {
  const isSecureContext =
    typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;

  const hasGetDisplayMedia =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices) &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function';

  let isEmbeddedIframe = false;
  if (typeof window !== 'undefined') {
    try {
      isEmbeddedIframe = window.self !== window.top;
    } catch {
      // Cross-origin frame access throws SecurityError — definitively embedded
      isEmbeddedIframe = true;
    }
  }

  let permissionsPolicyAllowsDisplayCapture: boolean | null = null;
  if (typeof document !== 'undefined') {
    const docWithPolicy = document as Document & {
      permissionsPolicy?: PolicyCarrier;
      featurePolicy?: PolicyCarrier;
    };
    const policy = docWithPolicy.permissionsPolicy ?? docWithPolicy.featurePolicy;
    if (policy && typeof policy.allowsFeature === 'function') {
      try {
        permissionsPolicyAllowsDisplayCapture = Boolean(
          policy.allowsFeature('display-capture'),
        );
      } catch {
        permissionsPolicyAllowsDisplayCapture = null;
      }
    }
  }

  return evaluateScreenCaptureEnvironment({
    isSecureContext,
    hasGetDisplayMedia,
    isEmbeddedIframe,
    permissionsPolicyAllowsDisplayCapture,
  });
}

function isValidHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'MY_APP_URL') return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Resolves the best standalone URL for opening Visual Learning Studio
 * outside an embedded preview iframe.
 */
export function resolveStandaloneAppUrl(options: {
  windowLocationHref?: string | null;
  serverAppUrl?: string | null;
}): string | null {
  return (
    isValidHttpUrl(options.windowLocationHref) ??
    isValidHttpUrl(options.serverAppUrl) ??
    null
  );
}

/**
 * Classifies a getDisplayMedia failure while preserving the exact browser
 * error name and message for transparent diagnostics.
 */
export function classifyScreenCaptureError(options: {
  error: unknown;
  env: ScreenCaptureEnvInfo;
}): ScreenCaptureErrorDetails {
  const { error, env } = options;

  let errorName = 'UnknownError';
  let errorMessage = '';

  if (error && typeof error === 'object') {
    const errObj = error as { name?: unknown; message?: unknown };
    if (typeof errObj.name === 'string' && errObj.name.trim()) {
      errorName = errObj.name.trim();
    }
    if (typeof errObj.message === 'string' && errObj.message.trim()) {
      errorMessage = errObj.message.trim();
    }
  } else if (typeof error === 'string' && error.trim()) {
    errorMessage = error.trim();
  }

  const rawBrowserError = errorMessage
    ? `${errorName}: ${errorMessage}`
    : errorName;

  const mentionsPermissionsPolicy =
    /permissions?\s*policy|feature\s*policy|disallowed\s+by|display-capture/i.test(
      errorMessage,
    );

  if (!env.isSecureContext) {
    return {
      reason: 'insecure-context',
      errorName,
      errorMessage,
      rawBrowserError,
      summary:
        'Screen sharing requires a secure HTTPS (or localhost) browser context.',
      shouldOfferStandaloneApp: Boolean(env.isEmbeddedIframe),
    };
  }

  if (
    env.permissionsPolicyAllowsDisplayCapture === false ||
    mentionsPermissionsPolicy ||
    errorName === 'SecurityError'
  ) {
    return {
      reason: 'permissions-policy-blocked',
      errorName,
      errorMessage,
      rawBrowserError,
      summary: env.isEmbeddedIframe
        ? 'Screen capture is blocked by the embedded preview Permissions Policy (display-capture is disallowed inside this iframe). Open the standalone app in a new tab to use Chrome screen sharing.'
        : 'Screen capture was blocked by the browser Permissions Policy for this document.',
      shouldOfferStandaloneApp: true,
    };
  }

  if (
    env.isEmbeddedIframe &&
    (errorName === 'NotAllowedError' ||
      errorName === 'PermissionDeniedError' ||
      errorName === 'NotSupportedError')
  ) {
    return {
      reason: 'embedded-preview-blocked',
      errorName,
      errorMessage,
      rawBrowserError,
      summary:
        'Screen sharing could not start inside the embedded preview. If the browser picker did not open, the host iframe is blocking display capture — open the standalone app in a new tab to share your screen.',
      shouldOfferStandaloneApp: true,
    };
  }

  if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
    return {
      reason: 'permission-cancelled',
      errorName,
      errorMessage,
      rawBrowserError,
      summary:
        'The browser screen-sharing prompt was cancelled or permission was not granted. Click "Start Screen Sharing" to open the picker again.',
      shouldOfferStandaloneApp: false,
    };
  }

  if (errorName === 'NotFoundError') {
    return {
      reason: 'no-source-found',
      errorName,
      errorMessage,
      rawBrowserError,
      summary: 'No shareable screen, window, or browser tab was detected.',
      shouldOfferStandaloneApp: false,
    };
  }

  if (errorName === 'AbortError') {
    return {
      reason: 'source-aborted',
      errorName,
      errorMessage,
      rawBrowserError,
      summary:
        'Screen capture was aborted before a video stream started. Try selecting a tab or window again.',
      shouldOfferStandaloneApp: env.isEmbeddedIframe,
    };
  }

  if (errorName === 'NotSupportedError' || !env.hasGetDisplayMedia) {
    return {
      reason: 'api-unavailable',
      errorName,
      errorMessage,
      rawBrowserError,
      summary:
        'Screen sharing is not supported in this browser runtime (for example, mobile browsers or headless environments without a screen picker). Try opening the standalone app in desktop Chrome or Edge.',
      shouldOfferStandaloneApp: env.isEmbeddedIframe,
    };
  }

  return {
    reason: 'other',
    errorName,
    errorMessage,
    rawBrowserError,
    summary: errorMessage || 'Unable to start screen sharing.',
    shouldOfferStandaloneApp: env.isEmbeddedIframe,
  };
}
