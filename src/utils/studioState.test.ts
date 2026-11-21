import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPage,
  stepZoom,
  computeSimplifiedEngineTelemetry,
  resolvePanelVisibility,
} from './studioState';

test('clampPage bounds page indices cleanly', () => {
  assert.equal(clampPage(0, 5), 1);
  assert.equal(clampPage(3, 5), 3);
  assert.equal(clampPage(9, 5), 5);
  assert.equal(clampPage(2, 0), 1);
});

test('stepZoom increments, decrements, and resets within bounds', () => {
  assert.equal(stepZoom(100, 'in'), 115);
  assert.equal(stepZoom(180, 'in'), 180);
  assert.equal(stepZoom(100, 'out'), 85);
  assert.equal(stepZoom(60, 'out'), 60);
  assert.equal(stepZoom(130, 'reset'), 100);
});

test('computeSimplifiedEngineTelemetry scales monotonically with throttle', () => {
  const low = computeSimplifiedEngineTelemetry(15);
  const high = computeSimplifiedEngineTelemetry(100);

  assert.ok(high.rpmPercent > low.rpmPercent);
  assert.ok(high.egtCelsius > low.egtCelsius);
  assert.ok(high.machEstimate > low.machEstimate);
  assert.ok(high.thrustKn > low.thrustKn);
  assert.equal(low.rpmPercent, 28);
  assert.equal(high.rpmPercent, 100);
});

test('resolvePanelVisibility handles desktop three-panel, expanded, and mobile tab states', () => {
  assert.equal(resolvePanelVisibility('pdf', null, 'tutor', true), true);
  assert.equal(resolvePanelVisibility('visualization', null, 'tutor', true), true);
  assert.equal(resolvePanelVisibility('tutor', null, 'tutor', true), true);

  assert.equal(resolvePanelVisibility('pdf', 'visualization', 'pdf', true), false);
  assert.equal(resolvePanelVisibility('visualization', 'visualization', 'pdf', true), true);

  assert.equal(resolvePanelVisibility('pdf', null, 'tutor', false), false);
  assert.equal(resolvePanelVisibility('tutor', null, 'tutor', false), true);
});
