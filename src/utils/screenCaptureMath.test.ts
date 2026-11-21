import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSelectionToRect,
  computeBoundedOutputSize,
  computeVideoContentRect,
  mapPreviewSelectionToVideoPixels,
} from './screenCaptureMath.ts';

test('computeVideoContentRect handles letterboxing and pillarboxing accurately', () => {
  // 16:9 video inside a square 400x400 container -> vertical letterboxing
  const letterboxed = computeVideoContentRect(400, 400, 1920, 1080);
  assert.equal(letterboxed.x, 0);
  assert.equal(letterboxed.width, 400);
  assert.equal(letterboxed.height, 225);
  assert.equal(letterboxed.y, 87.5);

  // 4:3 video inside a 16:9 800x450 container -> horizontal pillarboxing
  const pillarboxed = computeVideoContentRect(800, 450, 1200, 900);
  assert.equal(pillarboxed.y, 0);
  assert.equal(pillarboxed.height, 450);
  assert.equal(pillarboxed.width, 600);
  assert.equal(pillarboxed.x, 100);
});

test('mapPreviewSelectionToVideoPixels accounts for letterbox offset and native video scale', () => {
  // 1920x1080 video in 400x400 container: active area y=87.5..312.5, x=0..400
  // Selecting top-left quarter of the actual video: x=0..200, y=87.5..200
  const crop = mapPreviewSelectionToVideoPixels(
    { x: 0, y: 87.5, width: 200, height: 112.5 },
    400,
    400,
    1920,
    1080,
  );
  assert.ok(crop);
  assert.equal(crop.sx, 0);
  assert.equal(crop.sy, 0);
  assert.equal(crop.sw, 960);
  assert.equal(crop.sh, 540);
});

test('clampSelectionToRect excludes letterbox bars and rejects zero-area selections', () => {
  const bounds = { x: 100, y: 0, width: 600, height: 450 };
  const clamped = clampSelectionToRect({ x: 50, y: 100, width: 200, height: 150 }, bounds);
  assert.deepEqual(clamped, { x: 100, y: 100, width: 150, height: 150 });

  const outsideOnly = mapPreviewSelectionToVideoPixels(
    { x: 0, y: 10, width: 50, height: 40 },
    800,
    450,
    1200,
    900,
  );
  assert.equal(outsideOnly, null);
});

test('computeBoundedOutputSize scales down large captures while preserving aspect ratio', () => {
  assert.deepEqual(computeBoundedOutputSize(2560, 1440, 1280), {
    width: 1280,
    height: 720,
  });
  assert.deepEqual(computeBoundedOutputSize(640, 360, 1280), {
    width: 640,
    height: 360,
  });
});
