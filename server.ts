import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { APP_CONFIG } from './src/config/appConfig.ts';
import {
  getPreparedShowcaseLesson,
  PREPARED_SHOWCASE_LESSONS,
} from './src/data/preparedShowcaseLessons.ts';
import { formatAssetCatalogForPrompt } from './src/three/assetRegistry.ts';
import {
  validateGeminiTutorResponse,
  validateScreenAnalyzeRequest,
  validateScreenAnalyzeResponse,
  validateTutorAskRequest,
} from './src/utils/tutorValidation.ts';
import { inferShowcaseScenePlanFromText } from './src/utils/sceneRouting.ts';
import {
  buildSpeechStyleDirection,
  validateTeachLessonRequest,
  validateTeachLessonResponse,
  validateTeachTtsRequest,
} from './src/utils/voiceLessonValidation.ts';
import type { TeachLessonResponse, TeachTtsResponse } from './src/types/tutor.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const DIAGRAM_DATA_SCHEMA = {
  type: Type.OBJECT,
  description:
    'Optional 2D conceptual diagram when 3D scene generation is infeasible (feasible = false).',
  properties: {
    title: { type: Type.STRING },
    layout: {
      type: Type.STRING,
      description: 'One of: flow, cycle, hierarchy.',
    },
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          label: { type: Type.STRING },
          role: { type: Type.STRING },
          category: {
            type: Type.STRING,
            description: 'One of: primary, secondary, energy.',
          },
        },
        required: ['id', 'label', 'role', 'category'],
      },
    },
    edges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          fromId: { type: Type.STRING },
          toId: { type: Type.STRING },
          label: { type: Type.STRING },
        },
        required: ['fromId', 'toId', 'label'],
      },
    },
  },
  required: ['title', 'layout', 'nodes', 'edges'],
};

const VEC3_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    x: { type: Type.NUMBER },
    y: { type: Type.NUMBER },
    z: { type: Type.NUMBER },
  },
  required: ['x', 'y', 'z'],
};

const VEC2_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    x: { type: Type.NUMBER },
    y: { type: Type.NUMBER },
  },
  required: ['x', 'y'],
};

const GENERATED_SCENE_3D_SCHEMA = {
  type: Type.OBJECT,
  description:
    'Universal procedural 3D scene specification generated whenever visualizationSupported is false (any physical/scientific concept other than the built-in turbofan engine).',
  properties: {
    feasible: {
      type: Type.BOOLEAN,
      description:
        'True for any physical object, machine, mechanism, electrical device, biological structure, molecule, or spatial physics system. False ONLY for purely non-spatial abstract topics (e.g., pure legal text or accounting rules).',
    },
    infeasibilityReason: {
      type: Type.STRING,
      description: 'Clear explanation if feasible is false.',
    },
    systemTitle: { type: Type.STRING },
    category: {
      type: Type.STRING,
      description:
        'e.g., mechanical, electrical, thermodynamic, fluid, biological, chemical, structural.',
    },
    conceptualNote: {
      type: Type.STRING,
      description:
        'Short note stating this is a simplified educational 3D representation with estimated proportions.',
    },
    estimatedScaleLabel: {
      type: Type.STRING,
      description: 'Approximate real-world scale note, e.g. "Conceptual scale · ~10 cm bore".',
    },
    operatingPrinciple: {
      type: Type.STRING,
      description: '1-2 sentence explanation of the motion and physical operating principle.',
    },
    physicalProcesses: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 5 active physical processes (e.g., electromagnetic induction, combustion expansion).',
    },
    components: {
      type: Type.ARRAY,
      description: '4 to 10 distinct interactive 3D components composing the mechanism or system.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          role: { type: Type.STRING },
          parentId: {
            type: Type.STRING,
            description: 'Optional parent component id if attached to a moving assembly.',
          },
          position: VEC3_SCHEMA,
          rotation: {
            type: Type.OBJECT,
            description: 'Euler rotation in radians (x, y, z).',
            properties: {
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              z: { type: Type.NUMBER },
            },
            required: ['x', 'y', 'z'],
          },
          explodeVector: {
            type: Type.OBJECT,
            description: 'Direction & distance to separate cleanly in Exploded view.',
            properties: {
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              z: { type: Type.NUMBER },
            },
            required: ['x', 'y', 'z'],
          },
          dimensionsEstimate: { type: Type.STRING },
          operatingNote: { type: Type.STRING },
          shapes: {
            type: Type.ARRAY,
            description: '1 to 6 geometric sub-parts forming this component.',
            items: {
              type: Type.OBJECT,
              properties: {
                primitive: {
                  type: Type.STRING,
                  description:
                    'One of: box, cylinder, cone, sphere, capsule, torus, ring, extruded-polygon, lathe, tube, helix, gear.',
                },
                offset: VEC3_SCHEMA,
                rotation: VEC3_SCHEMA,
                width: { type: Type.NUMBER },
                height: { type: Type.NUMBER },
                depth: { type: Type.NUMBER },
                radius: { type: Type.NUMBER },
                radiusTop: { type: Type.NUMBER },
                radiusBottom: { type: Type.NUMBER },
                tubeRadius: { type: Type.NUMBER },
                turns: { type: Type.NUMBER },
                teeth: { type: Type.NUMBER },
                profilePoints: {
                  type: Type.ARRAY,
                  items: VEC2_SCHEMA,
                  description:
                    '2D points for extruded-polygon (contour) or lathe ([radius, y] profile around Y axis).',
                },
                pathPoints: {
                  type: Type.ARRAY,
                  items: VEC3_SCHEMA,
                  description: '3D curve points for tube primitive.',
                },
                material: {
                  type: Type.OBJECT,
                  properties: {
                    color: {
                      type: Type.STRING,
                      description: '6-digit hex color like #38BDF8 or #D97706.',
                    },
                    metalness: { type: Type.NUMBER },
                    roughness: { type: Type.NUMBER },
                    opacity: { type: Type.NUMBER },
                    emissive: { type: Type.STRING },
                    emissiveIntensity: { type: Type.NUMBER },
                    wireframe: { type: Type.BOOLEAN },
                  },
                  required: ['color', 'metalness', 'roughness'],
                },
              },
              required: ['primitive', 'offset', 'rotation', 'material'],
            },
          },
          animation: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                description:
                  'One of: none, spin, reciprocate, crank-slider, oscillate-rotation, pulse-scale, orbit.',
              },
              axis: {
                type: Type.STRING,
                description: 'One of: x, y, z.',
              },
              speed: { type: Type.NUMBER },
              amplitude: { type: Type.NUMBER },
              phaseOffset: { type: Type.NUMBER },
              crankRadius: { type: Type.NUMBER },
              rodLength: { type: Type.NUMBER },
              linkageRole: {
                type: Type.STRING,
                description: 'When type is crank-slider, one of: crank, connecting-rod, piston.',
              },
              orbitRadius: { type: Type.NUMBER },
            },
            required: ['type', 'axis', 'speed', 'amplitude', 'phaseOffset'],
          },
        },
        required: ['id', 'name', 'role', 'position', 'rotation', 'shapes', 'animation'],
      },
    },
    connections: {
      type: Type.ARRAY,
      description: 'Directional functional/energy/force links between component ids.',
      items: {
        type: Type.OBJECT,
        properties: {
          fromId: { type: Type.STRING },
          toId: { type: Type.STRING },
          label: { type: Type.STRING },
          kind: {
            type: Type.STRING,
            description: 'One of: mechanical, electrical, fluid, thermal, magnetic, signal.',
          },
          animatedFlow: { type: Type.BOOLEAN },
        },
        required: ['fromId', 'toId', 'label', 'kind'],
      },
    },
  },
  required: [
    'feasible',
    'systemTitle',
    'category',
    'conceptualNote',
    'estimatedScaleLabel',
    'operatingPrinciple',
    'physicalProcesses',
    'components',
    'connections',
  ],
};

