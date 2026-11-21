import type {
  ExplanationDifficulty,
  NarratorPersonality,
} from '../config/appConfig.ts';
import type {
  ShowcaseSceneId,
  TeachLessonRequest,
  TeachLessonResponse,
} from '../types/tutor.ts';

/**
 * Curated, pre-validated beginner + friendly guided voice lessons for all
 * showcase 3D systems. Used on the fast-path when no custom question, PDF highlight,
 * or screen screenshot is supplied, enabling instant lesson launch and background
 * Segment 1 Gemini Neural TTS audio warm-up on server startup.
 */
export const PREPARED_SHOWCASE_LESSONS: Readonly<
  Record<ShowcaseSceneId, TeachLessonResponse>
> = {
  turbofan: {
    lessonTitle: 'How a High-Bypass Turbofan Creates Thrust',
    systemTitle: 'High-Bypass Turbofan Engine',
    introSummary:
      'Follow air from the front intake fan through compression, combustion, turbine drive, and exhaust acceleration.',
    difficulty: 'beginner',
    personality: 'friendly',
    segments: [
      {
        id: 'tf-seg-1',
        title: 'Air Intake & Fan',
        spokenText:
          'Welcome to the turbofan jet engine! Out front, this giant spinning fan acts like a super-powered propeller inside a tube, pulling in a huge wave of fresh air every second.',
        captionText:
          'Out front, the spinning bypass fan pulls in a massive stream of fresh air inside the intake.',
        componentId: 'fan',
        cameraAction: 'overview',
        highlightAction: 'highlight',
        animationAction: 'layer-cutaway',
        sequenceId: 'propulsion-tour',
        seekProgress: 0.16,
      },
      {
        id: 'tf-seg-2',
        title: 'Bypass Air Path',
        spokenText:
          'Here is the cool secret of modern airliners: most of that air skips the fiery core altogether and rushes smoothly around the outside bypass duct, creating quiet, fuel-saving push.',
        captionText:
          'Most intake air flows around the outer bypass duct, delivering quiet, efficient forward thrust.',
        componentId: 'bypass-duct',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'layer-airflow',
        sequenceId: 'propulsion-tour',
        seekProgress: 0.25,
      },
      {
        id: 'tf-seg-3',
        title: 'Squeezing the Air',
        spokenText:
          'The remaining air enters the center core and gets squeezed tighter and tighter by rows of spinning compressor blades, just like pumping air hard into a bicycle tire.',
        captionText:
          'Spinning compressor stages squeeze core air into a high-pressure stream before fuel is added.',
        componentId: 'hp-compressor',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'propulsion-tour',
        seekProgress: 0.36,
      },
      {
        id: 'tf-seg-4',
        title: 'Combustion Heat',
        spokenText:
          'Inside the combustion chamber, fuel sprays into that squeezed air and burns steadily like a camp stove on high, making the gas swell with tremendous energy.',
        captionText:
          'Fuel burns continuously in the combustion chamber, heating and expanding the compressed air.',
        componentId: 'combustor',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'layer-thermal',
        sequenceId: 'propulsion-tour',
        seekProgress: 0.54,
      },
      {
        id: 'tf-seg-5',
        title: 'Turbine & Nozzle',
        spokenText:
          'That rushing hot gas spins the rear turbine windmill to power the front fan, then shoots out the exhaust nozzle, pushing the airplane forward by action and reaction.',
        captionText:
          'Expanding gas spins the turbine shaft driving the front fan before accelerating out the nozzle.',
        componentId: 'turbine',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'layer-cutaway',
        sequenceId: 'propulsion-tour',
        seekProgress: 0.82,
      },
    ],
  },

  'inline-six': {
    lessonTitle: 'Inside the Inline-Six Car Engine',
    systemTitle: 'Inline-Six Car Engine',
    introSummary:
      'See six cylinders work in smooth 1-5-3-6-2-4 harmony, turning piston motion into crankshaft spin.',
    difficulty: 'beginner',
    personality: 'friendly',
    segments: [
      {
        id: 'i6-seg-1',
        title: 'Six Cylinders in Line',
        spokenText:
          'Let us peek inside this inline-six car engine! Six pistons sit neatly in a single straight row, taking turns pushing down to keep the engine running silky smooth.',
        captionText:
          'Six cylinders sit in a straight line inside the cutaway block, firing smoothly in turn.',
        componentId: 'cylinder-block',
        cameraAction: 'overview',
        highlightAction: 'highlight',
        animationAction: 'layer-cutaway',
        sequenceId: 'four-stroke-cycle',
        seekProgress: 0,
      },
      {
        id: 'i6-seg-2',
        title: 'Four-Stroke Cylinder',
        spokenText:
          'Watch cylinder four move through its four-step dance: breathing fresh air in, squeezing it tight, firing with a tiny spark, and pushing exhaust gas right back out.',
        captionText:
          'Each cylinder repeats four strokes: intake, compression, spark power, and exhaust.',
        componentId: 'cylinder-4',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'four-stroke-cycle',
        seekProgress: 0.84,
      },
      {
        id: 'i6-seg-3',
        title: 'Crankshaft Spin',
        spokenText:
          'Down below, the crankshaft works just like the pedals on a bicycle. Every piston pushes a crankpin with its connecting rod, turning up-and-down motion into steady spin.',
        captionText:
          'Connecting rods push offset crankpins on the crankshaft, converting piston motion into spin.',
        componentId: 'crankshaft',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'crank-cam-sync',
        seekProgress: 0.15,
      },
      {
        id: 'i6-seg-4',
        title: 'Camshaft Timing',
        spokenText:
          'Up top, the camshaft spins at exactly half the speed of the crankshaft, tapping little metal doors open and closed at just the right moment for each cylinder to breathe.',
        captionText:
          'The overhead camshaft turns at half crank speed to open and close intake and exhaust valves.',
        componentId: 'camshaft',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'crank-cam-sync',
        seekProgress: 0.45,
      },
    ],
  },

  'six-stroke': {
    lessonTitle: 'Single-Cylinder Cutaway & Stroke Timing',
    systemTitle: 'Single-Cylinder Engine Cutaway (Six-Stroke Ref)',
    introSummary:
      'Explore piston rings, H-beam connecting rod, crankshaft inertia, valve springs, and six-stroke reference concepts.',
    difficulty: 'beginner',
    personality: 'friendly',
    segments: [
      {
        id: 'ss-seg-1',
        title: 'Cutaway Engine View',
        spokenText:
          'Take a close look inside this single-cylinder engine cutaway! Watching one cylinder makes it super easy to see how every moving part locks together without any mystery.',
        captionText:
          'The cutaway cylinder block reveals the piston, connecting rod, crankshaft, and valve train moving together.',
        componentId: 'cylinder-block',
        cameraAction: 'overview',
        highlightAction: 'highlight',
        animationAction: 'layer-cutaway',
        sequenceId: 'crank-slider-cycle',
        seekProgress: 0,
      },
      {
        id: 'ss-seg-2',
        title: 'Sealed Piston Motion',
        spokenText:
          'That silver piston slides smoothly up and down inside the cylinder wall. Notice the three shiny rings wrapped around its top—they seal in hot pressure just like a tight bottle cap.',
        captionText:
          'Three compression rings around the Lathe piston seal chamber pressure as it slides vertically.',
        componentId: 'piston',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'crank-slider-cycle',
        seekProgress: 0.25,
      },
      {
        id: 'ss-seg-3',
        title: 'Rod & Crank Linkage',
        spokenText:
          'The sturdy connecting rod links the piston wrist pin to the spinning crankshaft below, turning every downward push into smooth rotation stabilized by the heavy toothed flywheel.',
        captionText:
          'The H-beam connecting rod turns vertical piston force into steady crankshaft and flywheel rotation.',
        componentId: 'connecting-rod',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'crank-slider-cycle',
        seekProgress: 0.55,
      },
      {
        id: 'ss-seg-4',
        title: 'Valves & Cycle Timing',
        spokenText:
          'At the top, overhead cams press spring-loaded valves down to let air in and exhaust out. You can also switch variants above to compare a four-stroke baseline with conceptual six-stroke steam or scavenging cycles.',
        captionText:
          'Overhead cam lobes and helical springs time the valves; switch variants above to compare 720-degree and 1080-degree cycles.',
        componentId: 'valves-camtrain',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'crank-slider-cycle',
        seekProgress: 0.85,
      },
    ],
  },

  'cordless-drill': {
    lessonTitle: 'How a Cordless Drill Multiplies Torque',
    systemTitle: 'Cordless Drill & Planetary Drivetrain',
    introSummary:
      'Trace electrical power from trigger and battery to the motor, planetary gearbox, and keyless chuck.',
    difficulty: 'beginner',
    personality: 'friendly',
    segments: [
      {
        id: 'cd-seg-1',
        title: 'Power From the Base',
        spokenText:
          'Let us open up this cordless drill and see where its twist power comes from! Down in the handle base, the battery pack stores electrical energy waiting for your finger on the trigger.',
        captionText:
          'The battery pack and trigger modulate electrical power delivered up into the drill body.',
        componentId: 'battery',
        cameraAction: 'overview',
        highlightAction: 'highlight',
        animationAction: 'layer-cutaway',
        sequenceId: 'powertrain-chain',
        seekProgress: 0,
      },
      {
        id: 'cd-seg-2',
        title: 'Fast Electric Motor',
        spokenText:
          'When you squeeze the trigger, the electric motor spins super fast—but with only a light twist. Think of riding a bicycle in an easy gear: fast feet, light push.',
        captionText:
          'The DC motor spins at very high speed, driving a small central sun gear.',
        componentId: 'motor',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'powertrain-chain',
        seekProgress: 0.25,
      },
      {
        id: 'cd-seg-3',
        title: 'Planetary Gear Reduction',
        spokenText:
          'Next, those fast spins enter the planetary gearbox. Three planet gears orbit inside a ring, trading extra speed for four times more twisting strength to drive tough screws.',
        captionText:
          'The planetary gearbox trades high motor speed for multiplied torque at a slower output speed.',
        componentId: 'gearbox',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'powertrain-chain',
        seekProgress: 0.55,
      },
      {
        id: 'cd-seg-4',
        title: 'Spindle & Chuck',
        spokenText:
          'Finally, the thick output shaft carries that strong, steady twist directly to the keyless three-jaw chuck out front, gripping your drill bit firmly on target.',
        captionText:
          'The output shaft locks directly into the three-jaw chuck to turn bits with high torque.',
        componentId: 'chuck',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'powertrain-chain',
        seekProgress: 0.85,
      },
    ],
  },

  'ship-propulsion': {
    lessonTitle: 'How a Container Ship Pushes Across the Ocean',
    systemTitle: 'Container Ship & Marine Propulsion',
    introSummary:
      'Follow torque from the aft engine room through the shaftline to the submerged propeller and rudder.',
    difficulty: 'beginner',
    personality: 'friendly',
    segments: [
      {
        id: 'sp-seg-1',
        title: 'Vessel Architecture',
        spokenText:
          'Check out this ocean container ship! Its long steel hull glides through the water while a tall bridge tower near the back sits right above the hidden machinery room.',
        captionText:
          'The vessel hull supports cargo decks forward, with the bridge and propulsion machinery aft.',
        componentId: 'hull',
        cameraAction: 'overview',
        highlightAction: 'highlight',
        animationAction: 'layer-cutaway',
        sequenceId: 'marine-propulsion',
        seekProgress: 0,
      },
      {
        id: 'sp-seg-2',
        title: 'Aft Marine Engine',
        spokenText:
          'Deep inside the rear engine room, a massive diesel engine creates huge turning force. Placing it near the stern keeps the connecting drive shaft short, strong, and reliable.',
        captionText:
          'The conceptual aft marine engine generates high torque near the stern machinery space.',
        componentId: 'engine',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'marine-propulsion',
        seekProgress: 0.22,
      },
      {
        id: 'sp-seg-3',
        title: 'Shaftline & Bearing',
        spokenText:
          'Torque travels through a flexible coupling and steel propeller shaft running straight out the stern. A heavy thrust block pushes against the ship frame so the boat moves forward.',
        captionText:
          'The coupling and propeller shaft carry torque aft while transferring forward thrust to the hull.',
        componentId: 'propeller-shaft',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'marine-propulsion',
        seekProgress: 0.52,
      },
      {
        id: 'sp-seg-4',
        title: 'Propeller & Rudder',
        spokenText:
          'Underneath the stern, curved propeller blades scoop seawater backward like giant underwater fans, and the rudder right behind steers that rushing stream left or right.',
        captionText:
          'Spinning propeller blades accelerate seawater astern while the rudder deflects flow to steer.',
        componentId: 'propeller',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'marine-propulsion',
        seekProgress: 0.82,
      },
    ],
  },

  'robotic-arm': {
    lessonTitle: 'How an Articulated Robotic Arm Picks and Places',
    systemTitle: 'Industrial Robotic Arm & Apple',
    introSummary:
      'See how rotating base, shoulder, elbow, wrist, and parallel gripper work together cleanly in 3D space.',
    difficulty: 'beginner',
    personality: 'friendly',
    segments: [
      {
        id: 'ra-seg-1',
        title: 'Articulated Reach',
        spokenText:
          'Meet our industrial robotic arm! Just like a human arm bolted to a table, each motorized joint pivots in sequence so the tool at the tip can reach any target pad smoothly.',
        captionText:
          'Motorized base, shoulder, elbow, and wrist joints coordinate to position the end-effector cleanly.',
        componentId: 'base',
        cameraAction: 'overview',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'sequence-a-pick-place',
        seekProgress: 0.05,
      },
      {
        id: 'ra-seg-2',
        title: 'Shoulder & Elbow',
        spokenText:
          'Watch the shoulder and elbow swing together to glide the wrist down toward the apple without bumping the workbench—engineers carefully limit joint angles to keep motion safe.',
        captionText:
          'Shoulder and elbow actuators extend the reach smoothly while keeping clear of the worktable.',
        componentId: 'shoulder',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'sequence-a-pick-place',
        seekProgress: 0.2,
      },
      {
        id: 'ra-seg-3',
        title: 'Parallel Jaw Gripper',
        spokenText:
          'At the wrist, two flat parallel fingers squeeze gently around the apple to lift it straight up. Notice we use a dedicated gripper for holding, and swap to a separate cutter blade only for cutting!',
        captionText:
          'The parallel gripper grasps and lifts the apple cleanly; cutting uses a separate dedicated blade tool.',
        componentId: 'gripper',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'sequence-a-pick-place',
        seekProgress: 0.35,
      },
      {
        id: 'ra-seg-4',
        title: '90-Degree Turn & Place',
        spokenText:
          'Once lifted clear, the rotary base turns ninety degrees to swing the apple neatly over the second pad, lowers it gently onto the mark, opens the jaws, and returns home.',
        captionText:
          'The rotary base turns ninety degrees to place the apple cleanly onto the target pad.',
        componentId: 'apple',
        cameraAction: 'focus-component',
        highlightAction: 'highlight',
        animationAction: 'play',
        sequenceId: 'sequence-a-pick-place',
        seekProgress: 0.72,
      },
    ],
  },
};

