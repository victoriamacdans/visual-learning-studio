import type { SceneActionPlan, ShowcaseSceneId } from '../types/tutor.ts';
import { SIX_STROKE_VARIANTS, type SixStrokeVariantId } from '../three/sixStrokeKinematics.ts';
import {
  isValidShowcaseSceneId,
  resolveComponentForScene,
  SHOWCASE_SCENE_DESCRIPTORS,
} from '../three/sceneController.ts';

const VALID_VIEW_MODES = new Set(['full', 'cutaway', 'internal', 'airflow', 'thermal']);

/**
 * Validates a Gemini-generated SceneActionPlan strictly against the active
 * showcase descriptors and parameter bounds. Never executes arbitrary code.
 */
export function validateSceneActionPlan(raw: unknown): SceneActionPlan | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (!isValidShowcaseSceneId(obj.sceneId)) return undefined;

  const sceneId: ShowcaseSceneId = obj.sceneId;
  const desc = SHOWCASE_SCENE_DESCRIPTORS[sceneId];

  const componentId = obj.componentId
    ? resolveComponentForScene(sceneId, obj.componentId) ?? undefined
    : undefined;

  const sequenceId =
    typeof obj.sequenceId === 'string' &&
    desc.sequences.some((s) => s.id === obj.sequenceId)
      ? obj.sequenceId
      : undefined;

  const seekProgress =
    typeof obj.seekProgress === 'number' && Number.isFinite(obj.seekProgress)
      ? Math.max(0, Math.min(1, Number(obj.seekProgress.toFixed(3))))
      : undefined;

  const rawViewMode =
    typeof obj.viewMode === 'string' ? obj.viewMode.trim().toLowerCase() : '';
  const viewMode =
    VALID_VIEW_MODES.has(rawViewMode) &&
    desc.supportedViewModes.includes(rawViewMode as NonNullable<SceneActionPlan['viewMode']>)
      ? (rawViewMode as SceneActionPlan['viewMode'])
      : undefined;

  const focusedCylinder =
    sceneId === 'inline-six' &&
    typeof obj.focusedCylinder === 'number' &&
    Number.isFinite(obj.focusedCylinder)
      ? Math.max(1, Math.min(6, Math.round(obj.focusedCylinder)))
      : undefined;

  const cycleWrapDeg = sceneId === 'inline-six' ? 720 : 1080;
  const crankAngleDeg =
    (sceneId === 'inline-six' || sceneId === 'six-stroke') &&
    typeof obj.crankAngleDeg === 'number' &&
    Number.isFinite(obj.crankAngleDeg)
      ? ((obj.crankAngleDeg % cycleWrapDeg) + cycleWrapDeg) % cycleWrapDeg
      : undefined;

  const sixStrokeVariant =
    sceneId === 'six-stroke' &&
    typeof obj.sixStrokeVariant === 'string' &&
    obj.sixStrokeVariant in SIX_STROKE_VARIANTS
      ? (obj.sixStrokeVariant as SixStrokeVariantId)
      : undefined;

  const baseTurnDeg =
    sceneId === 'robotic-arm' &&
    typeof obj.baseTurnDeg === 'number' &&
    Number.isFinite(obj.baseTurnDeg)
      ? Math.max(-180, Math.min(180, Math.round(obj.baseTurnDeg)))
      : undefined;

  const unsupportedRequestNotice =
    typeof obj.unsupportedRequestNotice === 'string' && obj.unsupportedRequestNotice.trim()
      ? obj.unsupportedRequestNotice.trim().slice(0, 240)
      : undefined;

  return {
    sceneId,
    componentId:
      focusedCylinder !== undefined ? `cylinder-${focusedCylinder}` : componentId,
    sequenceId,
    seekProgress,
    viewMode,
    isolate: typeof obj.isolate === 'boolean' ? obj.isolate : undefined,
    play: typeof obj.play === 'boolean' ? obj.play : undefined,
    crankAngleDeg,
    focusedCylinder,
    sixStrokeVariant,
    baseTurnDeg,
    unsupportedRequestNotice,
  };
}

