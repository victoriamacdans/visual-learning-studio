import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inferShowcaseScenePlanFromText,
  validateSceneActionPlan,
} from './sceneRouting.ts';

describe('sceneRouting', () => {
  it('validates Gemini SceneActionPlan bounds and rejects invalid sceneIds', () => {
    assert.equal(validateSceneActionPlan({ sceneId: 'unknown-scene' }), undefined);

    const valid = validateSceneActionPlan({
      sceneId: 'inline-six',
      focusedCylinder: 4,
      crankAngleDeg: 840,
      viewMode: 'cutaway',
      play: true,
    });
    assert.ok(valid);
    assert.equal(valid.sceneId, 'inline-six');
    assert.equal(valid.focusedCylinder, 4);
    assert.equal(valid.componentId, 'cylinder-4');
    assert.equal(valid.crankAngleDeg, 120);
  });

  it('routes natural showcase queries cleanly across all five demonstrations', () => {
    const cyl4 = inferShowcaseScenePlanFromText('Explain cylinder four firing and piston stroke');
    assert.equal(cyl4?.sceneId, 'inline-six');
    assert.equal(cyl4?.focusedCylinder, 4);
    assert.equal(cyl4?.componentId, 'cylinder-4');

    const drill = inferShowcaseScenePlanFromText('Show me the planetary gearbox inside the cordless drill');
    assert.equal(drill?.sceneId, 'cordless-drill');
    assert.equal(drill?.componentId, 'gearbox');
    assert.equal(drill?.viewMode, 'internal');

    const ship = inferShowcaseScenePlanFromText('How does the container ship propeller shaft create water thrust?');
    assert.equal(ship?.sceneId, 'ship-propulsion');

    const robotPick = inferShowcaseScenePlanFromText('Use the robotic arm to pick up the apple and turn 90 degrees');
    assert.equal(robotPick?.sceneId, 'robotic-arm');
    assert.equal(robotPick?.sequenceId, 'sequence-a-pick-place');
    assert.equal(robotPick?.baseTurnDeg, 90);

    const robotCut = inferShowcaseScenePlanFromText('Cut the apple with the robotic arm gripper');
    assert.equal(robotCut?.sceneId, 'robotic-arm');
    assert.equal(robotCut?.sequenceId, 'sequence-b-cut');
    assert.ok(robotCut?.unsupportedRequestNotice, 'Should clarify separate cutter tool vs gripper');

    const turbo = inferShowcaseScenePlanFromText('Explain the jet engine combustion chamber');
    assert.equal(turbo?.sceneId, 'turbofan');
    assert.equal(turbo?.componentId, 'combustor');

    const genericSixStroke = inferShowcaseScenePlanFromText('Show me a Six Stroke Engine');
    assert.equal(genericSixStroke?.sceneId, 'six-stroke');
    assert.equal(genericSixStroke?.sixStrokeVariant, 'reference-mechanical');
    assert.ok(genericSixStroke?.unsupportedRequestNotice);

    const crowerSixStroke = inferShowcaseScenePlanFromText(
      'Explain the Crower six stroke engine with water injection and steam power',
    );
    assert.equal(crowerSixStroke?.sceneId, 'six-stroke');
    assert.equal(crowerSixStroke?.sixStrokeVariant, 'crower-water-steam');
    assert.equal(crowerSixStroke?.componentId, 'water-injector');

    const beareSixStroke = inferShowcaseScenePlanFromText(
      'How does a Beare secondary piston six stroke engine work?',
    );
    assert.equal(beareSixStroke?.sceneId, 'six-stroke');
    assert.equal(beareSixStroke?.sixStrokeVariant, 'beare-secondary-piston');
  });
});
