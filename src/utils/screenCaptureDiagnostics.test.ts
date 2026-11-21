import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyScreenCaptureError,
  evaluateScreenCaptureEnvironment,
  resolveStandaloneAppUrl,
} from './screenCaptureDiagnostics';

test('evaluateScreenCaptureEnvironment flags embedded iframe when display-capture policy is disallowed', () => {
  const embeddedBlocked = evaluateScreenCaptureEnvironment({
    isSecureContext: true,
    hasGetDisplayMedia: true,
    isEmbeddedIframe: true,
    permissionsPolicyAllowsDisplayCapture: false,
  });
  assert.equal(embeddedBlocked.isBlockedByEmbeddedPreview, true);

  const standaloneAllowed = evaluateScreenCaptureEnvironment({
    isSecureContext: true,
    hasGetDisplayMedia: true,
    isEmbeddedIframe: false,
    permissionsPolicyAllowsDisplayCapture: true,
  });
  assert.equal(standaloneAllowed.isBlockedByEmbeddedPreview, false);
});

test('classifyScreenCaptureError preserves exact browser error and detects Permissions Policy block', () => {
  const err = new DOMException(
    'Access to the feature "display-capture" is disallowed by permissions policy.',
    'NotAllowedError',
  );
  const env = evaluateScreenCaptureEnvironment({
    isSecureContext: true,
    hasGetDisplayMedia: true,
    isEmbeddedIframe: true,
    permissionsPolicyAllowsDisplayCapture: false,
  });

  const classified = classifyScreenCaptureError({ error: err, env });
  assert.equal(classified.reason, 'permissions-policy-blocked');
  assert.equal(classified.errorName, 'NotAllowedError');
  assert.match(classified.rawBrowserError, /NotAllowedError/);
  assert.match(classified.rawBrowserError, /permissions policy/i);
  assert.equal(classified.shouldOfferStandaloneApp, true);
});

test('classifyScreenCaptureError distinguishes embedded NotAllowedError from standalone user cancel', () => {
  const genericNotAllowed = new DOMException('Permission denied', 'NotAllowedError');

  const iframeEnv = evaluateScreenCaptureEnvironment({
    isSecureContext: true,
    hasGetDisplayMedia: true,
    isEmbeddedIframe: true,
    permissionsPolicyAllowsDisplayCapture: null,
  });
  const iframeResult = classifyScreenCaptureError({
    error: genericNotAllowed,
    env: iframeEnv,
  });
  assert.equal(iframeResult.reason, 'embedded-preview-blocked');
  assert.equal(iframeResult.shouldOfferStandaloneApp, true);
  assert.equal(iframeResult.rawBrowserError, 'NotAllowedError: Permission denied');

  const standaloneEnv = evaluateScreenCaptureEnvironment({
    isSecureContext: true,
    hasGetDisplayMedia: true,
    isEmbeddedIframe: false,
    permissionsPolicyAllowsDisplayCapture: true,
  });
  const standaloneResult = classifyScreenCaptureError({
    error: genericNotAllowed,
    env: standaloneEnv,
  });
  assert.equal(standaloneResult.reason, 'permission-cancelled');
  assert.equal(standaloneResult.shouldOfferStandaloneApp, false);
  assert.equal(standaloneResult.rawBrowserError, 'NotAllowedError: Permission denied');
});

test('resolveStandaloneAppUrl prefers valid HTTP(S) window URL and falls back to server APP_URL', () => {
  assert.equal(
    resolveStandaloneAppUrl({
      windowLocationHref: 'https://ais-dev-example.us-east1.run.app/',
      serverAppUrl: 'https://ais-pre-example.us-east1.run.app/',
    }),
    'https://ais-dev-example.us-east1.run.app/',
  );

  assert.equal(
    resolveStandaloneAppUrl({
      windowLocationHref: 'about:srcdoc',
      serverAppUrl: 'https://ais-pre-example.us-east1.run.app',
    }),
    'https://ais-pre-example.us-east1.run.app/',
  );

  assert.equal(
    resolveStandaloneAppUrl({
      windowLocationHref: 'about:blank',
      serverAppUrl: 'MY_APP_URL',
    }),
    null,
  );
});

test('classifyScreenCaptureError handles standalone NotSupportedError transparently', () => {
  const err = new DOMException('Not supported', 'NotSupportedError');
  const standaloneEnv = evaluateScreenCaptureEnvironment({
    isSecureContext: true,
    hasGetDisplayMedia: true,
    isEmbeddedIframe: false,
    permissionsPolicyAllowsDisplayCapture: true,
  });
  const result = classifyScreenCaptureError({ error: err, env: standaloneEnv });
  assert.equal(result.reason, 'api-unavailable');
  assert.equal(result.rawBrowserError, 'NotSupportedError: Not supported');
  assert.equal(result.shouldOfferStandaloneApp, false);
});
