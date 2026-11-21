import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_ASSET_REGISTRY,
  formatAssetCatalogForPrompt,
  getAssetEntryById,
  getIllustrativeSubsystemById,
  matchAssetIdFromQuery,
} from './assetRegistry.ts';

test('BUILTIN_ASSET_REGISTRY contains container ship, cordless drill, family sedan, and turbofan with valid licenses', () => {
  const ids = BUILTIN_ASSET_REGISTRY.map((a) => a.id);
  assert.ok(ids.includes('container-ship'));
  assert.ok(ids.includes('cordless-drill'));
  assert.ok(ids.includes('family-sedan'));
  assert.ok(ids.includes('turbofan-engine'));

  const ship = getAssetEntryById('container-ship');
  assert.ok(ship);
  assert.equal(ship.license, 'CC0-1.0');
  assert.equal(ship.modelUrl, '/models/container-ship.glb');
  assert.ok(ship.knownParts.some((p) => p.id === 'propeller' && p.animation?.type === 'spin'));
  assert.ok(ship.knownParts.some((p) => p.id === 'rudder'));
  assert.ok(ship.knownParts.some((p) => p.id === 'superstructure'));
  assert.ok(ship.knownParts.some((p) => p.id === 'hull'));
});

test('getIllustrativeSubsystemById resolves ship marine diesel engine and non-ship subsystems cleanly', () => {
  const marine = getIllustrativeSubsystemById('marine-diesel-engine');
  assert.ok(marine);
  assert.equal(marine.entry.id, 'container-ship');
  assert.equal(marine.subsystem.sceneSpec.feasible, true);
  assert.ok(marine.subsystem.sceneSpec.components.some((c) => c.id === 'piston-crown'));

  const drillMotor = getIllustrativeSubsystemById('drill-motor-drivetrain');
  assert.ok(drillMotor);
  assert.equal(drillMotor.entry.id, 'cordless-drill');
});

test('matchAssetIdFromQuery and formatAssetCatalogForPrompt include uploaded GLB models cleanly', () => {
  const shipMatch = matchAssetIdFromQuery('Visualize a cargo ship in 3D');
  assert.equal(shipMatch?.id, 'container-ship');

  const drillMatch = matchAssetIdFromQuery('How does a cordless drill chuck rotate?');
  assert.equal(drillMatch?.id, 'cordless-drill');

  const catalog = formatAssetCatalogForPrompt([
    {
      id: 'uploaded-pump-1',
      name: 'Centrifugal Pump',
      category: 'custom-glb',
      parts: ['impeller', 'volute_casing'],
    },
  ]);
  assert.ok(catalog.includes('container-ship'));
  assert.ok(catalog.includes('uploaded-pump-1'));
  assert.ok(catalog.includes('impeller'));
});