const UNIVERSAL_3D_AUTHORING_GUIDANCE = `3D Scene Authoring Rules (for generatedScene3D when visualizationSupported = false):
- Coordinate space: Right-handed Y-up (Y > 0 is up, X is left/right, Z is toward viewer). Keep the entire assembly compactly centered near (0, 0, 0) within [-3.0, 3.0] on each axis.
- Choose rich, accurate multi-part assemblies (4 to 9 components) using contrasting materials:
  * Brushed steel/aluminum: color #94A3B8 or #CBD5E1, metalness 0.85, roughness 0.25
  * Dark cast housing / cutaway casing: color #334155 or #1E293B, metalness 0.55, roughness 0.45, opacity 0.35 (for transparent outer housings/cylinders so internal moving parts remain clearly visible!)
  * Copper windings / coils: color #D97706 or #B45309, metalness 0.88, roughness 0.22 (use "helix" or "torus" primitives!)
  * Thermal / plasma / combustion highlight: color #F97316, emissive #EA580C, emissiveIntensity 0.85
  * Magnetic / electrical accent: color #38BDF8 or #A855F7, emissive #38BDF8, emissiveIntensity 0.5
- Cylinder & Helix default orientation is along the Y axis! Rotate by { x: 0, y: 0, z: Math.PI/2 } (~1.5708 rad) to orient a shaft/rotor/cylinder horizontally along X, or { x: 1.5708, y: 0, z: 0 } to orient along Z.
- Gears and Rings default to the XY plane (axis along Z).
- For reciprocating linkages (e.g., piston-crank / internal combustion cylinder):
  * Give the cylinder block/sleeve opacity ~0.32 so internal motion is visible!
  * Use animation.type = "crank-slider" with matching speed (e.g. 2.8), axis "y", crankRadius (e.g. 0.45), rodLength (e.g. 1.35):
    - Crankshaft / crank web positioned around y = -1.1 with linkageRole = "crank" (include an offset crank-pin cylinder shape so rotation is unmistakably legible!)
    - Connecting rod positioned around y = -0.35 with linkageRole = "connecting-rod"
    - Piston crown positioned around y = 0.45 with linkageRole = "piston" (use "lathe" or "cylinder" + piston rings!)
- For rotating electric motors / turbines / fans / gearboxes:
  * Give the outer stator/housing opacity ~0.35 or open ring cutaway so the internal copper coils, stator poles, armature core, commutator, and spinning rotor shaft ("spin" along the shaft axis) are cleanly visible inside!
- Always populate explodeVector on each component so clicking Explode separates the assembly cleanly without overlap, and populate connections[] with meaningful mechanical/electrical/magnetic/thermal/fluid links.`;

const SCENE_ACTION_PLAN_SCHEMA = {
  type: Type.OBJECT,
  description:
    'Optional validated action plan routing the 3D stage to one of the showcase demonstrations and safe parameters.',
  properties: {
    sceneId: {
      type: Type.STRING,
      description:
        'One of: "turbofan", "inline-six", "six-stroke", "cordless-drill", "ship-propulsion", "robotic-arm".',
    },
    componentId: {
      type: Type.STRING,
      description: 'Valid component ID in that scene (e.g., "cylinder-4", "piston", "crankshaft", "gearbox", "propeller", "gripper", "cutter", "combustor").',
    },
    sequenceId: {
      type: Type.STRING,
      description: 'Optional sequence ID (e.g., "sequence-a-pick-place", "sequence-b-cut", "four-stroke-cycle", "crank-slider-cycle", "powertrain-chain", "marine-propulsion", "propulsion-tour").',
    },
    seekProgress: { type: Type.NUMBER },
    viewMode: {
      type: Type.STRING,
      description: 'One of: "full", "cutaway", "internal", "airflow", "thermal".',
    },
    isolate: { type: Type.BOOLEAN },
    play: { type: Type.BOOLEAN },
    focusedCylinder: {
      type: Type.INTEGER,
      description: 'For inline-six only: integer 1 through 6.',
    },
    crankAngleDeg: {
      type: Type.NUMBER,
      description: 'For inline-six or six-stroke only: 0 through 720 (or 1080) degrees.',
    },
    sixStrokeVariant: {
      type: Type.STRING,
      description:
        'For six-stroke only: "reference-mechanical" (DEFAULT when title/variant is not specified), "crower-water-steam", or "beare-secondary-piston".',
    },
    baseTurnDeg: {
      type: Type.NUMBER,
      description: 'For robotic-arm only: -180 through 180 degrees (90 for 90-degree turn).',
    },
    unsupportedRequestNotice: {
      type: Type.STRING,
      description: 'Honest notice if the user requested an unsupported action (e.g., cutting with a gripper or unmodeled CFD).',
    },
  },
  required: ['sceneId'],
};

