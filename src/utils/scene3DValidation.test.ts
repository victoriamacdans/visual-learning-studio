import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGeneratedScene3DSpec } from './scene3DValidation.ts';
import { validateGeminiTutorResponse } from './tutorValidation.ts';

describe('validateGeneratedScene3DSpec', () => {
  it('validates a multi-part mechanical assembly and clamps extreme values safely', () => {
    const raw = {
      feasible: true,
      systemTitle: 'Single-Cylinder Piston-Crank Assembly',
      category: 'mechanical',
      conceptualNote: 'Simplified educational linkage.',
      estimatedScaleLabel: 'Conceptual scale · ~10 cm bore',
      operatingPrinciple: 'Reciprocating motion converts to rotary torque.',
      physicalProcesses: ['Combustion expansion', 'Slider-crank kinematics'],
      components: [
        {
          id: 'crankshaft',
          name: 'Crankshaft',
          role: 'Converts rod force into continuous rotation.',
          position: [0, -1, 0],
          rotation: [0, 0, 0],
          shapes: [
            {
              primitive: 'cylinder',
              offset: [0, 0, 0],
              rotation: [Math.PI / 2, 0, 0],
              radius: 0.25,
              height: 1.4,
              material: { color: '#94a3b8', metalness: 1.8, roughness: -0.5 },
            },
            {
              primitive: 'gear',
              offset: [0, 0, 0.7],
              rotation: [0, 0, 0],
              radius: 0.45,
              depth: 0.14,
              teeth: 99,
              material: { color: '#ccc', metalness: 0.7, roughness: 0.3 },
            },
          ],
          animation: {
            type: 'crank-slider',
            axis: 'y',
            speed: 50,
            amplitude: 0.45,
            phaseOffset: 0,
            crankRadius: 0.45,
            rodLength: 1.4,
            linkageRole: 'crank',
          },
        },
        {
          id: 'piston',
          name: 'Piston Crown',
          role: 'Reciprocates inside the cylinder bore.',
          position: [0, 1.2, 0],
          rotation: [0, 0, 0],
          shapes: [
            {
              primitive: 'lathe',
              offset: [0, 0, 0],
              rotation: [0, 0, 0],
              profilePoints: [
                [0.01, -0.3],
                [-0.5, -0.3],
                [0.5, 0.3],
              ],
              material: { color: 'invalid-color', metalness: 0.6, roughness: 0.3 },
            },
          ],
          animation: {
            type: 'crank-slider',
            axis: 'y',
            speed: 3.0,
            amplitude: 0.45,
            phaseOffset: 0,
            crankRadius: 0.45,
            rodLength: 1.4,
            linkageRole: 'piston',
          },
        },
      ],
      connections: [
        {
          fromId: 'piston',
          toId: 'crankshaft',
          label: 'Mechanical thrust',
          kind: 'mechanical',
          animatedFlow: true,
        },
        {
          fromId: 'piston',
          toId: 'nonexistent',
          label: 'Should be filtered out',
          kind: 'fluid',
        },
      ],
    };

    const validated = validateGeneratedScene3DSpec(raw);
    assert.ok(validated);
    assert.equal(validated.feasible, true);
    assert.equal(validated.components.length, 2);

    const crank = validated.components[0];
    assert.equal(crank.shapes[0].material.color, '#94A3B8');
    assert.equal(crank.shapes[0].material.metalness, 1);
    assert.equal(crank.shapes[0].material.roughness, 0.05);
    assert.equal(crank.shapes[1].material.color, '#CCCCCC');
    assert.equal(crank.shapes[1].teeth, 40);
    assert.equal(crank.animation.speed, 12);

    const piston = validated.components[1];
    assert.equal(piston.shapes[0].material.color, '#94A3B8');
    assert.equal(piston.shapes[0].profilePoints?.[1][0], 0.5);

    assert.equal(validated.connections.length, 1);
    assert.equal(validated.connections[0].fromId, 'piston');
  });

  it('breaks cyclic parentId references cleanly without dropping components', () => {
    const raw = {
      feasible: true,
      systemTitle: 'Cycle Check',
      category: 'mechanical',
      conceptualNote: 'Cycle safety check.',
      estimatedScaleLabel: 'Unit scale',
      operatingPrinciple: 'Check acyclic hierarchy.',
      physicalProcesses: [],
      components: [
        {
          id: 'a',
          name: 'Part A',
          role: 'Parent of B',
          parentId: 'b',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          shapes: [],
          animation: { type: 'none', axis: 'y', speed: 0, amplitude: 0, phaseOffset: 0 },
        },
        {
          id: 'b',
          name: 'Part B',
          role: 'Parent of A',
          parentId: 'a',
          position: [1, 0, 0],
          rotation: [0, 0, 0],
          shapes: [],
          animation: { type: 'none', axis: 'y', speed: 0, amplitude: 0, phaseOffset: 0 },
        },
      ],
      connections: [],
    };

    const validated = validateGeneratedScene3DSpec(raw);
    assert.ok(validated);
    assert.equal(validated.components[0].parentId, undefined);
    assert.equal(validated.components[1].parentId, undefined);
  });

  it('handles infeasible 3D concepts transparently with reason and empty components', () => {
    const validated = validateGeneratedScene3DSpec({
      feasible: false,
      infeasibilityReason: 'Abstract monetary policy relationship is non-spatial.',
      systemTitle: 'Monetary Policy Transmission',
      category: 'economics',
      conceptualNote: 'Abstract system.',
      estimatedScaleLabel: 'Non-physical',
      operatingPrinciple: 'Interest rate adjustments alter borrowing.',
      physicalProcesses: [],
      components: [{ id: 'x', name: 'Ignored', role: 'Ignored', position: [0, 0, 0], rotation: [0, 0, 0], shapes: [], animation: { type: 'none', axis: 'y', speed: 0, amplitude: 0, phaseOffset: 0 } }],
      connections: [],
    });

    assert.ok(validated);
    assert.equal(validated.feasible, false);
    assert.equal(validated.components.length, 0);
    assert.match(validated.infeasibilityReason ?? '', /non-spatial/i);
  });

  it('strips generatedScene3D when turbofan 3D engine visualizationSupported is true', () => {
    const res = validateGeminiTutorResponse({
      mainConcept: 'High-Pressure Compressor',
      studentQuestionSummary: 'How does the HPC work?',
      componentsAndRelationships: ['Rotor blades add kinetic energy'],
      recommendedVisualization: 'Focus on HP compressor',
      explanation: 'Compresses air before combustion.',
      supportedVisualizationComponent: 'hp-compressor',
      visualizationSupported: true,
      recommendedLayerMode: 'airflow',
      generatedScene3D: {
        feasible: true,
        systemTitle: 'Should Not Override Turbofan',
        category: 'mechanical',
        conceptualNote: 'Note',
        estimatedScaleLabel: 'Scale',
        operatingPrinciple: 'Principle',
        physicalProcesses: [],
        components: [
          {
            id: 'c1',
            name: 'Part',
            role: 'Role',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            shapes: [],
            animation: { type: 'none', axis: 'y', speed: 0, amplitude: 0, phaseOffset: 0 },
          },
        ],
        connections: [],
      },
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.visualizationSupported, true);
      assert.equal(res.value.generatedScene3D, undefined);
    }
  });
});
