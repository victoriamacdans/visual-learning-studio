import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  GeneratedScene3DSpec,
  Scene3DComponentSpec,
  Scene3DConnectionKind,
  Scene3DConnectionSpec,
  Scene3DShapePart,
  Vec3Tuple,
} from '../../types/tutor';
import { buildProceduralGeometry } from '../../three/proceduralGeometryBuilders';
import {
  computeDynamicExplodeOffset,
  computeSceneBoundingFraming,
  evaluateComponentAnimation,
  resolveWorldComponentCenters,
} from '../../three/universalKinematics';

const CONNECTION_COLORS: Readonly<Record<Scene3DConnectionKind, string>> = {
  mechanical: '#38BDF8',
  electrical: '#FACC15',
  fluid: '#22D3EE',
  thermal: '#FB923C',
  magnetic: '#A855F7',
  signal: '#34D399',
};

interface SpriteLabelProps {
  text: string;
  isSelected: boolean;
}

function SpriteLabel({ text, isSelected }: SpriteLabelProps) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    let labelAspect = 3.2;

    if (ctx) {
      ctx.font = isSelected ? '600 32px monospace' : '500 30px monospace';
      const measured = ctx.measureText(text).width;
      const boxW = Math.min(500, Math.max(120, Math.ceil(measured) + 44));
      const boxH = 62;
      const startX = (canvas.width - boxW) * 0.5;
      const startY = (canvas.height - boxH) * 0.5;

      ctx.fillStyle = isSelected ? 'rgba(8, 18, 34, 0.94)' : 'rgba(9, 13, 22, 0.9)';
      ctx.strokeStyle = isSelected ? '#22d3ee' : '#334155';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(startX, startY, boxW, boxH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isSelected ? '#a5f3fc' : '#cbd5e1';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width * 0.5, canvas.height * 0.5 + 1, boxW - 24);
      labelAspect = canvas.width / canvas.height;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return { texture: tex, aspect: labelAspect };
  }, [text, isSelected]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <sprite position={[0, 0.58, 0]} scale={[0.062 * aspect, 0.062, 1]} renderOrder={12}>
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
        sizeAttenuation={false}
      />
    </sprite>
  );
}

interface ShapeMeshProps {
  part: Scene3DShapePart;
  isSelected: boolean;
  isHovered: boolean;
  isDimmed: boolean;
  isSoftwareGl: boolean;
  castShadow: boolean;
}

