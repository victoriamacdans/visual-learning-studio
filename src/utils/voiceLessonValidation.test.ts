import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpeechStyleDirection,
  normalizeGeminiVoiceName,
  resolveValidLessonComponentId,
  sanitizeSpokenText,
  validateTeachLessonRequest,
  validateTeachLessonResponse,
  validateTeachTtsRequest,
  validateTeachTtsResponse,
} from './voiceLessonValidation.ts';
import type { LessonComponentSummary, ShowcaseSceneId } from '../types/tutor.ts';
import { PREPARED_SHOWCASE_LESSONS } from '../data/preparedShowcaseLessons.ts';
import { SHOWCASE_SCENE_DESCRIPTORS } from '../three/sceneController.ts';

const SHIP_COMPONENTS: readonly LessonComponentSummary[] = [
  { id: 'hull', name: 'Container Ship Hull', role: 'Buoyant steel vessel hull' },
  { id: 'propeller', name: 'Marine Propeller', role: 'Stern thrust screw' },
  { id: 'rudder', name: 'Steering Rudder', role: 'Directional hydrofoil' },
  { id: 'superstructure', name: 'Bridge Superstructure', role: 'Navigation deckhouse' },
];

describe('voiceLessonValidation', () => {
  it('validates teach request and preserves active non-turbofan model components', () => {
    const res = validateTeachLessonRequest({
      sceneKind: 'glb-asset',
      systemId: 'container-ship',
      systemTitle: 'Container Ship',
      components: SHIP_COMPONENTS,
      selectedComponentId: 'propeller',
      difficulty: 'beginner',
      personality: 'gen-z',
      question: 'How does the ship steer and move?',
      segmentMode: 'first-only',
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.sceneKind, 'glb-asset');
      assert.equal(res.value.systemId, 'container-ship');
      assert.equal(res.value.difficulty, 'beginner');
      assert.equal(res.value.personality, 'gen-z');
      assert.equal(res.value.selectedComponentId, 'propeller');
      assert.equal(res.value.segmentMode, 'first-only');
      assert.equal(res.value.components.length, 4);
    }
  });

  it('rejects requests without components or systemTitle', () => {
    const empty = validateTeachLessonRequest({
      sceneKind: 'turbofan',
      systemTitle: 'Turbofan',
      components: [],
    });
    assert.equal(empty.ok, false);
  });

  it('grounds segment componentIds strictly to the active 3D model components', () => {
    assert.equal(resolveValidLessonComponentId('propeller', SHIP_COMPONENTS), 'propeller');
    assert.equal(resolveValidLessonComponentId('Marine Propeller', SHIP_COMPONENTS), 'propeller');
    // Unrelated turbofan IDs must fall back cleanly to a valid component on the active model
    assert.equal(resolveValidLessonComponentId('combustor', SHIP_COMPONENTS), 'hull');
  });

  it('sanitizes markdown from spokenText and enforces 4-6 segment cap', () => {
    assert.equal(sanitizeSpokenText('**Spinning** `propeller` pushes *water*!'), 'Spinning propeller pushes water!');
    assert.equal(sanitizeSpokenText('- High-bypass turbofan thrust'), 'High-bypass turbofan thrust');

    const rawSegments = Array.from({ length: 7 }, (_, i) => ({
      id: `s-${i + 1}`,
      title: `Step ${i + 1}`,
      spokenText: `**Segment ${i + 1}** explains the ${SHIP_COMPONENTS[i % SHIP_COMPONENTS.length].name}.`,
      captionText: `Segment ${i + 1} caption`,
      componentId: SHIP_COMPONENTS[i % SHIP_COMPONENTS.length].id,
      cameraAction: i === 0 ? 'overview' : 'focus-component',
      highlightAction: i === 2 ? 'isolate' : 'highlight',
      animationAction: i === 4 ? 'explode' : 'play',
    }));

    const res = validateTeachLessonResponse(
      JSON.stringify({
        lessonTitle: 'How a Container Ship Moves',
        systemTitle: 'Container Ship',
        introSummary: 'Explore how the hull, propeller, and rudder work together.',
        segments: rawSegments,
      }),
      SHIP_COMPONENTS,
      'advanced',
      'professional',
      'Container Ship',
    );

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.segments.length, 6);
      assert.equal(res.value.difficulty, 'advanced');
      assert.equal(res.value.personality, 'professional');
      assert.equal(res.value.segments[0].cameraAction, 'overview');
      assert.equal(res.value.segments[0].spokenText.includes('**'), false);
      assert.equal(res.value.segments[2].highlightAction, 'isolate');
      assert.equal(res.value.segments[4].animationAction, 'explode');
    }
  });

  it('supports single-segment first-only fast-path lessons', () => {
    const res = validateTeachLessonResponse(
      JSON.stringify({
        lessonTitle: 'Quick Intro',
        systemTitle: 'Container Ship',
        introSummary: 'Start with the hull.',
        segments: [
          {
            id: 'fast-1',
            title: 'Hull',
            spokenText: 'Look at the buoyant hull keeping the ship afloat.',
            captionText: 'Look at the buoyant hull.',
            componentId: 'hull',
            cameraAction: 'overview',
            highlightAction: 'highlight',
            animationAction: 'play',
          },
        ],
      }),
      SHIP_COMPONENTS,
      'beginner',
      'friendly',
      'Container Ship',
      1,
    );

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.segments.length, 1);
      assert.equal(res.value.segments[0].componentId, 'hull');
    }
  });

  it('validates all prepared showcase lessons against showcase hierarchy component IDs', () => {
    const sceneIds = Object.keys(PREPARED_SHOWCASE_LESSONS) as ShowcaseSceneId[];
    assert.equal(sceneIds.includes('six-stroke'), true);
    for (const sceneId of sceneIds) {
      const lesson = PREPARED_SHOWCASE_LESSONS[sceneId];
      const descriptor = SHOWCASE_SCENE_DESCRIPTORS[sceneId];
      const comps = descriptor.hierarchy.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
      }));
      const res = validateTeachLessonResponse(
        JSON.stringify(lesson),
        comps,
        lesson.difficulty,
        lesson.personality,
        descriptor.title,
      );
      assert.equal(res.ok, true, `Prepared lesson failed validation for ${sceneId}`);
      if (res.ok) {
        assert.ok(res.value.segments.length >= 4 && res.value.segments.length <= 6);
        for (const seg of res.value.segments) {
          assert.ok(
            comps.some((c) => c.id === seg.componentId),
            `Invalid componentId ${seg.componentId} in prepared lesson for ${sceneId}`,
          );
        }
      }
    }
  });

  it('validates Gemini TTS requests, defaults to Puck, and builds upbeat style directions', () => {
    assert.equal(normalizeGeminiVoiceName('unknown-voice'), 'Puck');
    assert.equal(normalizeGeminiVoiceName('zephyr'), 'Zephyr');

    const req = validateTeachTtsRequest({
      text: '**Welcome!** Let us explore this fan.',
      voiceName: 'zephyr',
      personality: 'gen-z',
      difficulty: 'beginner',
    });
    assert.equal(req.ok, true);
    if (req.ok) {
      assert.equal(req.value.text, 'Welcome! Let us explore this fan.');
      assert.equal(req.value.voiceName, 'Zephyr');
      assert.equal(req.value.personality, 'gen-z');
    }

    const emptyReq = validateTeachTtsRequest({ text: '   ' });
    assert.equal(emptyReq.ok, false);

    const style = buildSpeechStyleDirection('friendly', 'beginner');
    assert.equal(style.toLowerCase().includes('bright'), true);

    const ttsRes = validateTeachTtsResponse({
      audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
      mimeType: 'audio/wav',
      voiceName: 'Puck',
    });
    assert.equal(ttsRes.ok, true);
  });
});
