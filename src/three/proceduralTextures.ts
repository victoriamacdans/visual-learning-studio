import * as THREE from 'three';

export interface WebGLCapabilitiesReport {
  readonly supported: boolean;
  readonly isSoftwareGl: boolean;
  readonly rendererName: string;
}

const SOFTWARE_RENDERER_PATTERN = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;

/**
 * Probes WebGL support and whether the active adapter is a CPU software renderer
 * (e.g., headless Chromium SwiftShader) so rendering cost can be gracefully scaled.
 */
export function detectSoftwareWebGL(): WebGLCapabilitiesReport {
  if (typeof document === 'undefined') {
    return { supported: false, isSoftwareGl: false, rendererName: 'ssr' };
  }

  const canvas = document.createElement('canvas');
  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  try {
    gl =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ??
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false });
  } catch {
    return { supported: false, isSoftwareGl: false, rendererName: 'unavailable' };
  }

  if (!gl) {
    return { supported: false, isSoftwareGl: false, rendererName: 'unavailable' };
  }

  let rendererName = String(gl.getParameter(gl.RENDERER) ?? '');
  try {
    const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugExt) {
      const unmasked = gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL);
      if (typeof unmasked === 'string' && unmasked.trim()) {
        rendererName = unmasked;
      }
    }
  } catch {
    // Ignore restricted renderer info queries
  }

  try {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    // Ignore context disposal errors
  }

  return {
    supported: true,
    isSoftwareGl: SOFTWARE_RENDERER_PATTERN.test(rendererName),
    rendererName,
  };
}

/**
 * Generates a lightweight procedural brushed-titanium roughness/bump texture.
 */
export function createBrushedMetalTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < canvas.height; y += 2) {
      const shade = 128 + Math.round(Math.sin(y * 0.7) * 18 + ((y * 13) % 24) - 12);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(0, y, canvas.width, 1);
    }

    for (let i = 0; i < 48; i += 1) {
      const y = (i * 29) % canvas.height;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, y, canvas.width, 1);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a subtle white nose-cone spiral texture for the rotating fan spinner
 * so rotation speed is immediately legible to students.
 */
export function createSpinnerSpiralTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#182032';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(0, 40);
    ctx.lineTo(256, 175);
    ctx.lineTo(256, 205);
    ctx.lineTo(0, 70);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a soft elliptical ground contact shadow texture beneath the engine.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 126);
    grad.addColorStop(0, 'rgba(2, 6, 15, 0.78)');
    grad.addColorStop(0.5, 'rgba(2, 6, 15, 0.36)');
    grad.addColorStop(1, 'rgba(2, 6, 15, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
