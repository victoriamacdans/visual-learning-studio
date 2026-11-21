import * as THREE from 'three';
import type { Scene3DShapePart } from '../types/tutor';

/**
 * Generates a procedural Three.js BufferGeometry from a validated Scene3DShapePart.
 * Scales segment detail gracefully when running on CPU software WebGL (SwiftShader)
 * while preserving crisp engineering silhouettes for all 12 primitive types.
 */
export function buildProceduralGeometry(
  part: Scene3DShapePart,
  isSoftwareGl: boolean,
): THREE.BufferGeometry {
  const radialSegs = isSoftwareGl ? 18 : 32;
  const tubularSegs = isSoftwareGl ? 24 : 44;

  const w = part.width ?? 0.6;
  const h = part.height ?? 0.6;
  const d = part.depth ?? 0.6;
  const r = part.radius ?? 0.38;
  const rTop = part.radiusTop ?? r;
  const rBottom = part.radiusBottom ?? r;
  const tubeR = part.tubeRadius ?? 0.08;

  switch (part.primitive) {
    case 'cylinder':
      return new THREE.CylinderGeometry(rTop, rBottom, h, radialSegs, 1, false);

    case 'cone':
      return new THREE.ConeGeometry(r, h, radialSegs, 1, false);

    case 'sphere':
      return new THREE.SphereGeometry(r, radialSegs, Math.max(12, Math.round(radialSegs * 0.75)));

    case 'capsule': {
      const length = Math.max(0.06, h - r * 2);
      return new THREE.CapsuleGeometry(r, length, isSoftwareGl ? 4 : 8, radialSegs);
    }

    case 'torus':
      return new THREE.TorusGeometry(r, Math.min(r * 0.48, tubeR), isSoftwareGl ? 10 : 16, tubularSegs);

    case 'ring': {
      const outerR = Math.max(0.08, r);
      const innerR = Math.max(0.02, Math.min(outerR * 0.85, outerR - Math.max(0.04, tubeR * 1.4)));
      const shape = new THREE.Shape();
      shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const thickness = Math.max(0.04, Math.min(0.8, d || tubeR * 1.6));
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: true,
        bevelThickness: thickness * 0.08,
        bevelSize: thickness * 0.06,
        bevelSegments: isSoftwareGl ? 1 : 2,
        curveSegments: radialSegs,
      });
      geo.center();
      return geo;
    }

    case 'extruded-polygon': {
      const pts = part.profilePoints && part.profilePoints.length >= 3
        ? part.profilePoints
        : ([
            [-w / 2, -h / 2],
            [w / 2, -h / 2],
            [w / 2, h / 2],
            [-w / 2, h / 2],
          ] as const);

      const shape = new THREE.Shape();
      shape.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) {
        shape.lineTo(pts[i][0], pts[i][1]);
      }
      shape.closePath();

      const thickness = Math.max(0.04, d);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: true,
        bevelThickness: Math.min(0.025, thickness * 0.12),
        bevelSize: Math.min(0.02, thickness * 0.1),
        bevelSegments: isSoftwareGl ? 1 : 2,
      });
      geo.translate(0, 0, -thickness * 0.5);
      return geo;
    }

    case 'lathe': {
      const rawPts =
        part.profilePoints && part.profilePoints.length >= 2
          ? part.profilePoints
          : ([
              [0.01, -h / 2],
              [r, -h / 2],
              [r * 0.85, h / 2],
              [0.01, h / 2],
            ] as const);
      const lathePts = rawPts.map(([px, py]) => new THREE.Vector2(Math.max(0.008, px), py));
      return new THREE.LatheGeometry(lathePts, radialSegs);
    }

    case 'tube': {
      const pts =
        part.pathPoints && part.pathPoints.length >= 2
          ? part.pathPoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
          : [
              new THREE.Vector3(-w / 2, 0, 0),
              new THREE.Vector3(0, h * 0.25, 0),
              new THREE.Vector3(w / 2, 0, 0),
            ];
      const curve = new THREE.CatmullRomCurve3(pts);
      return new THREE.TubeGeometry(curve, tubularSegs, Math.max(0.015, tubeR), isSoftwareGl ? 8 : 12, false);
    }

    case 'helix': {
      const turns = Math.max(1, part.turns ?? 5);
      const coilR = Math.max(0.06, r);
      const coilH = Math.max(0.15, h);
      const totalPts = Math.min(140, Math.round(turns * (isSoftwareGl ? 12 : 20)));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= totalPts; i += 1) {
        const u = i / totalPts;
        const theta = u * turns * Math.PI * 2;
        pts.push(
          new THREE.Vector3(
            Math.cos(theta) * coilR,
            (u - 0.5) * coilH,
            Math.sin(theta) * coilR,
          ),
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      return new THREE.TubeGeometry(
        curve,
        totalPts,
        Math.min(coilR * 0.35, Math.max(0.015, tubeR)),
        isSoftwareGl ? 6 : 10,
        false,
      );
    }

    case 'gear': {
      const teeth = Math.max(6, Math.min(40, Math.round(part.teeth ?? 14)));
      const pitchR = Math.max(0.12, r);
      const addendum = Math.min(0.12, pitchR * 0.16);
      const dedendum = Math.min(0.1, pitchR * 0.14);
      const outerR = pitchR + addendum;
      const rootR = Math.max(0.06, pitchR - dedendum);

      const shape = new THREE.Shape();
      const step = (Math.PI * 2) / teeth;

      for (let i = 0; i < teeth; i += 1) {
        const a0 = i * step;
        const a1 = a0 + step * 0.18;
        const a2 = a0 + step * 0.3;
        const a3 = a0 + step * 0.54;
        const a4 = a0 + step * 0.66;
        const a5 = a0 + step * 0.92;

        const p0x = Math.cos(a0) * rootR;
        const p0y = Math.sin(a0) * rootR;
        if (i === 0) {
          shape.moveTo(p0x, p0y);
        } else {
          shape.lineTo(p0x, p0y);
        }
        shape.lineTo(Math.cos(a1) * rootR, Math.sin(a1) * rootR);
        shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
        shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
        shape.lineTo(Math.cos(a4) * rootR, Math.sin(a4) * rootR);
        shape.lineTo(Math.cos(a5) * rootR, Math.sin(a5) * rootR);
      }
      shape.closePath();

      const boreR = rootR * 0.34;
      if (boreR > 0.03) {
        const hole = new THREE.Path();
        hole.absarc(0, 0, boreR, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }

      const thickness = Math.max(0.05, Math.min(1.0, d || 0.14));
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: thickness,
        bevelEnabled: true,
        bevelThickness: Math.min(0.015, thickness * 0.1),
        bevelSize: Math.min(0.012, thickness * 0.08),
        bevelSegments: 1,
      });
      geo.translate(0, 0, -thickness * 0.5);
      return geo;
    }

    case 'box':
    default:
      return new THREE.BoxGeometry(w, h, d);
  }
}
