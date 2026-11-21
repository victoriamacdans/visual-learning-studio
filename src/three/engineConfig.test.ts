import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENGINE_COMPONENT_PRESETS,
  computeExplodedOffset,
  computeSpoolSpeeds,
  getCameraPresetForStage,
} from './engineConfig.ts';

test('computeSpoolSpeeds scales LP/HP speeds monotonically with throttle', () => {
  const idle = computeSpoolSpeeds(15);
  const max = computeSpoolSpeeds(100);

  assert.ok(max.lpAngularVelocity > idle.lpAngularVelocity);
  assert.ok(max.hpAngularVelocity > max.lpAngularVelocity);
  assert.ok(max.airflowSpeed > idle.airflowSpeed);
  assert.ok(max.heatFactor > idle.heatFactor);
});

test('computeExplodedOffset returns zero at 0 and full separation at 1', () => {
  assert.deepEqual(computeExplodedOffset('intake', 0), [0, 0, 0]);
  const full = computeExplodedOffset('intake', 1);
  assert.deepEqual(full, ENGINE_COMPONENT_PRESETS.intake.explodeOffset);
  assert.ok(full[0] < 0);
  const duct = computeExplodedOffset('bypass-duct', 1);
  assert.ok(duct[1] > 0);
});

test('getCameraPresetForStage tracks exploded component offsets and overview pullback', () => {
  const assembled = getCameraPresetForStage('combustor', 0);
  const exploded = getCameraPresetForStage('combustor', 1);
  assert.ok(exploded.target[0] > assembled.target[0]);

  const overviewAssembled = getCameraPresetForStage('overview', 0);
  const overviewExploded = getCameraPresetForStage('overview', 1);
  assert.ok(overviewExploded.position[2] > overviewAssembled.position[2]);
});
