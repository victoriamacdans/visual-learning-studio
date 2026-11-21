import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateInlineSixKinematics,
  INLINE_SIX_CONFIG,
} from './inlineSixKinematics.ts';

describe('inlineSixKinematics', () => {
  it('enforces the configured 1-5-3-6-2-4 firing order at 120-degree intervals across 720 degrees', () => {
    const expectedFiringAngles: Record<number, number> = {
      1: 0,
      5: 120,
      3: 240,
      6: 360,
      2: 480,
      4: 600,
    };

    for (const [cylStr, angle] of Object.entries(expectedFiringAngles)) {
      const cylNum = Number(cylStr);
      const snap = evaluateInlineSixKinematics(angle);
      const cyl = snap.cylinders.find((c) => c.cylinderNumber === cylNum)!;
      assert.equal(cyl.strokePhase, 'power', `Cylinder ${cylNum} should ignite at ${angle} deg`);
      assert.ok(cyl.combustionIntensity > 0.95);
      // Verify piston is at TDC
      const expectedTdc =
        INLINE_SIX_CONFIG.crankCenterY +
        INLINE_SIX_CONFIG.crankRadius +
        INLINE_SIX_CONFIG.rodLength;
      assert.ok(Math.abs(cyl.pistonPinY - expectedTdc) < 0.001);
    }
  });

  it('drives camshaft at exactly half crankshaft speed (0.5x)', () => {
    const snap1 = evaluateInlineSixKinematics(360);
    assert.equal(snap1.camAngleDeg, 180);

    const snap2 = evaluateInlineSixKinematics(719);
    assert.ok(Math.abs(snap2.camAngleDeg - 359.5) < 0.001);
  });

  it('maintains exact connecting rod length between crankpin and piston pin across the full 720-degree cycle', () => {
    for (let deg = 0; deg < 720; deg += 15) {
      const snap = evaluateInlineSixKinematics(deg);
      for (const cyl of snap.cylinders) {
        const dist = Math.hypot(cyl.pistonPinY - cyl.crankPinY, 0 - cyl.crankPinZ);
        assert.ok(
          Math.abs(dist - INLINE_SIX_CONFIG.rodLength) < 0.0005,
          `Rod length drifted at ${deg} deg for cyl ${cyl.cylinderNumber}: ${dist}`,
        );

        // Verify valve timing separation: intake & exhaust valves do not collide at peak compression/power
        if (cyl.strokePhase === 'power' && cyl.localCycleDeg > 10 && cyl.localCycleDeg < 160) {
          assert.equal(cyl.intakeValveLift, 0);
          assert.equal(cyl.exhaustValveLift, 0);
        }
      }
    }
  });
});