const ASSET_RETRIEVAL_PLAN_SCHEMA = {
  type: Type.OBJECT,
  description:
    'Asset-first retrieval and multi-level exploration routing BEFORE generating procedural primitives.',
  properties: {
    matchedAssetId: {
      type: Type.STRING,
      description:
        'ID from the Approved 3D Asset Catalog (e.g. "container-ship", "cordless-drill", "family-sedan", "turbofan-engine", or a user-uploaded GLB ID), or "none" if no approved asset matches.',
    },
    requestedLevel: {
      type: Type.STRING,
      description:
        'One of: "full-object" (complete machine), "internal-structure" (cutaway/interior layout), or "component-detail" (focused part or subsystem).',
    },
    focusPartId: {
      type: Type.STRING,
      description:
        'Optional known part ID inside the matched asset to highlight and zoom to (e.g. "propeller", "rudder", "hull", "superstructure", "chuck", "bonnet", "wheel_FL").',
    },
    openIllustrativeSubsystemId: {
      type: Type.STRING,
      description:
        'Optional illustrative subsystem ID when the student asks to inspect unmodeled internal machinery of an exterior GLB asset (e.g. "marine-diesel-engine", "drill-motor-drivetrain", "sedan-ic-powertrain").',
    },
    conceptualOnlyNotice: {
      type: Type.STRING,
      description:
        'Honest disclaimer whenever an illustrative overlay/subsystem or procedural approximation is used because the real GLB lacks modeled internals.',
    },
  },
  required: ['matchedAssetId', 'requestedLevel'],
};

const SHOWCASE_ROUTING_GUIDE = `SHOWCASE DEMONSTRATIONS (Prioritize setting sceneActionPlan when a student asks about any of these systems):
1. sceneId="turbofan" (Jet Propulsion Turbofan Engine): components [intake, fan, lp-compressor, hp-compressor, combustor, turbine, nozzle, bypass-duct]; sequence "propulsion-tour".
2. sceneId="inline-six" (Inline-Six Car Engine, configured firing order 1-5-3-6-2-4, camshaft at 0.5x crank speed): components [cylinder-block, cylinder-1..cylinder-6, crankshaft, camshaft, intake-manifold, exhaust-manifold]; sequences ["four-stroke-cycle", "crank-cam-sync"]. When student asks "Explain cylinder four", set sceneId="inline-six", focusedCylinder=4, componentId="cylinder-4", viewMode="cutaway".
3. sceneId="six-stroke" (Single-Cylinder Engine Cutaway / Six-Stroke Reference): components [cylinder-block, cylinder-head, piston, connecting-rod, crankshaft, valves-camtrain, intake-exhaust, water-injector]; sequence "crank-slider-cycle". TRUTHFULNESS RULE: If the student only mentions "Six Stroke Engine" without identifying a specific patent variant (Crower water-steam vs Beare secondary piston), set sixStrokeVariant="reference-mechanical" and note honestly in unsupportedRequestNotice or explanation that generic "Six Stroke Engine" text alone does not identify a variant so the cutaway shows a verified slider-crank mechanical baseline unless Crower Water-Steam or Secondary Scavenge is selected.
4. sceneId="cordless-drill" (Cordless Drill & 4:1 Planetary Drivetrain): components [housing, trigger, battery, motor, gearbox, output-shaft, chuck]; sequence "powertrain-chain", viewMode="internal".
5. sceneId="ship-propulsion" (Container Ship & Marine Propulsion): components [hull, superstructure, engine, coupling, propeller-shaft, propeller, rudder, water-thrust]; sequence "marine-propulsion", viewMode="cutaway".
6. sceneId="robotic-arm" (Robotic Arm & Apple): components [worktable, base, shoulder, upper-arm, elbow, forearm, wrist, gripper, cutter, apple]; sequences:
   - "sequence-a-pick-place" (Pick, Turn 90 deg, Place using parallel gripper; set baseTurnDeg=90 unless another angle is specified)
   - "sequence-b-cut" (Conceptual Apple Cutting using dedicated cutter blade tool — never claim the parallel gripper cuts; if asked to cut with gripper, set unsupportedRequestNotice explaining tool swap).`;

