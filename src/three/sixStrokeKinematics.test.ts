import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateSixStrokeKinematics,
  SIX_STROKE_GEOMETRY,
  SIX_STROKE_VARIANTS,
} from './sixStrokeKinematics.ts';

test('sixStrokeKinematics preserves exact planar slider-crank rod length across 0-1080 degrees', () => {
  for (const variant of Object.keys(SIX_STROKE_VARIANTS) as Array<
    keyof typeof SIX_STROKE_VARIANTS
  >) {
    for (let deg = 0; deg <= 1080; deg += 15) {
      const k = evaluateSixStrokeKinematics(deg, variant);
      const pinX = k.crankPinOffset[0];
      const pinY = SIX_STROKE_GEOMETRY.crankCenterY + k.crankPinOffset[1];
      const wristX = 0;
      const wristY = k.wristPinY;

      const dist = Math.hypot(wristX - pinX, wristY - pinY);
      assert.ok(
        Math.abs(dist - SIX_STROKE_GEOMETRY.rodLength) < 1e-6,
        `Slider-crank constraint violated at ${deg} deg (${variant}): got ${dist}`,
      );

      // Rod midpoint must bisect crankpin and wrist pin exactly
      assert.ok(Math.abs(k.rodMidpoint[0] - pinX * 0.5) < 1e-6);
      assert.ok(Math.abs(k.rodMidpoint[1] - (pinY + wristY) * 0.5) < 1e-6);
    }
  }
});

test('reference-mechanical baseline stays strictly 720-degree 4-stroke without water injection', () => {
  for (let deg = 0; deg <= 720; deg += 18) {
    const k = evaluateSixStrokeKinematics(deg, 'reference-mechanical');
    assert.equal(k.cycleDegrees, 720);
    assert.equal(k.totalStrokes, 4);
    assert.equal(k.waterInjectorActive, 0);
    assert.equal(k.steamExpansionIntensity, 0);
  }
});

test('crower-water-steam variant activates water injection and steam expansion only in strokes 5-6', () => {
  const stroke3 = evaluateSixStrokeKinematics(420, 'crower-water-steam');
  assert.equal(stroke3.strokeNumber, 3);
  assert.equal(stroke3.waterInjectorActive, 0);
  assert.equal(stroke3.steamExpansionIntensity, 0);

  const stroke5 = evaluateSixStrokeKinematics(750, 'crower-water-steam');
  assert.equal(stroke5.strokeNumber, 5);
  assert.ok(stroke5.waterInjectorActive > 0);
  assert.ok(stroke5.steamExpansionIntensity > 0);

  const stroke6 = evaluateSixStrokeKinematics(960, 'crower-water-steam');
  assert.equal(stroke6.strokeNumber, 6);
  assert.ok(stroke6.exhaustValveLift > 0);
});
