import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeComponentFocusCamera,
  computeDynamicExplodeOffset,
  computeSceneBoundingFraming,
  computeSliderCrankState,
  evaluateComponentAnimation,
  resolveWorldComponentCenters,
} from './universalKinematics.ts';
import type { Scene3DComponentSpec } from '../types/tutor.ts';

describe('universalKinematics', () => {
  it('computes physically consistent slider-crank geometry at TDC, 90deg, and BDC', () => {
    const r = 0.5;
    const l = 1.5;

    const tdc = computeSliderCrankState(0, r, l);
    assert.ok(Math.abs(tdc.crankPinOffset[0]) < 1e-6);
    assert.ok(Math.abs(tdc.crankPinOffset[1] - r) < 1e-6);
    assert.ok(Math.abs(tdc.pistonTravel - r) < 1e-6);
    assert.ok(Math.abs(tdc.rodTiltAngle) < 1e-6);

    const bdc = computeSliderCrankState(Math.PI, r, l);
    assert.ok(Math.abs(bdc.pistonTravel + r) < 1e-6);
    assert.ok(Math.abs(bdc.rodTiltAngle) < 1e-6);

    const quarter = computeSliderCrankState(Math.PI / 2, r, l);
    assert.ok(Math.abs(quarter.crankPinOffset[0] - r) < 1e-6);
    assert.ok(quarter.rodTiltAngle > 0);
  });

  it('evaluates spin, reciprocate, pulse-scale, and orbit animations deterministically', () => {
    const spin = evaluateComponentAnimation(
      { type: 'spin', axis: 'z', speed: 2, amplitude: 0, phaseOffset: 0.5 },
      1.5,
      1,
    );
    assert.equal(spin.deltaRotation[2], 3.5);

    const pulse = evaluateComponentAnimation(
      { type: 'pulse-scale', axis: 'y', speed: 1, amplitude: 0.8, phaseOffset: 0 },
      Math.PI / 2,
      1,
    );
    assert.ok(pulse.uniformScale > 1.05);

    const orbit = evaluateComponentAnimation(
      { type: 'orbit', axis: 'y', speed: 1, amplitude: 1, phaseOffset: 0, orbitRadius: 2 },
      0,
      1,
    );
    assert.ok(Math.abs(orbit.deltaPosition[0] - 2) < 1e-6);
    assert.ok(Math.abs(orbit.deltaPosition[2]) < 1e-6);
  });

  it('accumulates parentId world positions and frames arbitrary assemblies cleanly', () => {
    const components: Scene3DComponentSpec[] = [
      {
        id: 'stator',
        name: 'Stator Housing',
        role: 'Outer electromagnetic frame',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        shapes: [
          {
            primitive: 'cylinder',
            offset: [0, 0, 0],
            rotation: [0, 0, Math.PI / 2],
            radius: 1.2,
            height: 2.0,
            material: { color: '#334155', metalness: 0.7, roughness: 0.35 },
          },
        ],
        animation: { type: 'none', axis: 'y', speed: 0, amplitude: 0, phaseOffset: 0 },
      },
      {
        id: 'rotor',
        name: 'Armature Rotor',
        role: 'Rotating core',
        parentId: 'stator',
        position: [0.4, 0, 0],
        rotation: [0, 0, 0],
        shapes: [
          {
            primitive: 'cylinder',
            offset: [0, 0, 0],
            rotation: [0, 0, Math.PI / 2],
            radius: 0.65,
            height: 1.8,
            material: { color: '#D97706', metalness: 0.85, roughness: 0.25 },
          },
        ],
        animation: { type: 'spin', axis: 'x', speed: 4, amplitude: 0, phaseOffset: 0 },
      },
    ];

    const centers = resolveWorldComponentCenters(components);
    assert.deepEqual(centers.get('rotor'), [0.4, 0, 0]);

    const framing = computeSceneBoundingFraming(components, 0);
    assert.ok(framing.radius >= 1.2);
    assert.ok(framing.overviewCameraPos[2] > framing.overviewTarget[2]);

    const explode = computeDynamicExplodeOffset(
      components[1],
      framing.center,
      [0.4, 0, 0],
      1,
      1,
    );
    assert.ok(Math.abs(explode[0]) + Math.abs(explode[1]) + Math.abs(explode[2]) > 0.2);

    const focus = computeComponentFocusCamera(components[1], components, framing.center, 0, 1);
    assert.deepEqual(focus.target, [0.4, 0, 0]);
    assert.ok(focus.position[2] > focus.target[2]);
  });
});
