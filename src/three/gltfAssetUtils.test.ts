import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getAssetEntryById } from './assetRegistry.ts';
import {
  computeBoxCameraPreset,
  computeSubRegionBounds,
  discoverAssetParts,
  normalizeModelToStage,
  resolveClickedObjectToPart,
} from './gltfAssetUtils.ts';

test('normalizeModelToStage scales uniformly to target extent and grounds bottom at Y=0', () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(20, 10, 100),
    new THREE.MeshStandardMaterial(),
  );
  mesh.position.set(15, 25, -40);
  root.add(mesh);

  const metrics = normalizeModelToStage(root, 5.0);
  assert.ok(Math.abs(metrics.size[2] - 5.0) < 1e-3);
  assert.ok(Math.abs(metrics.boxMin[1]) < 1e-3);
  assert.ok(Math.abs(metrics.center[0]) < 1e-3);
  assert.ok(Math.abs(metrics.center[2]) < 1e-3);
});

test('discoverAssetParts and resolveClickedObjectToPart map container-ship nodes accurately', () => {
  const root = new THREE.Group();

  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 6));
  bodyMesh.name = 'body';
  bodyMesh.position.set(0, 0.75, 0);
  root.add(bodyMesh);

  const propellerGroup = new THREE.Group();
  propellerGroup.name = 'propeller';
  propellerGroup.position.set(0, 0.25, -2.85);
  const propMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 8));
  propMesh.name = 'propeller_mesh';
  propellerGroup.add(propMesh);
  root.add(propellerGroup);

  const rudderGroup = new THREE.Group();
  rudderGroup.name = 'rudder';
  rudderGroup.position.set(0, 0.28, -3.0);
  const rudderMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.25));
  rudderMesh.name = 'rudder_mesh';
  rudderGroup.add(rudderMesh);
  root.add(rudderGroup);

  const metrics = normalizeModelToStage(root, 6.0);
  const shipEntry = getAssetEntryById('container-ship');
  assert.ok(shipEntry);

  const parts = discoverAssetParts(root, shipEntry, metrics);
  const propellerPart = parts.find((p) => p.id === 'propeller');
  assert.ok(propellerPart);
  assert.equal(propellerPart.isVerifiedMesh, true);
  assert.deepEqual(propellerPart.matchedNodeNames, ['propeller']);

  // Clicking child propeller_mesh resolves cleanly up to the propeller part
  const resolved = resolveClickedObjectToPart(propMesh, parts);
  assert.equal(resolved?.id, 'propeller');

  // Spatial sub-region click near aft top of body resolves to superstructure
  const superstructureHit = new THREE.Vector3(0, metrics.boxMax[1] * 0.8, metrics.boxMin[2] * 0.85);
  const resolvedBodyPart = resolveClickedObjectToPart(bodyMesh, parts, superstructureHit);
  assert.equal(resolvedBodyPart?.id, 'superstructure');
});

test('computeBoxCameraPreset and computeSubRegionBounds compute finite framing vectors', () => {
  const sub = computeSubRegionBounds([-1, 0, -3], [1, 2, 3], {
    minZ: 0,
    maxZ: 0.35,
    minY: 0.4,
    maxY: 1,
  });
  assert.ok(sub.center[2] < 0);
  assert.ok(sub.center[1] > 1.0);

  const cam = computeBoxCameraPreset(sub.center, sub.size, {
    azimuthDeg: 144,
    elevationDeg: 10,
    distanceScale: 2.6,
  });
  assert.ok(cam.position.every(Number.isFinite));
  assert.ok(cam.target.every(Number.isFinite));
  assert.ok(cam.position[2] < sub.center[2]);
});
