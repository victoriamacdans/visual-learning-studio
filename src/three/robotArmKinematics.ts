export type RobotToolMode = 'gripper' | 'cutter';
export type RobotSequenceId = 'sequence-a-pick-place' | 'sequence-b-cut';

export interface RobotArmDimensions {
  readonly baseHeight: number;
  readonly shoulderHeight: number;
  readonly upperArmLength: number;
  readonly forearmLength: number;
  readonly wristLength: number;
  readonly toolLength: number;
  readonly appleRadius: number;
  readonly pickupRadius: number;
}

export const ROBOT_ARM_DIMENSIONS: RobotArmDimensions = {
  baseHeight: 0.34,
  shoulderHeight: 0.72,
  upperArmLength: 1.65,
  forearmLength: 1.48,
  wristLength: 0.34,
  toolLength: 0.28,
  appleRadius: 0.22,
  pickupRadius: 1.85,
};

export interface RobotJointAngles {
  readonly baseYawRad: number;
  readonly shoulderPitchRad: number;
  readonly elbowPitchRad: number;
  readonly wristPitchRad: number;
  readonly wristRollRad: number;
}

export interface RobotArmPoseState {
  readonly sequenceId: RobotSequenceId;
  readonly progress: number;
  readonly phaseLabel: string;
  readonly activeTool: RobotToolMode;
  readonly joints: RobotJointAngles;
  readonly toolTipPosition: readonly [number, number, number];
  readonly gripperOpenAmount: number;
  readonly isAppleGrasped: boolean;
  readonly applePosition: readonly [number, number, number];
  readonly appleYawRad: number;
  readonly appleSplitProgress: number;
  readonly cutterBladeDrop: number;
  readonly pickupPadPosition: readonly [number, number, number];
  readonly targetPadPosition: readonly [number, number, number];
}

