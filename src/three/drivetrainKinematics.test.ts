import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computePlanetaryGearAngles,
  computeShipPropulsionState,
  DRILL_PLANETARY_CONFIG,
} from './drivetrainKinematics.ts';

describe('drivetrainKinematics', () => {
  it('computes coherent 4:1 planetary reduction ratio between motor sun gear and chuck output shaft', () => {
    const motorSpeed = 16; // rad/s
    const snap = computePlanetaryGearAngles(1.0, motorSpeed, DRILL_PLANETARY_CONFIG);

    // Zs=12, Zp=12, Zr=36 => reduction ratio 12 / 48 = 0.25
    assert.equal(snap.reductionRatio, 0.25);
    assert.equal(snap.sunAngleRad, 16);
    assert.equal(snap.carrierAndChuckAngleRad, 4);

    // Planet spins opposite relative to carrier with ratio Zr / Zp = 36 / 12 = 3
    assert.equal(snap.planetRelativeSpinRad, -12);
  });

  it('synchronizes ship engine crankshaft, coupling, propeller shaft, and slipstream phase', () => {
    const s1 = computeShipPropulsionState(0.5, 5.0);
    const s2 = computeShipPropulsionState(1.0, 5.0);

    assert.equal(s1.shaftAngleRad, s1.engineCrankRad);
    assert.equal(s2.shaftAngleRad, 5.0);
    assert.ok(s1.slipstreamPhase >= 0 && s1.slipstreamPhase < 1);
  });
});