const DEFAULT_COMPONENT_IDS: Readonly<Record<ShowcaseSceneId, string>> = {
  turbofan: 'fan',
  'inline-six': 'cylinder-block',
  'six-stroke': 'cylinder-block',
  'cordless-drill': 'battery',
  'ship-propulsion': 'hull',
  'robotic-arm': 'base',
};

/**
 * Returns a curated instant lesson ONLY when the request targets a showcase scene
 * with default beginner + friendly style, default focus, and no custom question/highlight/image.
 */
export function getPreparedShowcaseLesson(
  req: Pick<
    TeachLessonRequest,
    | 'sceneKind'
    | 'systemId'
    | 'selectedComponentId'
    | 'difficulty'
    | 'personality'
    | 'question'
    | 'highlightedText'
    | 'screenImageBase64'
    | 'segmentMode'
  >,
): TeachLessonResponse | null {
  if (req.segmentMode === 'first-only') {
    // Still return full curated lesson instantly—zero need to wait on partial!
  }
  const difficulty: ExplanationDifficulty = req.difficulty ?? 'beginner';
  const personality: NarratorPersonality = req.personality ?? 'friendly';
  if (difficulty !== 'beginner' || personality !== 'friendly') {
    return null;
  }
  if (req.question?.trim() || req.highlightedText?.trim() || req.screenImageBase64?.trim()) {
    return null;
  }

  let matchedSceneId: ShowcaseSceneId | null = null;
  if (req.sceneKind in PREPARED_SHOWCASE_LESSONS) {
    matchedSceneId = req.sceneKind as ShowcaseSceneId;
  } else if (req.systemId === 'cordless-drill') {
    matchedSceneId = 'cordless-drill';
  } else if (req.systemId === 'container-ship') {
    matchedSceneId = 'ship-propulsion';
  }

  if (!matchedSceneId) return null;

  // If the student explicitly focused a non-default component (e.g. combustor or piston),
  // allow Gemini to generate a component-tailored lesson unless they are at the default overview part.
  if (
    req.selectedComponentId &&
    req.selectedComponentId !== DEFAULT_COMPONENT_IDS[matchedSceneId]
  ) {
    return null;
  }

  return {
    ...PREPARED_SHOWCASE_LESSONS[matchedSceneId],
    cached: true,
    latencyMs: 0,
  };
}