export const ROBOT_JOINT_LIMITS = {
  baseYaw: [-Math.PI, Math.PI] as const,
  shoulderPitch: [-0.4, 1.48] as const,
  elbowPitch: [0.15, 2.4] as const,
  wristPitch: [-1.8, 2.2] as const,
  wristRoll: [-Math.PI, Math.PI] as const,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function smoothstep(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

/**
 * Forward kinematics verifying where the wrist & tool tip sit in 3D space
 * for a given joint configuration.
 */
export function computeRobotForwardKinematics(
  joints: RobotJointAngles,
  dims: RobotArmDimensions = ROBOT_ARM_DIMENSIONS,
): {
  readonly shoulderPos: readonly [number, number, number];
  readonly elbowPos: readonly [number, number, number];
  readonly wristPos: readonly [number, number, number];
  readonly toolTipPos: readonly [number, number, number];
} {
  const { shoulderHeight, upperArmLength, forearmLength, wristLength, toolLength } = dims;
  const yaw = joints.baseYawRad;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  const theta1 = joints.shoulderPitchRad;
  const theta12 = theta1 + joints.elbowPitchRad;
  const theta123 = theta12 + joints.wristPitchRad;

  const rElbow = upperArmLength * Math.sin(theta1);
  const yElbow = shoulderHeight + upperArmLength * Math.cos(theta1);

  const rWrist = rElbow + forearmLength * Math.sin(theta12);
  const yWrist = yElbow + forearmLength * Math.cos(theta12);

  const totalToolOffset = wristLength + toolLength;
  const rTip = rWrist + totalToolOffset * Math.sin(theta123);
  const yTip = yWrist + totalToolOffset * Math.cos(theta123);

  return {
    shoulderPos: [0, shoulderHeight, 0],
    elbowPos: [rElbow * cosY, yElbow, rElbow * sinY],
    wristPos: [rWrist * cosY, yWrist, rWrist * sinY],
    toolTipPos: [rTip * cosY, yTip, rTip * sinY],
  };
}

/**
 * Analytical 2-link planar inverse kinematics + base yaw targeting with joint limits
 * and worktable height safety clamping (prevents table penetration).
 */
export function solveRobotArmIk(
  targetTip: readonly [number, number, number],
  wristRollRad = 0,
  dims: RobotArmDimensions = ROBOT_ARM_DIMENSIONS,
): RobotJointAngles {
  const safeTipY = Math.max(dims.appleRadius * 0.45, targetTip[1]);
  const radialDist = Math.hypot(targetTip[0], targetTip[2]);
  const baseYawRad =
    radialDist > 0.001
      ? clamp(
          Math.atan2(targetTip[2], targetTip[0]),
          ROBOT_JOINT_LIMITS.baseYaw[0],
          ROBOT_JOINT_LIMITS.baseYaw[1],
        )
      : 0;

  // Wrist target sits straight above the vertical tool tip
  const wristTargetR = clamp(radialDist, 0.35, 2.75);
  const wristTargetY = safeTipY + dims.wristLength + dims.toolLength;

  const dr = wristTargetR;
  const dy = wristTargetY - dims.shoulderHeight;
  const minReach = Math.abs(dims.upperArmLength - dims.forearmLength) + 0.08;
  const maxReach = dims.upperArmLength + dims.forearmLength - 0.06;
  const dist = clamp(Math.hypot(dr, dy), minReach, maxReach);

  const cosElbow = clamp(
    (dist * dist -
      dims.upperArmLength * dims.upperArmLength -
      dims.forearmLength * dims.forearmLength) /
      (2 * dims.upperArmLength * dims.forearmLength),
    -1,
    1,
  );
  const elbowPitchRad = clamp(
    Math.acos(cosElbow),
    ROBOT_JOINT_LIMITS.elbowPitch[0],
    ROBOT_JOINT_LIMITS.elbowPitch[1],
  );

  const phi = Math.atan2(dr, dy);
  const alpha = Math.atan2(
    dims.forearmLength * Math.sin(elbowPitchRad),
    dims.upperArmLength + dims.forearmLength * Math.cos(elbowPitchRad),
  );
  const shoulderPitchRad = clamp(
    phi - alpha,
    ROBOT_JOINT_LIMITS.shoulderPitch[0],
    ROBOT_JOINT_LIMITS.shoulderPitch[1],
  );

  // Keep end-effector pointing vertically downward (total pitch = PI)
  const wristPitchRad = clamp(
    Math.PI - (shoulderPitchRad + elbowPitchRad),
    ROBOT_JOINT_LIMITS.wristPitch[0],
    ROBOT_JOINT_LIMITS.wristPitch[1],
  );

  return {
    baseYawRad,
    shoulderPitchRad,
    elbowPitchRad,
    wristPitchRad,
    wristRollRad: clamp(
      wristRollRad,
      ROBOT_JOINT_LIMITS.wristRoll[0],
      ROBOT_JOINT_LIMITS.wristRoll[1],
    ),
  };
}

function getTargetPadCoords(
  baseTurnDeg: number,
  dims: RobotArmDimensions = ROBOT_ARM_DIMENSIONS,
): readonly [number, number, number] {
  const rad = (baseTurnDeg * Math.PI) / 180;
  return [
    Number((dims.pickupRadius * Math.cos(rad)).toFixed(4)),
    0,
    Number((dims.pickupRadius * Math.sin(rad)).toFixed(4)),
  ];
}

/**
 * Evaluates deterministic, collision-safe arm kinematics & apple state for
 * Sequence A (Pick, Turn 90 deg, Place) and Sequence B (Conceptual Apple Cutting).
 */
export function evaluateRobotArmSequence(
  sequenceId: RobotSequenceId,
  rawProgress: number,
  baseTurnDeg = 90,
  dims: RobotArmDimensions = ROBOT_ARM_DIMENSIONS,
): RobotArmPoseState {
  const p = clamp(rawProgress, 0, 1);
  const clampedTurnDeg = clamp(baseTurnDeg, -180, 180);
  const turnRad = (clampedTurnDeg * Math.PI) / 180;

  const pickupPad: readonly [number, number, number] = [dims.pickupRadius, 0, 0];
  const targetPad = getTargetPadCoords(clampedTurnDeg, dims);
  const appleCenterY = dims.appleRadius;

  if (sequenceId === 'sequence-b-cut') {
    let tipX = dims.pickupRadius * 0.72;
    let tipY = 1.15;
    let tipZ = 0;
    let phaseLabel = '1. Equip Dedicated Cutter Tool';
    let cutterBladeDrop = 0;
    let appleSplitProgress = 0;

    if (p < 0.2) {
      const t = smoothstep(p / 0.2);
      tipX = lerp(1.15, dims.pickupRadius, t);
      tipY = lerp(1.25, 0.74, t);
      phaseLabel = '1. Approach Apple with Cutter';
    } else if (p < 0.38) {
      const t = smoothstep((p - 0.2) / 0.18);
      tipX = dims.pickupRadius;
      tipY = lerp(0.74, 0.56, t);
      phaseLabel = '2. Position Cutter Above Crown';
    } else if (p < 0.65) {
      const t = smoothstep((p - 0.38) / 0.27);
      tipX = dims.pickupRadius;
      // Stops safely above table surface (appleRadius * 0.55)
      tipY = lerp(0.56, appleCenterY * 0.62, t);
      cutterBladeDrop = t;
      appleSplitProgress = smoothstep((t - 0.28) / 0.72);
      phaseLabel = t > 0.55 ? '4. Apple Splits into Two Halves' : '3. Downward Conceptual Cut';
    } else if (p < 0.85) {
      const t = smoothstep((p - 0.65) / 0.2);
      tipX = dims.pickupRadius;
      tipY = lerp(appleCenterY * 0.62, 0.98, t);
      cutterBladeDrop = 1 - t;
      appleSplitProgress = 1;
      phaseLabel = '5. Retract Cutter Safely';
    } else {
      const t = smoothstep((p - 0.85) / 0.15);
      tipX = lerp(dims.pickupRadius, 1.15, t);
      tipY = lerp(0.98, 1.25, t);
      appleSplitProgress = 1;
      phaseLabel = '5. Return to Ready Clearance';
    }

    const joints = solveRobotArmIk([tipX, tipY, tipZ], 0, dims);
    const fk = computeRobotForwardKinematics(joints, dims);

    return {
      sequenceId,
      progress: p,
      phaseLabel,
      activeTool: 'cutter',
      joints,
      toolTipPosition: fk.toolTipPos,
      gripperOpenAmount: 0,
      isAppleGrasped: false,
      applePosition: [dims.pickupRadius, appleCenterY, 0],
      appleYawRad: 0,
      appleSplitProgress,
      cutterBladeDrop,
      pickupPadPosition: pickupPad,
      targetPadPosition: targetPad,
    };
  }

  // Sequence A: Pick, Turn 90°, Place
  const liftY = 0.96;
  const homeTip: readonly [number, number, number] = [1.05, 1.22, 0];

  let tipX = homeTip[0];
  let tipY = homeTip[1];
  let tipZ = homeTip[2];
  let gripperOpenAmount = 1.0;
  let isAppleGrasped = false;
  let applePosition: readonly [number, number, number] = [dims.pickupRadius, appleCenterY, 0];
  let appleYawRad = 0;
  let phaseLabel = '1. Home Ready Pose';

  if (p < 0.1) {
    phaseLabel = '1. Home Ready Pose';
    tipX = homeTip[0];
    tipY = homeTip[1];
    tipZ = 0;
    gripperOpenAmount = 1.0;
  } else if (p < 0.22) {
    const t = smoothstep((p - 0.1) / 0.12);
    phaseLabel = '2. Reach Above Apple';
    tipX = lerp(homeTip[0], dims.pickupRadius, t);
    tipY = lerp(homeTip[1], 0.72, t);
  } else if (p < 0.32) {
    const t = smoothstep((p - 0.22) / 0.1);
    phaseLabel = '3. Align Gripper Around Apple';
    tipX = dims.pickupRadius;
    tipY = lerp(0.72, appleCenterY, t);
  } else if (p < 0.4) {
    const t = smoothstep((p - 0.32) / 0.08);
    phaseLabel = '4. Close Parallel Gripper';
    tipX = dims.pickupRadius;
    tipY = appleCenterY;
    gripperOpenAmount = lerp(1.0, 0.26, t);
    isAppleGrasped = t >= 0.45;
  } else if (p < 0.52) {
    const t = smoothstep((p - 0.4) / 0.12);
    phaseLabel = '5. Lift Apple Clear of Worktable';
    tipX = dims.pickupRadius;
    tipY = lerp(appleCenterY, liftY, t);
    gripperOpenAmount = 0.26;
    isAppleGrasped = true;
  } else if (p < 0.7) {
    const t = smoothstep((p - 0.52) / 0.18);
    const angle = lerp(0, turnRad, t);
    phaseLabel = `6. Turn Base ${Math.round(clampedTurnDeg)}°`;
    tipX = dims.pickupRadius * Math.cos(angle);
    tipZ = dims.pickupRadius * Math.sin(angle);
    tipY = liftY;
    gripperOpenAmount = 0.26;
    isAppleGrasped = true;
    appleYawRad = angle;
  } else if (p < 0.8) {
    const t = smoothstep((p - 0.7) / 0.1);
    phaseLabel = '7. Lower Apple to Target Pad';
    tipX = targetPad[0];
    tipZ = targetPad[2];
    tipY = lerp(liftY, appleCenterY, t);
    gripperOpenAmount = 0.26;
    isAppleGrasped = true;
    appleYawRad = turnRad;
  } else if (p < 0.87) {
    const t = smoothstep((p - 0.8) / 0.07);
    phaseLabel = '8. Open Gripper & Release';
    tipX = targetPad[0];
    tipZ = targetPad[2];
    tipY = appleCenterY;
    gripperOpenAmount = lerp(0.26, 1.0, t);
    isAppleGrasped = t < 0.35;
    appleYawRad = turnRad;
    applePosition = [targetPad[0], appleCenterY, targetPad[2]];
  } else if (p < 0.94) {
    const t = smoothstep((p - 0.87) / 0.07);
    phaseLabel = '9. Lift Clear of Released Apple';
    tipX = targetPad[0];
    tipZ = targetPad[2];
    tipY = lerp(appleCenterY, 0.92, t);
    gripperOpenAmount = 1.0;
    isAppleGrasped = false;
    appleYawRad = turnRad;
    applePosition = [targetPad[0], appleCenterY, targetPad[2]];
  } else {
    const t = smoothstep((p - 0.94) / 0.06);
    const angle = lerp(turnRad, 0, t);
    const radius = lerp(dims.pickupRadius, homeTip[0], t);
    phaseLabel = '10. Return to Resting Pose';
    tipX = radius * Math.cos(angle);
    tipZ = radius * Math.sin(angle);
    tipY = lerp(0.92, homeTip[1], t);
    gripperOpenAmount = 1.0;
    isAppleGrasped = false;
    appleYawRad = turnRad;
    applePosition = [targetPad[0], appleCenterY, targetPad[2]];
  }

  const joints = solveRobotArmIk([tipX, tipY, tipZ], -jointsRollOffset(isAppleGrasped, appleYawRad), dims);
  const fk = computeRobotForwardKinematics(joints, dims);

  if (isAppleGrasped) {
    applePosition = [
      fk.toolTipPos[0],
      Math.max(appleCenterY, fk.toolTipPos[1]),
      fk.toolTipPos[2],
    ];
  }

  return {
    sequenceId,
    progress: p,
    phaseLabel,
    activeTool: 'gripper',
    joints,
    toolTipPosition: fk.toolTipPos,
    gripperOpenAmount,
    isAppleGrasped,
    applePosition,
    appleYawRad,
    appleSplitProgress: 0,
    cutterBladeDrop: 0,
    pickupPadPosition: pickupPad,
    targetPadPosition: targetPad,
  };
}

function jointsRollOffset(isGrasped: boolean, appleYawRad: number): number {
  return isGrasped ? appleYawRad * 0.1 : 0;
}