const WORD_TO_CYLINDER: Readonly<Record<string, number>> = {
  '1': 1,
  one: 1,
  first: 1,
  '2': 2,
  two: 2,
  second: 2,
  '3': 3,
  three: 3,
  third: 3,
  '4': 4,
  four: 4,
  fourth: 4,
  '5': 5,
  five: 5,
  fifth: 5,
  '6': 6,
  six: 6,
  sixth: 6,
};

/**
 * Deterministic safety-net / fast-path interpreter for explicit showcase scene
 * and component queries when Gemini returns metadata or as an augmentation check.
 */
export function inferShowcaseScenePlanFromText(
  question: string,
  activeSceneId?: ShowcaseSceneId,
): SceneActionPlan | undefined {
  const q = question.toLowerCase();

  // Check six-stroke / single-cylinder cutaway queries FIRST so they never fall back to tiny generic boxes
  if (
    /\bsix[- ]?stroke\b|\b6[- ]?stroke\b|\bcrower\b|\bwater[- ]?steam\b|\bsingle[- ]?cylinder\b|\bpiston[- ]?cylinder\b/.test(
      q,
    )
  ) {
    const wantsCrowerWater = /\bcrower\b|\bwater\b|\bsteam\b/.test(q);
    const wantsBeare = /\bbeare\b|\bsecondary\s+scaveng/.test(q);
    const variant: SixStrokeVariantId = wantsCrowerWater
      ? 'crower-water-steam'
      : wantsBeare
        ? 'beare-secondary-piston'
        : 'reference-mechanical';

    const comp = q.includes('piston')
      ? 'piston'
      : q.includes('connecting') || q.includes('rod')
        ? 'connecting-rod'
        : q.includes('crank') || q.includes('flywheel')
          ? 'crankshaft'
          : q.includes('valve') || q.includes('cam')
            ? 'valves-camtrain'
            : q.includes('water') && variant === 'crower-water-steam'
              ? 'water-injector'
              : q.includes('head') || q.includes('spark')
                ? 'cylinder-head'
                : undefined;

    return {
      sceneId: 'six-stroke',
      sixStrokeVariant: variant,
      componentId: comp,
      sequenceId: 'crank-slider-cycle',
      viewMode: 'cutaway',
      play: true,
      ...(variant === 'reference-mechanical'
        ? {
            unsupportedRequestNotice:
              'Generic request does not identify a six-stroke patent variant; showing verified slider-crank mechanical baseline. Switch variant selector to compare Crower water-steam or secondary scavenging.',
          }
        : {}),
    };
  }

  // Check cylinder-specific queries (e.g., "Explain cylinder four")
  const cylMatch = /\bcylinder\s+(1|2|3|4|5|6|one|two|three|four|five|six|first|second|third|fourth|fifth|sixth)\b/.exec(q);
  if (
    cylMatch ||
    /\binline[- ]?six\b|\binline[- ]?6\b|\bi6\b|\b1-5-3-6-2-4\b|\bcamshaft\b|\bcrankshaft\b/.test(q)
  ) {
    const cylNum = cylMatch ? WORD_TO_CYLINDER[cylMatch[1]] : undefined;
    const comp =
      cylNum !== undefined
        ? `cylinder-${cylNum}`
        : q.includes('camshaft') || q.includes('valve')
          ? 'camshaft'
          : q.includes('crankshaft') || q.includes('crank')
            ? 'crankshaft'
            : q.includes('intake')
              ? 'intake-manifold'
              : q.includes('exhaust')
                ? 'exhaust-manifold'
                : undefined;
    return {
      sceneId: 'inline-six',
      componentId: comp,
      focusedCylinder: cylNum,
      viewMode: 'cutaway',
      sequenceId: 'four-stroke-cycle',
      play: true,
    };
  }

  // Robotic arm queries
  if (/\brobot(?:ic)?\s*arm\b|\bgripper\b|\bapple\b|\bpick\s*(?:and|&)?\s*place\b/.test(q)) {
    const wantsCut = /\bcut\b|\bslice\b|\bsplit\b|\bcutter\b|\bknife\b/.test(q);
    const turnMatch = /(\d{1,3})\s*(?:deg|degree|degrees)/.exec(q);
    const turnDeg = turnMatch
      ? Math.max(-180, Math.min(180, Number(turnMatch[1])))
      : 90;
    const usesGripperForCut = wantsCut && q.includes('gripper');

    return {
      sceneId: 'robotic-arm',
      sequenceId: wantsCut ? 'sequence-b-cut' : 'sequence-a-pick-place',
      componentId: wantsCut ? 'cutter' : q.includes('apple') ? 'apple' : 'gripper',
      baseTurnDeg: turnDeg,
      play: true,
      ...(usesGripperForCut
        ? {
            unsupportedRequestNotice:
              'Parallel gripper only grasps and transports objects; switched to the dedicated conceptual cutting blade tool for Sequence B.',
          }
        : {}),
    };
  }

  // Cordless drill queries
  if (/\bcordless drill\b|\bdrill\b|\bplanetary gear\b|\bchuck\b/.test(q)) {
    const comp = q.includes('gear')
      ? 'gearbox'
      : q.includes('motor')
        ? 'motor'
        : q.includes('trigger')
          ? 'trigger'
          : q.includes('shaft')
            ? 'output-shaft'
            : q.includes('chuck')
              ? 'chuck'
              : 'gearbox';
    return {
      sceneId: 'cordless-drill',
      componentId: comp,
      sequenceId: 'powertrain-chain',
      viewMode: 'internal',
      play: true,
    };
  }

  // Ship propulsion queries
  if (
    /\bcontainer ship\b|\bship propulsion\b|\bmarine propeller\b|\bpropeller shaft\b|\bship\b|\bvessel\b|\brudder\b|\bwater thrust\b/.test(q)
  ) {
    const comp = q.includes('coupling')
      ? 'coupling'
      : q.includes('shaft')
        ? 'propeller-shaft'
        : q.includes('thrust') || q.includes('wake')
          ? 'water-thrust'
          : q.includes('engine')
            ? 'engine'
            : q.includes('rudder')
              ? 'rudder'
              : 'propeller';
    return {
      sceneId: 'ship-propulsion',
      componentId: comp,
      sequenceId: 'marine-propulsion',
      viewMode: 'cutaway',
      play: true,
    };
  }

  // Turbofan queries
  if (/\bturbofan\b|\bjet engine\b|\bbypass\b|\bcombustor\b|\bcompressor\b|\bnozzle\b/.test(q)) {
    const comp = q.includes('intake')
      ? 'intake'
      : q.includes('fan')
        ? 'fan'
        : q.includes('lp')
          ? 'lp-compressor'
          : q.includes('compressor')
            ? 'hp-compressor'
            : q.includes('combust')
              ? 'combustor'
              : q.includes('turbine')
                ? 'turbine'
                : q.includes('nozzle')
                  ? 'nozzle'
                  : 'fan';
    return {
      sceneId: 'turbofan',
      componentId: comp,
      sequenceId: 'propulsion-tour',
      viewMode: q.includes('thermal') || q.includes('heat') ? 'thermal' : 'cutaway',
      play: true,
    };
  }

  // Contextual follow-up within active scene
  if (activeSceneId) {
    if (activeSceneId === 'robotic-arm' && /\bsequence\s*b\b|\bcut\b/.test(q)) {
      return { sceneId: 'robotic-arm', sequenceId: 'sequence-b-cut', componentId: 'cutter', play: true };
    }
    if (activeSceneId === 'robotic-arm' && /\bsequence\s*a\b|\bpick\b|\bplace\b/.test(q)) {
      return { sceneId: 'robotic-arm', sequenceId: 'sequence-a-pick-place', componentId: 'gripper', play: true };
    }
  }

  return undefined;
}