const SYSTEM_INSTRUCTION = `You are an expert educational tutor inside Visual Learning Studio.
A student has highlighted text, selected a concept, or asked a question (such as "Visualize this in 3D").

Respond ONLY with structured JSON matching the response schema.

${SHOWCASE_ROUTING_GUIDE}

Built-in high-detail 3D Turbofan Engine components:
- "intake", "fan", "lp-compressor", "hp-compressor", "combustor", "turbine", "nozzle", "bypass-duct"
- Use "none" whenever the topic is NOT one of those 8 jet propulsion turbofan components.

RETRIEVAL BEFORE GENERATION (CRITICAL RULE):
Before generating procedural primitives in generatedScene3D, ALWAYS inspect the Showcase Demonstrations and Approved 3D Asset Catalog provided in the prompt!
1. If the topic matches ANY of the Showcase Demonstrations ("turbofan", "inline-six", "six-stroke", "cordless-drill", "ship-propulsion", "robotic-arm"):
   - Populate sceneActionPlan with the matching sceneId, componentId, sequenceId, viewMode, and parameters (such as focusedCylinder, sixStrokeVariant, or baseTurnDeg).
   - If it is the Turbofan engine, also set visualizationSupported=true and supportedVisualizationComponent to the matching stage.
   - If it is container-ship or cordless-drill, also populate assetRetrievalPlan.matchedAssetId ("container-ship" or "cordless-drill").
   - Do NOT invent rough boxes in generatedScene3D when a Showcase Demonstration or GLB asset matches.
2. If the topic asks about another catalog asset (e.g., "family-sedan" or a user-uploaded GLB):
   - Populate assetRetrievalPlan with matchedAssetId and requestedLevel.
3. ONLY when no Showcase Demonstration and no Approved Asset matches:
   - Generate a rich, interactive conceptual 3D scene in generatedScene3D with feasible = true (and honestly note in conceptualNote that it is a simplified conceptual approximation).
   ${UNIVERSAL_3D_AUTHORING_GUIDANCE}
4. Only set generatedScene3D.feasible = false if the topic is purely abstract/non-spatial where a 3D model would mislead, explain why in infeasibilityReason, and provide a 2D diagramData fallback.
5. Keep explanation clear, accurate, educational, and concise (2-4 paragraphs).`;

const SCREEN_SYSTEM_INSTRUCTION = `You are an expert multimodal visual tutor inside Visual Learning Studio.
A student has captured a region from their screen OR uploaded an image (diagram, textbook page, photo, simulation, schematic) and asked a question about it.

Analyze the image and question carefully, and respond ONLY with structured JSON matching the response schema.

${SHOWCASE_ROUTING_GUIDE}

Built-in high-detail 3D Turbofan Engine components:
- "intake", "fan", "lp-compressor", "hp-compressor", "combustor", "turbine", "nozzle", "bypass-duct"
- Use "none" whenever the image does NOT depict a turbofan/jet propulsion engine.

RETRIEVAL BEFORE GENERATION (CRITICAL RULE):
1. ONLY if the image depicts a turbofan / jet engine or one of its 8 stages, set visualizationSupported = true, supportedVisualizationComponent to the best-matching ID, and sceneActionPlan = { sceneId: "turbofan", componentId: <stage> }. Never misclassify a car piston engine, single-cylinder six-stroke cutaway, ship, robotic arm, or electric drill as a jet engine!
2. If the image or question depicts any of the other Showcase Demonstrations ("inline-six", "six-stroke", "cordless-drill", "ship-propulsion", "robotic-arm") or catalog GLBs ("family-sedan", uploaded GLB), populate sceneActionPlan and/or assetRetrievalPlan rather than replacing them with generatedScene3D boxes.
3. For ALL OTHER physical objects, mechanisms, diagrams, or scientific systems where no showcase or asset matches:
   - Set visualizationSupported = false, supportedVisualizationComponent = "none", and assetRetrievalPlan = { matchedAssetId: "none", requestedLevel: "full-object" }.
   - Generate a complete, interactive conceptual 3D scene in generatedScene3D with feasible = true!
   ${UNIVERSAL_3D_AUTHORING_GUIDANCE}
4. Only set generatedScene3D.feasible = false for purely non-spatial text/tables/equations where 3D geometry cannot represent the concept meaningfully, explain why in infeasibilityReason, and populate diagramData for a 2D schematic fallback.
5. Always report scientificPrinciples, confidenceLevel ("high" | "medium" | "low"), uncertaintyNote, and clear educational explanation.`;

