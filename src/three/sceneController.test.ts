import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyValidatedScenePlan,
  createInitialSceneControllerState,
  focusComponent,
  getActiveTimelineEvent,
  getSceneDescriptor,
  highlightComponent,
  isolateComponent,
  loadScene,
  pauseSequence,
  playSequence,
  resetScene,
  resumeSequence,
  seekSequence,
  setCrankAngle,
  setPlaybackSpeed,
  SHOWCASE_SCENE_LIST,
} from './sceneController.ts';

describe('Universal Scene Controller', () => {
  it('defines all six showcase scenes with non-empty component hierarchies and sequences', () => {
    assert.equal(SHOWCASE_SCENE_LIST.length, 6);
    const ids = new Set(SHOWCASE_SCENE_LIST.map((s) => s.sceneId));
    assert.deepEqual(
      ids,
      new Set([
        'turbofan',
        'inline-six',
        'six-stroke',
        'cordless-drill',
        'ship-propulsion',
        'robotic-arm',
      ]),
    );

    for (const desc of SHOWCASE_SCENE_LIST) {
      assert.ok(desc.hierarchy.length >= 7, `${desc.sceneId} should expose granular components`);
      assert.ok(desc.sequences.length >= 1, `${desc.sceneId} should define at least one timeline sequence`);
      const validIds = new Set(desc.hierarchy.map((h) => h.id));
      for (const seq of desc.sequences) {
        for (const evt of seq.events) {
          assert.ok(
            validIds.has(evt.componentId),
            `Timeline event componentId "${evt.componentId}" must exist in ${desc.sceneId}`,
          );
        }
      }
    }
  });

  it('validates loadScene, focusComponent, highlightComponent, isolateComponent, and resetScene', () => {
    let state = createInitialSceneControllerState('turbofan');
    state = loadScene(state, 'inline-six', { focusedCylinder: 4 });
    assert.equal(state.sceneId, 'inline-six');
    assert.equal(state.activeComponentId, 'cylinder-4');
    assert.equal(state.cameraTarget, 'cylinder-4');
    assert.equal(state.focusedCylinder, 4);

    // Invalid component id should safely leave valid state intact
    const ignored = focusComponent(state, 'nonexistent-part');
    assert.equal(ignored.activeComponentId, 'cylinder-4');

    state = highlightComponent(state, 'camshaft', 'highlight');
    assert.equal(state.highlightedComponentId, 'camshaft');
    assert.equal(state.highlightMode, 'highlight');

    state = isolateComponent(state, 'crankshaft');
    assert.equal(state.highlightMode, 'isolate');
    assert.equal(state.activeComponentId, 'crankshaft');

    state = resetScene(state);
    assert.equal(state.highlightMode, 'none');
    assert.equal(state.cameraTarget, 'overview');
    assert.equal(state.focusedCylinder, null);
  });

  it('bounds seekSequence, setPlaybackSpeed, and voice pause/resume coordination', () => {
    let state = createInitialSceneControllerState('robotic-arm');
    assert.equal(state.activeSequenceId, 'sequence-a-pick-place');
    assert.equal(state.activeTool, 'gripper');

    // Switching to Sequence B switches to dedicated cutter tool
    state = playSequence(state, 'sequence-b-cut');
    assert.equal(state.activeSequenceId, 'sequence-b-cut');
    assert.equal(state.activeTool, 'cutter');
    assert.equal(state.isPlaying, true);

    state = seekSequence(state, 1.8);
    assert.equal(state.sequenceProgress, 1);
    state = seekSequence(state, -0.4);
    assert.equal(state.sequenceProgress, 0);

    state = setPlaybackSpeed(state, 99);
    assert.equal(state.playbackSpeed, 3);
    state = setPlaybackSpeed(state, 0.01);
    assert.equal(state.playbackSpeed, 0.25);

    // Voice pause sets pausedByVoice so voice resume only resumes if paused by voice
    state = pauseSequence(state, true);
    assert.equal(state.isPlaying, false);
    assert.equal(state.pausedByVoice, true);
    state = resumeSequence(state, true);
    assert.equal(state.isPlaying, true);
    assert.equal(state.pausedByVoice, false);

    // Manual pause should NOT be overridden by voice resume
    state = pauseSequence(state, false);
    state = resumeSequence(state, true);
    assert.equal(state.isPlaying, false);
  });

  it('maps inline-six crank angle across 0-720 deg and finds active timeline event', () => {
    let state = createInitialSceneControllerState('inline-six');
    state = setCrankAngle(state, 540);
    assert.equal(state.crankAngleDeg, 540);
    assert.equal(state.sequenceProgress, 0.75);

    const evt = getActiveTimelineEvent('inline-six', state.activeSequenceId, state.sequenceProgress);
    assert.ok(evt);
    assert.equal(evt.componentId, 'cylinder-2');
  });

  it('safely applies validated SceneActionPlan JSON without arbitrary code execution', () => {
    const start = createInitialSceneControllerState('turbofan');
    const updated = applyValidatedScenePlan(start, {
      sceneId: 'robotic-arm',
      sequenceId: 'sequence-a-pick-place',
      seekProgress: 0.58,
      baseTurnDeg: 90,
      componentId: 'base',
      play: true,
    });

    assert.equal(updated.sceneId, 'robotic-arm');
    assert.equal(updated.activeSequenceId, 'sequence-a-pick-place');
    assert.equal(updated.activeTool, 'gripper');
    assert.equal(updated.sequenceProgress, 0.58);
    assert.equal(updated.baseTurnDeg, 90);
    assert.equal(updated.activeComponentId, 'base');
    assert.equal(updated.isPlaying, true);

    const desc = getSceneDescriptor('robotic-arm');
    assert.equal(desc.sequences.length, 2);
  });
});
