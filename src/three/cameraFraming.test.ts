import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  computeBox3CameraFraming,
  measureComponentWorldBox3,
  measureObjectWorldBox3,
} from './cameraFraming.ts';

function measureProjectedFillFraction(
  boxMin: readonly [number, number, number],
  boxMax: readonly [number, number, number],
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  fovDeg: number,
  aspect: number,
): { maxXSpan: number; maxYSpan: number; clipped: boolean } {
  const camera = new THREE.PerspectiveCamera(fovDeg, aspect, 0.05, 200);
  camera.position.set(position[0], position[1], position[2]);
  camera.lookAt(target[0], target[1], target[2]);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  let minNdcX = Infinity;
  let maxNdcX = -Infinity;
  let minNdcY = Infinity;
  let maxNdcY = -Infinity;
  let clipped = false;

  const xs = [boxMin[0], boxMax[0]];
  const ys = [boxMin[1], boxMax[1]];
  const zs = [boxMin[2], boxMax[2]];
  const v = new THREE.Vector3();

  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        v.set(x, y, z).project(camera);
        if (Math.abs(v.x) > 0.99 || Math.abs(v.y) > 0.99 || v.z > 1 || v.z < -1) {
          clipped = true;
        }
        minNdcX = Math.min(minNdcX, v.x);
        maxNdcX = Math.max(maxNdcX, v.x);
        minNdcY = Math.min(minNdcY, v.y);
        maxNdcY = Math.max(maxNdcY, v.y);
      }
    }
  }

  return {
    maxXSpan: (maxNdcX - minNdcX) * 0.5,
    maxYSpan: (maxNdcY - minNdcY) * 0.5,
    clipped,
  };
}

test('computeBox3CameraFraming frames object across ~65-80% of limiting viewport axis without clipping', () => {
  const boxMin: [number, number, number] = [-1.4, -1.5, -0.9];
  const boxMax: [number, number, number] = [1.4, 2.1, 0.9];

  for (const aspect of [1.75, 1.33, 0.72]) {
    const framing = computeBox3CameraFraming({
      boxMin,
      boxMax,
      aspect,
      fovDeg: 38,
      azimuthDeg: 36,
      elevationDeg: 18,
      fillRatio: 0.72,
    });

    const projected = measureProjectedFillFraction(
      boxMin,
      boxMax,
      framing.position,
      framing.target,
      38,
      aspect,
    );

    assert.equal(projected.clipped, false, `Expected no clipping at aspect=${aspect}`);
    const dominantFill = Math.max(projected.maxXSpan, projected.maxYSpan);
    assert.ok(
      dominantFill >= 0.58 && dominantFill <= 0.88,
      `Expected ~65-80% framing coverage, got ${(dominantFill * 100).toFixed(1)}% at aspect=${aspect}`,
    );
  }
});

test('measureObjectWorldBox3 excludes grids and excludeFromBounds helpers', () => {
  const root = new THREE.Group();

  const engineMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 1));
  engineMesh.position.set(0, 1.5, 0);
  engineMesh.userData.componentId = 'cylinder-block';
  root.add(engineMesh);

  const pistonMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.6, 16));
  pistonMesh.position.set(0, 1.2, 0);
  pistonMesh.userData.componentId = 'piston';
  root.add(pistonMesh);

  const hugeGround = new THREE.Mesh(new THREE.PlaneGeometry(50, 50));
  hugeGround.rotation.x = -Math.PI / 2;
  hugeGround.userData.excludeFromBounds = true;
  root.add(hugeGround);

  const grid = new THREE.GridHelper(30, 30);
  root.add(grid);

  const whole = measureObjectWorldBox3(root);
  assert.ok(whole !== null);
  assert.ok(whole.boxMax[0] - whole.boxMin[0] < 2.2);
  assert.ok(whole.boxMax[1] - whole.boxMin[1] < 3.2);

  const pistonBounds = measureComponentWorldBox3(root, 'piston');
  assert.ok(pistonBounds !== null);
  assert.ok(pistonBounds.boxMax[0] - pistonBounds.boxMin[0] < 1.1);
  assert.ok(pistonBounds.boxMax[1] - pistonBounds.boxMin[1] < 0.7);
});