function createGeminiClient(apiVersion?: string): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    const rawAppUrl = process.env.APP_URL?.trim();
    const appUrl =
      rawAppUrl && rawAppUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(rawAppUrl)
        ? rawAppUrl
        : null;

    res.json({
      status: 'ok',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      appUrl,
    });
  });

  app.post('/api/tutor/ask', async (req, res) => {
    const validation = validateTutorAskRequest(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const {
      question,
      highlightedText,
      pageContext,
      documentTitle,
      pageNumber,
      activeModuleLabel,
      activeStageName,
      activeAssetId,
      activeExplorationLevel,
      uploadedAssets,
      activeGeneratedSystemTitle,
      selectedGeneratedComponentName,
    } = validation.value;

    const contextSections: string[] = [];
    contextSections.push(
      `Approved 3D Asset Catalog (Check BEFORE generating primitives):\n${formatAssetCatalogForPrompt(uploadedAssets)}`,
    );

    if (documentTitle) {
      contextSections.push(
        `Document: ${documentTitle}${pageNumber ? ` (Page ${pageNumber})` : ''}`,
      );
    } else if (activeModuleLabel) {
      contextSections.push(
        `Built-in Study Module: ${activeModuleLabel}${pageNumber ? ` (Page ${pageNumber})` : ''}`,
      );
    }

    if (activeAssetId) {
      contextSections.push(
        `Currently Loaded 3D Asset: ${activeAssetId}${activeExplorationLevel ? ` (Exploration Level: ${activeExplorationLevel})` : ''}`,
      );
    }

    if (activeGeneratedSystemTitle) {
      contextSections.push(
        `Currently Active Generated/Subsystem 3D Scene: ${activeGeneratedSystemTitle}`,
      );
      if (selectedGeneratedComponentName) {
        contextSections.push(
          `Currently Selected 3D Component: ${selectedGeneratedComponentName}`,
        );
      }
    } else if (activeStageName) {
      contextSections.push(`Currently Selected Stage/Part: ${activeStageName}`);
    }

    if (highlightedText) {
      contextSections.push(`Highlighted Excerpt:\n"""\n${highlightedText}\n"""`);
    }

    if (pageContext) {
      contextSections.push(`Surrounding Page Context:\n"""\n${pageContext}\n"""`);
    }

    contextSections.push(`Student Question:\n${question}`);

    try {
      const response = await ai.models.generateContent({
        model: APP_CONFIG.aiTutorConfig.defaultModel,
        contents: contextSections.join('\n\n'),
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mainConcept: {
                type: Type.STRING,
                description: 'Concise title of the core concept being explained.',
              },
              studentQuestionSummary: {
                type: Type.STRING,
                description: 'One-sentence summary of what the student is asking.',
              },
              componentsAndRelationships: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '2 to 5 short bullet points naming key components and how they interact.',
              },
              recommendedVisualization: {
                type: Type.STRING,
                description:
                  'Short description of what visual model or animation best explains this concept.',
              },
              explanation: {
                type: Type.STRING,
                description:
                  'Clear, accurate educational explanation tailored to the student question and context.',
              },
              supportedVisualizationComponent: {
                type: Type.STRING,
                description:
                  'One of: intake, fan, lp-compressor, hp-compressor, combustor, turbine, nozzle, bypass-duct, none.',
              },
              visualizationSupported: {
                type: Type.BOOLEAN,
                description:
                  'True only if one of the 8 built-in jet engine components directly matches the topic; false for all other mechanisms/concepts.',
              },
              recommendedLayerMode: {
                type: Type.STRING,
                description: 'One of: cutaway, airflow, thermal.',
              },
              assetRetrievalPlan: ASSET_RETRIEVAL_PLAN_SCHEMA,
              sceneActionPlan: SCENE_ACTION_PLAN_SCHEMA,
              generatedScene3D: GENERATED_SCENE_3D_SCHEMA,
              diagramData: DIAGRAM_DATA_SCHEMA,
            },
            required: [
              'mainConcept',
              'studentQuestionSummary',
              'componentsAndRelationships',
              'recommendedVisualization',
              'explanation',
              'supportedVisualizationComponent',
              'visualizationSupported',
              'recommendedLayerMode',
            ],
          },
        },
      });

      const validatedOutput = validateGeminiTutorResponse(response.text ?? '');
      if (!validatedOutput.ok) {
        res.status(502).json({
          error: `Unable to validate Gemini structured output: ${validatedOutput.error}`,
        });
        return;
      }

      const value = validatedOutput.value;
      if (!value.sceneActionPlan) {
        const inferred = inferShowcaseScenePlanFromText(
          `${question} ${highlightedText ?? ''}`,
        );
        if (inferred) {
          value.sceneActionPlan = inferred;
        }
      }

      res.json(value);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected Gemini API failure.';
      console.error('Gemini tutor request failed:', message);
      res.status(502).json({
        error: `Gemini tutor request failed: ${message}`,
      });
    }
  });

  app.post('/api/tutor/screen', async (req, res) => {
    const validation = validateScreenAnalyzeRequest(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const {
      question,
      imageBase64,
      mimeType,
      activeStageName,
      activeAssetId,
      activeExplorationLevel,
      uploadedAssets,
      previousConcept,
      selectedGeneratedComponentName,
    } = validation.value;

    const textParts: string[] = [];
    textParts.push(
      `Approved 3D Asset Catalog (Check BEFORE generating primitives):\n${formatAssetCatalogForPrompt(uploadedAssets)}`,
    );
    if (previousConcept) {
      textParts.push(`Prior Identified Concept (for follow-up continuity): ${previousConcept}`);
    }
    if (activeAssetId) {
      textParts.push(
        `Currently Loaded 3D Asset: ${activeAssetId}${activeExplorationLevel ? ` (Exploration Level: ${activeExplorationLevel})` : ''}`,
      );
    }
    if (selectedGeneratedComponentName) {
      textParts.push(`Currently Selected 3D Component: ${selectedGeneratedComponentName}`);
    } else if (activeStageName) {
      textParts.push(`Currently Active 3D Stage/Part in Studio: ${activeStageName}`);
    }
    textParts.push(`Student Question about the captured screen region or uploaded image:\n${question}`);

    try {
      const response = await ai.models.generateContent({
        model: APP_CONFIG.aiTutorConfig.defaultModel,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            {
              text: textParts.join('\n\n'),
            },
          ],
        },
        config: {
          systemInstruction: SCREEN_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mainConcept: {
                type: Type.STRING,
                description: 'Object or concept identified in the captured image.',
              },
              studentQuestionSummary: {
                type: Type.STRING,
                description: 'One-sentence summary of what the student is asking.',
              },
              componentsAndRelationships: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '2 to 5 concise points describing key components and how they interact.',
              },
              scientificPrinciples: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 to 4 relevant scientific or engineering principles.',
              },
              recommendedVisualization: {
                type: Type.STRING,
                description:
                  'Recommended interactive 3D or 2D visualization to explain the captured subject.',
              },
              explanation: {
                type: Type.STRING,
                description:
                  'Clear, educational explanation answering the student question from the image.',
              },
              supportedVisualizationComponent: {
                type: Type.STRING,
                description:
                  'One of: intake, fan, lp-compressor, hp-compressor, combustor, turbine, nozzle, bypass-duct, none.',
              },
              visualizationSupported: {
                type: Type.BOOLEAN,
                description:
                  'True ONLY if the image depicts a turbofan engine or one of its 8 supported components; false for all other objects.',
              },
              recommendedLayerMode: {
                type: Type.STRING,
                description: 'One of: cutaway, airflow, thermal.',
              },
              confidenceLevel: {
                type: Type.STRING,
                description: 'One of: high, medium, low.',
              },
              uncertaintyNote: {
                type: Type.STRING,
                description:
                  'Short note stating confidence basis or any visual ambiguity/cropped context.',
              },
              assetRetrievalPlan: ASSET_RETRIEVAL_PLAN_SCHEMA,
              sceneActionPlan: SCENE_ACTION_PLAN_SCHEMA,
              generatedScene3D: GENERATED_SCENE_3D_SCHEMA,
              diagramData: DIAGRAM_DATA_SCHEMA,
            },
            required: [
              'mainConcept',
              'studentQuestionSummary',
              'componentsAndRelationships',
              'scientificPrinciples',
              'recommendedVisualization',
              'explanation',
              'supportedVisualizationComponent',
              'visualizationSupported',
              'recommendedLayerMode',
              'confidenceLevel',
              'uncertaintyNote',
            ],
          },
        },
      });

      const validatedOutput = validateScreenAnalyzeResponse(response.text ?? '');
      if (!validatedOutput.ok) {
        res.status(502).json({
          error: `Unable to validate Gemini multimodal output: ${validatedOutput.error}`,
        });
        return;
      }

      const value = validatedOutput.value;
      if (!value.sceneActionPlan) {
        const inferred = inferShowcaseScenePlanFromText(
          `${question} ${value.mainConcept}`,
        );
        if (inferred) {
          value.sceneActionPlan = inferred;
        }
      }

      res.json(value);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected Gemini multimodal failure.';
      console.error('Gemini screen analysis failed:', message);
      res.status(502).json({
        error: `Gemini screen analysis failed: ${message}`,
      });
    }
  });

  const teachLessonCache = new Map<string, TeachLessonResponse>();
  const teachInFlightMap = new Map<string, Promise<TeachLessonResponse>>();
  const MAX_LESSON_CACHE_ENTRIES = 48;

  const ttsAudioCache = new Map<string, TeachTtsResponse>();
  const ttsInFlightMap = new Map<string, Promise<TeachTtsResponse>>();
  const MAX_TTS_CACHE_ENTRIES = 64;

  function setBoundedCache<T>(map: Map<string, T>, key: string, value: T, maxSize: number) {
    if (map.has(key)) {
      map.delete(key);
    }
    map.set(key, value);
    while (map.size > maxSize) {
      const oldestKey = map.keys().next().value;
      if (!oldestKey) break;
      map.delete(oldestKey);
    }
  }

  async function synthesizeGeminiTtsWithCache(params: {
    text: string;
    voiceName: TeachTtsResponse['voiceName'];
    personality: typeof APP_CONFIG.voiceTutorConfig.defaultPersonality;
    difficulty: typeof APP_CONFIG.voiceTutorConfig.defaultDifficulty;
  }): Promise<{ payload: TeachTtsResponse; cached: boolean }> {
    const cacheKey = `${params.voiceName}::${params.personality}::${params.difficulty}::${params.text}`;
    const existing = ttsAudioCache.get(cacheKey);
    if (existing) {
      // Refresh LRU position
      setBoundedCache(ttsAudioCache, cacheKey, existing, MAX_TTS_CACHE_ENTRIES);
      return { payload: existing, cached: true };
    }

    const inFlight = ttsInFlightMap.get(cacheKey);
    if (inFlight) {
      const payload = await inFlight;
      return { payload, cached: true };
    }

    const ai = createGeminiClient('v1alpha');
    if (!ai) {
      throw new Error(
        'Gemini API key is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets.',
      );
    }

    const style = buildSpeechStyleDirection(params.personality, params.difficulty);
    const workPromise = (async (): Promise<TeachTtsResponse> => {
      const response = await ai.models.generateContent({
        model: APP_CONFIG.voiceTutorConfig.ttsModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: params.text,
                speechMetadata: { style },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: params.voiceName },
            },
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const audioPart = parts.find((p) => p.inlineData?.data);
      const audioBase64 = audioPart?.inlineData?.data;
      const mimeType = audioPart?.inlineData?.mimeType || 'audio/wav';

      if (!audioBase64) {
        throw new Error('Gemini TTS did not return playable audio for this segment.');
      }

      const result: TeachTtsResponse = {
        audioBase64,
        mimeType,
        voiceName: params.voiceName,
      };
      setBoundedCache(ttsAudioCache, cacheKey, result, MAX_TTS_CACHE_ENTRIES);
      return result;
    })();

    ttsInFlightMap.set(cacheKey, workPromise);
    try {
      const payload = await workPromise;
      return { payload, cached: false };
    } finally {
      ttsInFlightMap.delete(cacheKey);
    }
  }

  app.post('/api/tutor/teach', async (req, res) => {
    const t0 = performance.now();
    const validation = validateTeachLessonRequest(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const reqVal = validation.value;
    const prepared = getPreparedShowcaseLesson(reqVal);
    if (prepared) {
      const latencyMs = Math.round(performance.now() - t0);
      console.log(`[teach] prepared showcase hit (${reqVal.sceneKind}) in ${latencyMs}ms`);
      res.json({ ...prepared, cached: true, latencyMs });
      return;
    }

    const {
      sceneKind,
      systemId,
      systemTitle,
      systemDescription,
      components,
      selectedComponentId,
      difficulty,
      personality,
      question,
      highlightedText,
      pageContext,
      documentTitle,
      pageNumber,
      screenImageBase64,
      screenImageMimeType,
      segmentMode,
    } = reqVal;

    const imageSignature = screenImageBase64
      ? `${screenImageBase64.length}:${screenImageBase64.slice(0, 32)}:${screenImageBase64.slice(-32)}`
      : '';
    const teachCacheKey = JSON.stringify({
      sceneKind,
      systemId,
      systemTitle,
      selectedComponentId: selectedComponentId ?? '',
      difficulty,
      personality,
      segmentMode,
      question: question ?? '',
      highlightedText: highlightedText ?? '',
      pageNumber: pageNumber ?? 0,
      imageSignature,
    });

    const cachedLesson = teachLessonCache.get(teachCacheKey);
    if (cachedLesson) {
      setBoundedCache(teachLessonCache, teachCacheKey, cachedLesson, MAX_LESSON_CACHE_ENTRIES);
      const latencyMs = Math.round(performance.now() - t0);
      console.log(`[teach] cache hit (${sceneKind}/${segmentMode}) in ${latencyMs}ms`);
      res.json({ ...cachedLesson, cached: true, latencyMs });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const difficultyGuide: Record<typeof difficulty, string> = {
      beginner:
        'BEGINNER LEVEL: Use everyday words, familiar real-world analogies (like fans, bike pumps, stoves, or water hoses), and ZERO unexplained technical jargon. Keep every idea intuitive for a first-time learner.',
      simple:
        'SIMPLE LEVEL: Use clear plain language and introduce basic technical vocabulary gently alongside immediate everyday definitions.',
      intermediate:
        'INTERMEDIATE LEVEL: Explain the underlying physical mechanisms, forces, energy conversions, and cause-and-effect principles clearly.',
      advanced:
        'ADVANCED LEVEL: Deliver detailed technical and engineering explanations using accurate scientific terminology, system trade-offs, and physical principles specific to this model.',
    };

    const personalityGuide: Record<typeof personality, string> = {
      friendly:
        'FRIENDLY PERSONALITY: Warm, encouraging, conversational mentor voice that makes learning inviting.',
      professional:
        'PROFESSIONAL PERSONALITY: Clear, structured, composed, and precise technical educator voice.',
      'gen-z':
        'GEN Z PERSONALITY: Energetic, relatable, occasionally playful phrasing (light and natural, never excessive or distracting) while keeping 100% of the scientific facts completely accurate.',
    };

    const allowedAnimGuide =
      sceneKind === 'turbofan'
        ? 'play, pause, explode, assemble, layer-cutaway, layer-airflow, layer-thermal'
        : sceneKind === 'glb-asset' ||
            sceneKind === 'inline-six' ||
            sceneKind === 'six-stroke' ||
            sceneKind === 'cordless-drill' ||
            sceneKind === 'ship-propulsion'
          ? 'play, pause, explode, assemble, layer-cutaway'
          : 'play, pause, explode, assemble';

    const componentCatalogText = components
      .map(
        (c) =>
          `- componentId="${c.id}" | name="${c.name}"${c.role ? ` | role="${c.role}"` : ''}`,
      )
      .join('\n');

    const isFirstOnly = segmentMode === 'first-only';
    const segmentStructureRule = isFirstOnly
      ? `4. FAST OPENING SEGMENT (1 TO 2 SEGMENTS ONLY):
   - Produce ONLY 1 concise opening spoken segment (or 2 short segments max) so audio starts immediately.
   - spokenText MUST be 2 short, punchy natural spoken sentences (20–38 words) for text-to-speech: NO markdown, NO asterisks, NO bullets, NO raw equations.
   - Start with cameraAction="${selectedComponentId ? 'focus-component' : 'overview'}" targeting "${selectedComponentId ?? components[0]?.id}".`
      : `4. LESSON STRUCTURE (4 TO 6 SEGMENTS):
   - Produce between ${APP_CONFIG.voiceTutorConfig.minSegments} and ${APP_CONFIG.voiceTutorConfig.maxSegments} short, well-paced spoken segments.
   - Each segment's spokenText should be 2–3 natural spoken sentences (roughly 25–45 words) written for text-to-speech: NO markdown, NO asterisks, NO bullet symbols, NO raw equations with symbols—spell out quantities naturally in words.`;

    const teachSystemInstruction = `You are the AI Voice Tutor inside Visual Learning Studio.
Generate a guided, spoken 3D-synchronized audio lesson for the CURRENTLY DISPLAYED 3D model.

Respond ONLY with structured JSON matching the response schema.

CRITICAL RULES:
1. MODEL GROUNDING: Teach ONLY about the active 3D model ("${systemTitle}", id="${systemId}", kind="${sceneKind}").
   - Every segment's componentId MUST be chosen verbatim from the AVAILABLE COMPONENTS list below.
   - NEVER reference turbofan parts unless the active model IS the turbofan engine.
2. DIFFICULTY ADAPTATION (STRICT):
   ${difficultyGuide[difficulty]}
3. NARRATOR PERSONALITY (INDEPENDENT OF DIFFICULTY):
   ${personalityGuide[personality]}
${segmentStructureRule}
   - captionText should match the spoken explanation cleanly for on-screen reading.
   - Choose animationAction from: ${allowedAnimGuide}.
   - Optional timeline sync: for sequential machines (robotic arm pick-turn-90-place or cutting, inline-six 720-degree cycle, six-stroke cutaway, drill drivetrain, ship propulsion, turbofan station tour), you may set seekProgress between 0.0 and 1.0 to align the 3D phase with each spoken step.`;

    const promptSections: string[] = [
      `Active 3D Model: ${systemTitle} (sceneKind=${sceneKind})`,
    ];
    if (systemDescription) {
      promptSections.push(`Model Summary: ${systemDescription}`);
    }
    promptSections.push(`AVAILABLE COMPONENTS (use exact componentId):\n${componentCatalogText}`);

    if (selectedComponentId) {
      const sel = components.find((c) => c.id === selectedComponentId);
      promptSections.push(
        `Currently Selected Component: ${sel ? `${sel.name} (id="${sel.id}")` : selectedComponentId}`,
      );
    }
    if (documentTitle) {
      promptSections.push(
        `Active Document: ${documentTitle}${pageNumber ? ` (Page ${pageNumber})` : ''}`,
      );
    }
    if (highlightedText) {
      promptSections.push(`Highlighted PDF Excerpt:\n"""\n${highlightedText}\n"""`);
    }
    if (pageContext) {
      promptSections.push(`Surrounding Study Context:\n"""\n${pageContext}\n"""`);
    }
    if (question) {
      promptSections.push(`Student's Focus Question:\n${question}`);
    } else {
      promptSections.push(
        'Student Request: Click "Teach Me" — give a clear guided 3D walkthrough of how this system works.',
      );
    }

    const promptText = promptSections.join('\n\n');
    const contentsPayload =
      screenImageBase64 && screenImageMimeType
        ? {
            parts: [
              {
                inlineData: {
                  mimeType: screenImageMimeType,
                  data: screenImageBase64,
                },
              },
              { text: promptText },
            ],
          }
        : promptText;

    try {
      let workPromise = teachInFlightMap.get(teachCacheKey);
      if (!workPromise) {
        workPromise = (async (): Promise<TeachLessonResponse> => {
          const response = await ai.models.generateContent({
            model: APP_CONFIG.aiTutorConfig.defaultModel,
            contents: contentsPayload,
            config: {
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.LOW,
              },
              systemInstruction: teachSystemInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  lessonTitle: {
                    type: Type.STRING,
                    description: 'Concise, engaging title for this guided voice lesson.',
                  },
                  systemTitle: {
                    type: Type.STRING,
                    description: 'Name of the 3D system being taught.',
                  },
                  introSummary: {
                    type: Type.STRING,
                    description: 'One-sentence overview of what the lesson covers.',
                  },
                  segments: {
                    type: Type.ARRAY,
                    description: isFirstOnly
                      ? '1 or 2 fast opening spoken narration segments.'
                      : '4 to 6 synchronized spoken narration segments.',
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        title: {
                          type: Type.STRING,
                          description: 'Short 2–5 word label for this segment step.',
                        },
                        spokenText: {
                          type: Type.STRING,
                          description:
                            '2–3 natural sentences written for spoken audio narration (no markdown or raw math symbols).',
                        },
                        captionText: {
                          type: Type.STRING,
                          description: 'Clean readable caption text matching the spoken narration.',
                        },
                        componentId: {
                          type: Type.STRING,
                          description: 'Exact componentId from AVAILABLE COMPONENTS.',
                        },
                        cameraAction: {
                          type: Type.STRING,
                          description: 'Either "overview" or "focus-component".',
                        },
                        highlightAction: {
                          type: Type.STRING,
                          description: 'One of: "none", "highlight", "isolate".',
                        },
                        animationAction: {
                          type: Type.STRING,
                          description: `One of: ${allowedAnimGuide}.`,
                        },
                        sequenceId: {
                          type: Type.STRING,
                          description: 'Optional sequence ID if the model supports multiple sequences.',
                        },
                        seekProgress: {
                          type: Type.NUMBER,
                          description: 'Optional normalized sequence progress between 0.0 and 1.0 for this step.',
                        },
                      },
                      required: [
                        'id',
                        'title',
                        'spokenText',
                        'captionText',
                        'componentId',
                        'cameraAction',
                        'highlightAction',
                        'animationAction',
                      ],
                    },
                  },
                },
                required: ['lessonTitle', 'systemTitle', 'introSummary', 'segments'],
              },
            },
          });

          const validatedOutput = validateTeachLessonResponse(
            response.text ?? '',
            components,
            difficulty,
            personality,
            systemTitle,
            isFirstOnly ? 1 : APP_CONFIG.voiceTutorConfig.minSegments,
          );
          if (!validatedOutput.ok) {
            throw new Error(`Unable to validate Gemini voice lesson: ${validatedOutput.error}`);
          }

          const finalLesson: TeachLessonResponse = {
            ...validatedOutput.value,
            isPartialFirstSegment: isFirstOnly,
          };
          setBoundedCache(teachLessonCache, teachCacheKey, finalLesson, MAX_LESSON_CACHE_ENTRIES);
          return finalLesson;
        })();

        teachInFlightMap.set(teachCacheKey, workPromise);
      }

      const lesson = await workPromise;
      const latencyMs = Math.round(performance.now() - t0);
      console.log(
        `[teach] generated (${sceneKind}/${segmentMode}, ${lesson.segments.length} segs) in ${latencyMs}ms`,
      );
      res.json({ ...lesson, cached: false, latencyMs });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected Gemini API failure.';
      console.error('Gemini teach lesson request failed:', message);
      res.status(502).json({
        error: `Gemini voice lesson request failed: ${message}`,
      });
    } finally {
      teachInFlightMap.delete(teachCacheKey);
    }
  });

  app.post('/api/tutor/tts', async (req, res) => {
    const t0 = performance.now();
    const validation = validateTeachTtsRequest(req.body);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    if (!process.env.GEMINI_API_KEY?.trim()) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    try {
      const { payload, cached } = await synthesizeGeminiTtsWithCache(validation.value);
      const latencyMs = Math.round(performance.now() - t0);
      console.log(
        `[tts] ${cached ? 'cache hit' : 'synthesized'} (${payload.voiceName}, ${validation.value.text.length} chars) in ${latencyMs}ms`,
      );
      res.json({ ...payload, cached, latencyMs });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unexpected Gemini TTS failure.';
      console.error('Gemini TTS synthesis failed:', message);
      const isRateLimited =
        message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
      res.status(isRateLimited ? 429 : 502).json({
        error: isRateLimited
          ? 'Audio synthesis is temporarily busy (rate limit). Click Retry Audio to continue.'
          : `Gemini audio synthesis failed: ${message}`,
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Visual Learning Studio server listening on http://0.0.0.0:${PORT}`);

    // Non-blocking background warm-up of Segment 1 Gemini Neural TTS audio for showcase demos
    if (process.env.GEMINI_API_KEY?.trim()) {
      void (async () => {
        const tWarm = performance.now();
        const queue = Object.values(PREPARED_SHOWCASE_LESSONS)
          .map((lesson) => lesson.segments[0]?.spokenText)
          .filter((text): text is string => Boolean(text));
        const concurrency = 2;
        let idx = 0;
        const worker = async () => {
          while (idx < queue.length) {
            const current = queue[idx++];
            try {
              await synthesizeGeminiTtsWithCache({
                text: current,
                voiceName: APP_CONFIG.voiceTutorConfig.defaultVoiceName,
                personality: APP_CONFIG.voiceTutorConfig.defaultPersonality,
                difficulty: APP_CONFIG.voiceTutorConfig.defaultDifficulty,
              });
            } catch {
              // Silent background warm-up guard
            }
          }
        };
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
        console.log(
          `[tts-warmup] Pre-warmed ${ttsAudioCache.size}/${queue.length} showcase Segment 1 clips in ${Math.round(performance.now() - tWarm)}ms`,
        );
      })();
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
