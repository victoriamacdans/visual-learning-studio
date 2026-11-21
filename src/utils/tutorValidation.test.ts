import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSurroundingPageContext,
  normalizeVisualizationComponent,
  validateGeminiTutorResponse,
  validateScreenAnalyzeRequest,
  validateScreenAnalyzeResponse,
  validateTutorAskRequest,
} from './tutorValidation.ts';

test('validateTutorAskRequest rejects empty questions and trims valid requests', () => {
  const invalid = validateTutorAskRequest({ question: '   ' });
  assert.equal(invalid.ok, false);

  const valid = validateTutorAskRequest({
    question: '  How does the compressor raise pressure?  ',
    highlightedText: '  Successive rotor and stator blades compress air. ',
    pageContext: 'Full page context text',
    pageNumber: 2,
    documentTitle: 'JetEngine.pdf',
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.question, 'How does the compressor raise pressure?');
    assert.equal(
      valid.value.highlightedText,
      'Successive rotor and stator blades compress air.',
    );
    assert.equal(valid.value.pageNumber, 2);
  }
});

test('validateGeminiTutorResponse validates all 8 supported 3D jet engine components and aliases', () => {
  const result = validateGeminiTutorResponse(
    JSON.stringify({
      mainConcept: 'High-Pressure Axial Compression',
      studentQuestionSummary: 'How axial compressors increase static pressure',
      componentsAndRelationships: [
        'Rotor blades add kinetic energy to incoming air',
        'Stator vanes diffuse velocity into static pressure',
      ],
      recommendedVisualization:
        'Animated axial compressor stages showing pressure rise across rotor/stator pairs',
      explanation:
        'Each rotor-stator stage accelerates the air slightly and then diffuses it to raise pressure.',
      supportedVisualizationComponent: 'hp-compressor',
      visualizationSupported: true,
      recommendedLayerMode: 'airflow',
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.supportedVisualizationComponent, 'hp-compressor');
    assert.equal(result.value.visualizationSupported, true);
    assert.equal(result.value.recommendedLayerMode, 'airflow');
  }

  assert.equal(normalizeVisualizationComponent('lp-compressor'), 'lp-compressor');
  assert.equal(normalizeVisualizationComponent('bypass-duct'), 'bypass-duct');
  assert.equal(normalizeVisualizationComponent('compressor'), 'hp-compressor');
  assert.equal(normalizeVisualizationComponent('photosynthesis'), 'none');
});

test('validateGeminiTutorResponse enforces none when visualizationSupported is false or invalid', () => {
  const unsupported = validateGeminiTutorResponse({
    mainConcept: 'Cellular Mitosis',
    studentQuestionSummary: 'Phases of cell division',
    componentsAndRelationships: ['Chromosomes align at metaphase plate'],
    recommendedVisualization: '2D/3D mitotic spindle animation',
    explanation: 'Mitosis divides replicated DNA evenly into two daughter nuclei.',
    supportedVisualizationComponent: 'fan',
    visualizationSupported: false,
    recommendedLayerMode: 'cutaway',
  });

  assert.equal(unsupported.ok, true);
  if (unsupported.ok) {
    assert.equal(unsupported.value.visualizationSupported, false);
    assert.equal(unsupported.value.supportedVisualizationComponent, 'none');
  }

  const malformed = validateGeminiTutorResponse('not json');
  assert.equal(malformed.ok, false);
});

test('validateScreenAnalyzeRequest validates cropped base64 image and question', () => {
  const bad = validateScreenAnalyzeRequest({
    question: 'What is this?',
    imageBase64: 'short',
    mimeType: 'image/png',
  });
  assert.equal(bad.ok, false);

  const sampleB64 = Buffer.from('fake-png-image-payload-for-unit-testing-123456').toString('base64');
  const good = validateScreenAnalyzeRequest({
    question: '  Explain this part  ',
    imageBase64: `data:image/jpeg;base64,${sampleB64}`,
    mimeType: 'image/jpeg',
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.value.question, 'Explain this part');
    assert.equal(good.value.imageBase64, sampleB64);
    assert.equal(good.value.mimeType, 'image/jpeg');
  }
});

test('validateScreenAnalyzeResponse parses scientific principles, confidence, and 2D diagram fallback', () => {
  const result = validateScreenAnalyzeResponse(
    JSON.stringify({
      mainConcept: 'Four-Stroke Internal Combustion Engine',
      studentQuestionSummary: 'How the piston and crankshaft convert fuel into rotation',
      componentsAndRelationships: ['Piston transfers gas force via connecting rod to crankshaft'],
      scientificPrinciples: ['Ideal Otto Cycle', 'Thermodynamic expansion work'],
      recommendedVisualization: '2D labeled piston-crank cycle diagram',
      explanation: 'Combustion pushes the piston down, turning the crankshaft.',
      supportedVisualizationComponent: 'none',
      visualizationSupported: false,
      recommendedLayerMode: 'cutaway',
      confidenceLevel: 'high',
      uncertaintyNote: 'Clear side cross-section diagram visible.',
      diagramData: {
        title: 'Four-Stroke Cycle Components',
        layout: 'flow',
        nodes: [
          { id: 'n1', label: 'Intake Valve', role: 'Admits air-fuel mix', category: 'secondary' },
          { id: 'n2', label: 'Piston', role: 'Compresses and receives expansion force', category: 'primary' },
          { id: 'n3', label: 'Crankshaft', role: 'Converts linear force to torque', category: 'energy' },
        ],
        edges: [
          { fromId: 'n1', toId: 'n2', label: 'Feeds cylinder' },
          { fromId: 'n2', toId: 'n3', label: 'Drives rotation' },
        ],
      },
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.visualizationSupported, false);
    assert.equal(result.value.confidenceLevel, 'high');
    assert.equal(result.value.scientificPrinciples.length, 2);
    assert.ok(result.value.diagramData);
    assert.equal(result.value.diagramData?.nodes.length, 3);
    assert.equal(result.value.diagramData?.edges.length, 2);
  }
});

test('buildSurroundingPageContext centers window around highlighted text', () => {
  const prefix = 'A'.repeat(250);
  const target = 'compressor increases pressure via rotor and stator stages';
  const suffix = 'B'.repeat(250);
  const snippet = buildSurroundingPageContext(`${prefix} ${target} ${suffix}`, target, 120);

  assert.ok(snippet.includes(target));
  assert.ok(snippet.length <= 120);
});

test('validateGeminiTutorResponse enforces retrieval-before-generation for verified GLB assets', () => {
  const shipMatch = validateGeminiTutorResponse({
    mainConcept: 'Container Ship Propulsion',
    studentQuestionSummary: 'Visualize a cargo container ship',
    componentsAndRelationships: ['Propeller turns shaft torque into thrust'],
    recommendedVisualization: 'Real 3D Container Ship GLB focused on propeller',
    explanation: 'A marine screw propeller accelerates water astern to push the hull forward.',
    supportedVisualizationComponent: 'none',
    visualizationSupported: false,
    recommendedLayerMode: 'cutaway',
    assetRetrievalPlan: {
      matchedAssetId: 'container-ship',
      requestedLevel: 'component-detail',
      focusPartId: 'propeller',
    },
    generatedScene3D: {
      feasible: true,
      systemTitle: 'Primitive Ship Boxes',
      category: 'marine',
      conceptualNote: 'Should be stripped when verified GLB matches',
      estimatedScaleLabel: '140m',
      operatingPrinciple: 'Buoyancy',
      physicalProcesses: ['Thrust'],
      components: [
        {
          id: 'hull',
          name: 'Hull',
          role: 'Body',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          shapes: [],
          animation: { type: 'none', axis: 'y', speed: 0, amplitude: 0, phaseOffset: 0 },
        },
      ],
      connections: [],
    },
  });

  assert.equal(shipMatch.ok, true);
  if (shipMatch.ok) {
    assert.equal(shipMatch.value.assetRetrievalPlan?.matchedAssetId, 'container-ship');
    assert.equal(shipMatch.value.assetRetrievalPlan?.focusPartId, 'propeller');
    assert.equal(shipMatch.value.generatedScene3D, undefined);
  }

  const askReq = validateTutorAskRequest({
    question: 'Explain the impeller inside my uploaded model',
    activeAssetId: 'uploaded-123',
    activeExplorationLevel: 'full-object',
    uploadedAssets: [
      { id: 'uploaded-123', name: 'Centrifugal Pump', category: 'user-uploaded-glb', parts: ['impeller'] },
    ],
  });
  assert.equal(askReq.ok, true);
  if (askReq.ok) {
    assert.equal(askReq.value.activeAssetId, 'uploaded-123');
    assert.equal(askReq.value.uploadedAssets?.[0]?.parts[0], 'impeller');
  }
});