function ShapeMesh({
  part,
  isSelected,
  isHovered,
  isDimmed,
  isSoftwareGl,
  castShadow,
}: ShapeMeshProps) {
  const geometry = useMemo(
    () => buildProceduralGeometry(part, isSoftwareGl),
    [part, isSoftwareGl],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const baseOpacity = part.material.opacity ?? 1;
  const effectiveOpacity = isDimmed ? 0.12 : baseOpacity;
  const isTransparent = effectiveOpacity < 0.99;

  const baseEmissive = part.material.emissive ?? '#000000';
  const baseEmissiveInt = part.material.emissiveIntensity ?? 0;

  let emissiveColor = baseEmissive;
  let emissiveIntensity = isDimmed ? 0 : baseEmissiveInt;

  if (!isDimmed && isSelected) {
    emissiveColor = baseEmissiveInt > 0.35 ? baseEmissive : '#38BDF8';
    emissiveIntensity = Math.max(baseEmissiveInt, 0.36);
  } else if (!isDimmed && isHovered) {
    emissiveColor = baseEmissiveInt > 0.25 ? baseEmissive : '#0EA5E9';
    emissiveIntensity = Math.max(baseEmissiveInt, 0.22);
  }

  return (
    <mesh
      geometry={geometry}
      position={[part.offset[0], part.offset[1], part.offset[2]]}
      rotation={[part.rotation[0], part.rotation[1], part.rotation[2]]}
      castShadow={castShadow && !isDimmed && !isTransparent}
      receiveShadow={castShadow && !isDimmed}
    >
      <meshStandardMaterial
        color={part.material.color}
        metalness={isDimmed ? 0.15 : part.material.metalness}
        roughness={isDimmed ? 0.85 : part.material.roughness}
        emissive={emissiveColor}
        emissiveIntensity={emissiveIntensity}
        transparent={isTransparent}
        opacity={effectiveOpacity}
        depthWrite={!isTransparent}
        wireframe={Boolean(part.material.wireframe)}
        side={part.primitive === 'lathe' ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
  );
}

interface DynamicComponentNodeProps {
  component: Scene3DComponentSpec;
  componentIndex: number;
  allComponents: readonly Scene3DComponentSpec[];
  worldCenters: Map<string, Vec3Tuple>;
  assemblyCenter: Vec3Tuple;
  selectedComponentId: string | null;
  hoveredId: string | null;
  isolateSelected: boolean;
  isPlaying: boolean;
  isExploded: boolean;
  speedMultiplier: number;
  showLabels: boolean;
  isSoftwareGl: boolean;
  onSelectComponent: (id: string) => void;
  onHoverChange: (id: string | null) => void;
  simTimeRef: { current: number };
  explodeProgressRef: { current: number };
}

function DynamicComponentNode({
  component,
  componentIndex,
  allComponents,
  worldCenters,
  assemblyCenter,
  selectedComponentId,
  hoveredId,
  isolateSelected,
  isPlaying,
  isExploded,
  speedMultiplier,
  showLabels,
  isSoftwareGl,
  onSelectComponent,
  onHoverChange,
  simTimeRef,
  explodeProgressRef,
}: DynamicComponentNodeProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const children = useMemo(
    () =>
      allComponents
        .map((c, idx) => ({ comp: c, idx }))
        .filter(({ comp }) => comp.parentId === component.id),
    [allComponents, component.id],
  );

  const isSelected = selectedComponentId === component.id;
  const isHovered = hoveredId === component.id;
  const isDimmed =
    isolateSelected && selectedComponentId !== null && selectedComponentId !== component.id;

  const worldCenter = worldCenters.get(component.id) ?? component.position;
  const parentComp = component.parentId
    ? allComponents.find((c) => c.id === component.parentId)
    : undefined;
  const parentWorldCenter = parentComp
    ? worldCenters.get(parentComp.id) ?? parentComp.position
    : undefined;

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const anim = evaluateComponentAnimation(
      component.animation,
      simTimeRef.current,
      speedMultiplier,
    );

    const selfExplode = computeDynamicExplodeOffset(
      component,
      assemblyCenter,
      worldCenter,
      explodeProgressRef.current,
      componentIndex,
    );

    let localExplodeX = selfExplode[0];
    let localExplodeY = selfExplode[1];
    let localExplodeZ = selfExplode[2];

    if (parentComp && parentWorldCenter) {
      const parentIdx = allComponents.findIndex((c) => c.id === parentComp.id);
      const parentExplode = computeDynamicExplodeOffset(
        parentComp,
        assemblyCenter,
        parentWorldCenter,
        explodeProgressRef.current,
        Math.max(0, parentIdx),
      );
      localExplodeX -= parentExplode[0];
      localExplodeY -= parentExplode[1];
      localExplodeZ -= parentExplode[2];
    }

    group.position.set(
      component.position[0] + anim.deltaPosition[0] + localExplodeX,
      component.position[1] + anim.deltaPosition[1] + localExplodeY,
      component.position[2] + anim.deltaPosition[2] + localExplodeZ,
    );
    group.rotation.set(
      component.rotation[0] + anim.deltaRotation[0],
      component.rotation[1] + anim.deltaRotation[1],
      component.rotation[2] + anim.deltaRotation[2],
    );
    group.scale.setScalar(anim.uniformScale);
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelectComponent(component.id);
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHoverChange(component.id);
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (hoveredId === component.id) {
      onHoverChange(null);
    }
  };

  return (
    <group
      ref={groupRef}
      userData={{ componentId: component.id }}
      position={[component.position[0], component.position[1], component.position[2]]}
      rotation={[component.rotation[0], component.rotation[1], component.rotation[2]]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {component.shapes.map((part, idx) => (
        <ShapeMesh
          key={`${component.id}-shape-${idx}`}
          part={part}
          isSelected={isSelected}
          isHovered={isHovered}
          isDimmed={isDimmed}
          isSoftwareGl={isSoftwareGl}
          castShadow={!isSoftwareGl}
        />
      ))}

      {showLabels && !isDimmed && (
        <SpriteLabel text={component.name} isSelected={isSelected} />
      )}

      {children.map(({ comp, idx }) => (
        <DynamicComponentNode
          key={comp.id}
          component={comp}
          componentIndex={idx}
          allComponents={allComponents}
          worldCenters={worldCenters}
          assemblyCenter={assemblyCenter}
          selectedComponentId={selectedComponentId}
          hoveredId={hoveredId}
          isolateSelected={isolateSelected}
          isPlaying={isPlaying}
          isExploded={isExploded}
          speedMultiplier={speedMultiplier}
          showLabels={showLabels}
          isSoftwareGl={isSoftwareGl}
          onSelectComponent={onSelectComponent}
          onHoverChange={onHoverChange}
          simTimeRef={simTimeRef}
          explodeProgressRef={explodeProgressRef}
        />
      ))}
    </group>
  );
}

interface ConnectionConduitProps {
  connection: Scene3DConnectionSpec;
  fromPos: Vec3Tuple;
  toPos: Vec3Tuple;
  isHighlighted: boolean;
  isPlaying: boolean;
  speedMultiplier: number;
  simTimeRef: { current: number };
}

function ConnectionConduit({
  connection,
  fromPos,
  toPos,
  isHighlighted,
  isPlaying,
  speedMultiplier,
  simTimeRef,
}: ConnectionConduitProps) {
  const pulseRef = useRef<THREE.Mesh | null>(null);
  const color = CONNECTION_COLORS[connection.kind] ?? '#38BDF8';

  const { curve, geometry } = useMemo(() => {
    const start = new THREE.Vector3(fromPos[0], fromPos[1], fromPos[2]);
    const end = new THREE.Vector3(toPos[0], toPos[1], toPos[2]);
    const mid = start.clone().lerp(end, 0.5);
    const dist = start.distanceTo(end);
    mid.y += Math.min(0.65, dist * 0.22);

    const catmull = new THREE.CatmullRomCurve3([start, mid, end]);
    const tubeGeo = new THREE.TubeGeometry(catmull, 18, isHighlighted ? 0.026 : 0.016, 6, false);
    return { curve: catmull, geometry: tubeGeo };
  }, [fromPos, toPos, isHighlighted]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const pointVec = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!pulseRef.current || connection.animatedFlow === false) return;
    const t = ((simTimeRef.current * speedMultiplier * 0.45) % 1 + 1) % 1;
    curve.getPointAt(t, pointVec);
    pulseRef.current.position.copy(pointVec);
  });

  return (
    <group userData={{ excludeFromBounds: true }}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isHighlighted ? 0.7 : 0.35}
          transparent
          opacity={isHighlighted ? 0.88 : 0.42}
          roughness={0.3}
          metalness={0.2}
          depthWrite={false}
        />
      </mesh>
      {connection.animatedFlow !== false && (
        <mesh ref={pulseRef} visible={isPlaying || isHighlighted}>
          <sphereGeometry args={[isHighlighted ? 0.055 : 0.04, 10, 10]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
    </group>
  );
}

export interface DynamicScene3DProps {
  rootRef?: RefObject<THREE.Group | null>;
  spec: GeneratedScene3DSpec;
  selectedComponentId: string | null;
  isolateSelected: boolean;
  isPlaying: boolean;
  isExploded: boolean;
  speedMultiplier: number;
  showConnections: boolean;
  showLabels: boolean;
  isSoftwareGl: boolean;
  onSelectComponent: (id: string) => void;
}

/**
 * Generalized interactive 3D scene renderer. Translates a validated GeneratedScene3DSpec
 * into a hierarchical Three.js assembly with kinematic animations, exploded view, component
 * isolation, and directional relationship conduits.
 */
export function DynamicScene3D({
  rootRef,
  spec,
  selectedComponentId,
  isolateSelected,
  isPlaying,
  isExploded,
  speedMultiplier,
  showConnections,
  showLabels,
  isSoftwareGl,
  onSelectComponent,
}: DynamicScene3DProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const simTimeRef = useRef(0);
  const explodeProgressRef = useRef(isExploded ? 1 : 0);

  useEffect(() => {
    document.body.style.cursor = hoveredId ? 'pointer' : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hoveredId]);

  // Reset simulation clock cleanly when a brand-new 3D system loads
  useEffect(() => {
    simTimeRef.current = 0;
  }, [spec]);

  const worldCenters = useMemo(
    () => resolveWorldComponentCenters(spec.components),
    [spec.components],
  );

  const framing = useMemo(
    () => computeSceneBoundingFraming(spec.components, 0),
    [spec.components],
  );

  const rootComponents = useMemo(
    () =>
      spec.components
        .map((comp, idx) => ({ comp, idx }))
        .filter(
          ({ comp }) =>
            !comp.parentId || !spec.components.some((other) => other.id === comp.parentId),
        ),
    [spec.components],
  );

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.09);
    if (isPlaying) {
      simTimeRef.current += delta;
    }
    const targetExplode = isExploded ? 1 : 0;
    explodeProgressRef.current = THREE.MathUtils.damp(
      explodeProgressRef.current,
      targetExplode,
      isSoftwareGl ? 10 : 6,
      delta,
    );
  });

  const explodeFactor = isExploded ? 1 : 0;

  return (
    <group ref={rootRef} name="dynamic-scene-root">
      {rootComponents.map(({ comp, idx }) => (
        <DynamicComponentNode
          key={comp.id}
          component={comp}
          componentIndex={idx}
          allComponents={spec.components}
          worldCenters={worldCenters}
          assemblyCenter={framing.center}
          selectedComponentId={selectedComponentId}
          hoveredId={hoveredId}
          isolateSelected={isolateSelected}
          isPlaying={isPlaying}
          isExploded={isExploded}
          speedMultiplier={speedMultiplier}
          showLabels={showLabels}
          isSoftwareGl={isSoftwareGl}
          onSelectComponent={onSelectComponent}
          onHoverChange={setHoveredId}
          simTimeRef={simTimeRef}
          explodeProgressRef={explodeProgressRef}
        />
      ))}

      {showConnections &&
        spec.connections.map((conn, idx) => {
          const fromIdx = spec.components.findIndex((c) => c.id === conn.fromId);
          const toIdx = spec.components.findIndex((c) => c.id === conn.toId);
          if (fromIdx === -1 || toIdx === -1) return null;

          const fromComp = spec.components[fromIdx];
          const toComp = spec.components[toIdx];
          const fromWorld = worldCenters.get(conn.fromId) ?? fromComp.position;
          const toWorld = worldCenters.get(conn.toId) ?? toComp.position;

          const fromExp = computeDynamicExplodeOffset(
            fromComp,
            framing.center,
            fromWorld,
            explodeFactor,
            fromIdx,
          );
          const toExp = computeDynamicExplodeOffset(
            toComp,
            framing.center,
            toWorld,
            explodeFactor,
            toIdx,
          );

          const isHighlighted =
            selectedComponentId === conn.fromId || selectedComponentId === conn.toId;

          return (
            <ConnectionConduit
              key={`${conn.fromId}-${conn.toId}-${idx}`}
              connection={conn}
              fromPos={[
                fromWorld[0] + fromExp[0],
                fromWorld[1] + fromExp[1],
                fromWorld[2] + fromExp[2],
              ]}
              toPos={[
                toWorld[0] + toExp[0],
                toWorld[1] + toExp[1],
                toWorld[2] + toExp[2],
              ]}
              isHighlighted={isHighlighted}
              isPlaying={isPlaying}
              speedMultiplier={speedMultiplier}
              simTimeRef={simTimeRef}
            />
          );
        })}
    </group>
  );
}
