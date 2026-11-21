import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeRobotForwardKinematics,
  evaluateRobotArmSequence,
  ROBOT_ARM_DIMENSIONS,
  ROBOT_JOINT_LIMITS,
  solveRobotArmIk,
} from './robotArmKinematics.ts';

describe('robotArmKinematics', () => {
  it('solves inverse kinematics accurately within joint limits and without table penetration', () => {
    const target: readonly [number, number, number] = [1.85, 0.22, 0];
    const joints = solveRobotArmIk(target);

    assert.ok(
      joints.shoulderPitchRad >= ROBOT_JOINT_LIMITS.shoulderPitch[0] &&
        joints.shoulderPitchRad <= ROBOT_JOINT_LIMITS.shoulderPitch[1],
    );
    assert.ok(
      joints.elbowPitchRad >= ROBOT_JOINT_LIMITS.elbowPitch[0] &&
        joints.elbowPitchRad <= ROBOT_JOINT_LIMITS.elbowPitch[1],
    );

    const fk = computeRobotForwardKinematics(joints);
    const err = Math.hypot(
      fk.toolTipPos[0] - target[0],
      fk.toolTipPos[1] - target[1],
      fk.toolTipPos[2] - target[2],
    );
    assert.ok(err < 0.02, `Expected IK/FK error < 0.02, got ${err}`);
    assert.ok(fk.toolTipPos[1] >= 0, 'Tool tip must never penetrate worktable surface');
  });

  it('executes Sequence A (Pick, Turn 90 deg, Place) cleanly moving apple from pickup to 90 deg target pad', () => {
    const startPose = evaluateRobotArmSequence('sequence-a-pick-place', 0.0, 90);
    const graspPose = evaluateRobotArmSequence('sequence-a-pick-place', 0.45, 90);
    const turnedPose = evaluateRobotArmSequence('sequence-a-pick-place', 0.72, 90);
    const placedPose = evaluateRobotArmSequence('sequence-a-pick-place', 0.9, 90);

    assert.equal(startPose.activeTool, 'gripper');
    assert.equal(startPose.isAppleGrasped, false);
    assert.ok(Math.abs(startPose.applePosition[0] - ROBOT_ARM_DIMENSIONS.pickupRadius) < 0.01);
    assert.ok(Math.abs(startPose.applePosition[2]) < 0.01);

    assert.equal(graspPose.isAppleGrasped, true);
    assert.ok(graspPose.applePosition[1] > ROBOT_ARM_DIMENSIONS.appleRadius + 0.15);

    // Base yaw turns 90 degrees (+PI/2)
    assert.ok(Math.abs(turnedPose.joints.baseYawRad - Math.PI / 2) < 0.05);

    // After placement & release, apple rests cleanly on 90-degree target pad without penetrating table
    assert.equal(placedPose.isAppleGrasped, false);
    assert.ok(Math.abs(placedPose.applePosition[0]) < 0.05);
    assert.ok(Math.abs(placedPose.applePosition[2] - ROBOT_ARM_DIMENSIONS.pickupRadius) < 0.05);
    assert.ok(placedPose.applePosition[1] >= ROBOT_ARM_DIMENSIONS.appleRadius - 0.001);

    // Sweep entire timeline verifying no table penetration
    for (let i = 0; i <= 40; i += 1) {
      const s = evaluateRobotArmSequence('sequence-a-pick-place', i / 40, 90);
      assert.ok(s.toolTipPosition[1] >= 0.08, `Tool tip penetrated table at step ${i}`);
      assert.ok(
        s.applePosition[1] >= ROBOT_ARM_DIMENSIONS.appleRadius - 0.001,
        `Apple penetrated table at step ${i}`,
      );
    }
  });

  it('executes Sequence B with dedicated cutter tool and splits apple cleanly into two halves', () => {
    const preCut = evaluateRobotArmSequence('sequence-b-cut', 0.25);
    const midCut = evaluateRobotArmSequence('sequence-b-cut', 0.58);
    const postCut = evaluateRobotArmSequence('sequence-b-cut', 0.9);

    assert.equal(preCut.activeTool, 'cutter');
    assert.equal(preCut.appleSplitProgress, 0);
    assert.ok(midCut.appleSplitProgress > 0.4);
    assert.equal(postCut.appleSplitProgress, 1);
    assert.ok(postCut.toolTipPosition[1] > 0.85, 'Cutter must retract safely after cutting');
  });
});
