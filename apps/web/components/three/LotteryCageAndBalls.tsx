'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  BallCollider,
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from '@react-three/rapier';
import type { DisplayQualityPreset } from '@/lib/quality-monitor';
import type { RevealTimelineSnapshot } from '@/lib/reveal-timeline';
import type { StageThemeSpec } from '@/components/three/stage-themes';
import {
  createBallDigitTexture,
  disposeTextureList,
} from '@/components/three/textures';
import {
  buildBallSpawnPositions,
  CAGE_BOUNDARY_RADIUS,
  CAGE_CENTER,
  CAGE_RADIUS,
  isPointOutsideBoundary,
  isRigidBodyLive,
  WALL_THICKNESS,
} from '@/components/three/rapier-guards';
import {
  CHUTE_SPLINE_COORDS,
  computeDigitSlotWorldPosition,
} from '@/components/three/stage-layout';

interface LotteryCageAndBallsProps {
  quality: DisplayQualityPreset;
  isSpinBoost: boolean;
  digits: number;
  activeRevealTicketDigits: number[];
  themeSpec: StageThemeSpec;
  revealTimelineRef: React.MutableRefObject<RevealTimelineSnapshot>;
}

// Build 26 evenly spaced unit normals (6 faces + 12 edges + 8 corners of a cube)
// so inward tangent cuboids create a smooth leak-proof rotating hollow sphere.
const CAGE_WALL_NORMALS: Array<{
  pos: [number, number, number];
  rot: [number, number, number];
}> = (() => {
  const dirs: THREE.Vector3[] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        dirs.push(new THREE.Vector3(x, y, z).normalize());
      }
    }
  }
  const up = new THREE.Vector3(0, 1, 0);
  const offsetDist = CAGE_RADIUS + WALL_THICKNESS / 2;

  return dirs.map((n) => {
    const pos: [number, number, number] = [
      n.x * offsetDist,
      n.y * offsetDist,
      n.z * offsetDist,
    ];
    const q = new THREE.Quaternion().setFromUnitVectors(up, n);
    if (n.y < -0.9999 && Math.abs(n.x) < 1e-6 && Math.abs(n.z) < 1e-6) {
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    }
    const euler = new THREE.Euler().setFromQuaternion(q);
    return {
      pos,
      rot: [euler.x, euler.y, euler.z],
    };
  });
})();

interface LotteryBallBodyProps {
  id: number;
  position: [number, number, number];
  radius: number;
  texture: THREE.CanvasTexture;
  envIntensity: number;
  isLight: boolean;
  registerBody: (id: number, body: RapierRigidBody | null) => void;
}

const LotteryBallBody = React.memo(function LotteryBallBody({
  id,
  position,
  radius,
  texture,
  envIntensity,
  isLight,
  registerBody,
}: LotteryBallBodyProps) {
  const handleRef = React.useCallback(
    (body: RapierRigidBody | null) => {
      registerBody(id, body);
    },
    [id, registerBody]
  );

  React.useEffect(() => {
    return () => {
      registerBody(id, null);
    };
  }, [id, registerBody]);

  return (
    <RigidBody
      ref={handleRef}
      position={position}
      colliders={false}
      restitution={0.48}
      friction={0.28}
      linearDamping={0.15}
      angularDamping={0.22}
      ccd
    >
      <BallCollider key={`col-${radius}`} args={[radius]} />
      <mesh castShadow={!isLight} receiveShadow={!isLight}>
        <sphereGeometry args={[radius, isLight ? 14 : 24, isLight ? 10 : 18]} />
        {isLight ? (
          <meshStandardMaterial
            map={texture}
            roughness={0.24}
            metalness={0.1}
          />
        ) : (
          <meshPhysicalMaterial
            map={texture}
            roughness={0.09}
            metalness={0.08}
            clearcoat={1.0}
            clearcoatRoughness={0.06}
            reflectivity={0.95}
            envMapIntensity={envIntensity}
          />
        )}
      </mesh>
    </RigidBody>
  );
});

export function LotteryCageAndBalls({
  quality,
  isSpinBoost,
  digits,
  activeRevealTicketDigits,
  themeSpec,
  revealTimelineRef,
}: LotteryCageAndBallsProps) {
  const cageBodyRef = React.useRef<RapierRigidBody | null>(null);
  const visualCageRef = React.useRef<THREE.Group>(null);
  const revealBallGroupRef = React.useRef<THREE.Group>(null);
  const revealBallMeshRef = React.useRef<THREE.Mesh>(null);
  const revealBallMatRef = React.useRef<THREE.MeshPhysicalMaterial>(null);
  const ballBodiesRef = React.useRef<Map<number, RapierRigidBody>>(new Map());
  const spinAngleRef = React.useRef<number>(0);
  const currentSpeedRef = React.useRef<number>(0.72);
  const tempQuatRef = React.useRef(new THREE.Quaternion());
  const spinAxisRef = React.useRef(new THREE.Vector3(1, 0.14, 0.06).normalize());
  const chutePosVecRef = React.useRef(new THREE.Vector3());
  const lastBallTexDigitRef = React.useRef<number>(-1);

  const isLight = quality === 'light';
  const ballCount = quality === 'high' ? 50 : quality === 'medium' ? 40 : 24;
  const ballRadius = quality === 'high' ? 0.188 : quality === 'medium' ? 0.198 : 0.21;
  const ballEnvIntensity = quality === 'high' ? 1.35 : 1.05;

  // Bake 10 crisp stained-glass jewel digit textures once and dispose cleanly
  const digitTextures = React.useMemo(() => {
    return Array.from({ length: 10 }, (_, d) => createBallDigitTexture(d));
  }, []);

  React.useEffect(() => {
    return () => {
      disposeTextureList(digitTextures);
    };
  }, [digitTextures]);

  React.useEffect(() => {
    const bodies = ballBodiesRef.current;
    return () => {
      cageBodyRef.current = null;
      bodies.clear();
    };
  }, []);

  const chuteCurve = React.useMemo(() => {
    return new THREE.CatmullRomCurve3(
      CHUTE_SPLINE_COORDS.map(([x, y, z]) => new THREE.Vector3(x, y, z))
    );
  }, []);

  const chuteGeometry = React.useMemo(() => {
    return new THREE.TubeGeometry(chuteCurve, 28, 0.145, 16, false);
  }, [chuteCurve]);

  React.useEffect(() => {
    return () => {
      chuteGeometry.dispose();
    };
  }, [chuteGeometry]);

  const ballConfigs = React.useMemo(() => {
    const positions = buildBallSpawnPositions(ballCount);
    return positions.map((pos, idx) => ({
      id: idx,
      digit: idx % 10,
      pos,
    }));
  }, [ballCount]);

  const registerBallBody = React.useCallback(
    (id: number, body: RapierRigidBody | null) => {
      if (body) {
        ballBodiesRef.current.set(id, body);
      } else {
        ballBodiesRef.current.delete(id);
      }
    },
    []
  );

  // Pure Three.js animation tick (cage spin + kinematic reveal ball sliding down chute into slot)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const timeline = revealTimelineRef.current;

    const baseIdle = isSpinBoost ? 1.25 : 0.72;
    const timelineMul =
      timeline.phase === 'idle' || timeline.phase === 'complete'
        ? 1
        : timeline.cageSpeedMultiplier;
    const targetSpeed = baseIdle * timelineMul;

    currentSpeedRef.current = THREE.MathUtils.lerp(
      currentSpeedRef.current,
      targetSpeed,
      1 - Math.exp(-5.0 * dt)
    );
    spinAngleRef.current += currentSpeedRef.current * dt;

    tempQuatRef.current.setFromAxisAngle(spinAxisRef.current, spinAngleRef.current);

    if (visualCageRef.current) {
      visualCageRef.current.quaternion.copy(tempQuatRef.current);
    }

    // Update scripted kinematic Extraction Ball (never depends on Rapier physics, works for 11111 too)
    const ballGroup = revealBallGroupRef.current;
    const ballMesh = revealBallMeshRef.current;
    const ballMat = revealBallMatRef.current;
    const active = timeline.activeBall;

    if (ballGroup && ballMesh && ballMat) {
      if (!active || activeRevealTicketDigits.length === 0) {
        ballGroup.visible = false;
      } else {
        const targetDigit = activeRevealTicketDigits[active.digitIndex] ?? 0;
        if (lastBallTexDigitRef.current !== targetDigit) {
          lastBallTexDigitRef.current = targetDigit;
          ballMat.map = digitTextures[targetDigit] ?? digitTextures[0];
          ballMat.needsUpdate = true;
        }

        ballGroup.visible = true;
        if (active.chuteT !== null) {
          // Glides down exact brass chute spline
          chuteCurve.getPointAt(active.chuteT, chutePosVecRef.current);
          ballGroup.position.copy(chutePosVecRef.current);
          ballGroup.scale.setScalar(1.02);
          ballMesh.rotation.set(active.chuteT * Math.PI * 3.5, 0.4, 0);
        } else if (active.arcT !== null) {
          // Parabolic leap from chute mouth into slot `active.digitIndex`
          const endCoord = CHUTE_SPLINE_COORDS[CHUTE_SPLINE_COORDS.length - 1];
          const [slotX, slotY, slotZ] = computeDigitSlotWorldPosition(
            active.digitIndex,
            digits
          );
          const u = active.arcT;
          const x = THREE.MathUtils.lerp(endCoord[0], slotX, u);
          const y =
            THREE.MathUtils.lerp(endCoord[1], slotY, u) + Math.sin(u * Math.PI) * 0.62;
          const z = THREE.MathUtils.lerp(endCoord[2], slotZ, u);

          ballGroup.position.set(x, y, z);
          ballGroup.scale.setScalar(THREE.MathUtils.lerp(1.08, 0.72, u * u));
          // Finish orienting digit medallion clearly toward the camera!
          ballMesh.rotation.set(
            THREE.MathUtils.lerp(0.6, 0, u),
            THREE.MathUtils.lerp(Math.PI * 1.4, -Math.PI / 2, u),
            0
          );
        }
      }
    }
  });

  // Synchronized Rapier step hook: validates every body against active world before WASM calls
  useBeforePhysicsStep((world) => {
    const cageBody = cageBodyRef.current;
    if (isRigidBodyLive(world, cageBody)) {
      const q = tempQuatRef.current;
      cageBody!.setNextKinematicRotation({
        x: q.x,
        y: q.y,
        z: q.z,
        w: q.w,
      });
    } else if (cageBody) {
      cageBodyRef.current = null;
    }

    // Fail-safe boundary check: guarantee zero balls ever escape the sphere
    for (const [id, body] of ballBodiesRef.current) {
      if (!isRigidBodyLive(world, body)) {
        ballBodiesRef.current.delete(id);
        continue;
      }

      const t = body.translation();
      if (isPointOutsideBoundary(t, CAGE_CENTER, CAGE_BOUNDARY_RADIUS)) {
        body.setTranslation(
          { x: CAGE_CENTER[0], y: CAGE_CENTER[1] + 0.15, z: CAGE_CENTER[2] },
          true
        );
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
    }
  });

  return (
    <group>
      {/* Ornate Altar Pedestal & Gold Cradle Supports */}
      <group position={[0, -1.65, 0]}>
        {/* Lower obsidian marble plinth */}
        <mesh position={[0, 0.14, 0]} receiveShadow castShadow={!isLight}>
          <cylinderGeometry args={[2.05, 2.28, 0.28, 8]} />
          <meshStandardMaterial color={themeSpec.pedestalMarbleColor} roughness={0.35} metalness={0.4} />
        </mesh>
        {/* Gold bevel ring */}
        <mesh position={[0, 0.3, 0]} receiveShadow>
          <cylinderGeometry args={[1.92, 2.02, 0.08, 32]} />
          <meshStandardMaterial color="#D4A13A" metalness={0.9} roughness={0.22} />
        </mesh>
        {/* Central sanctuary pedestal column */}
        <mesh position={[0, 0.74, 0]} castShadow={!isLight} receiveShadow>
          <cylinderGeometry args={[1.1, 1.48, 0.84, 12]} />
          <meshStandardMaterial color={themeSpec.pedestalColumnColor} roughness={0.42} metalness={0.32} />
        </mesh>
        {/* Upper gold altar collar */}
        <mesh position={[0, 1.19, 0]} castShadow>
          <cylinderGeometry args={[1.38, 1.18, 0.12, 32]} />
          <meshStandardMaterial color="#E5B94C" metalness={0.9} roughness={0.2} />
        </mesh>

        {/* Left & Right Curved Brass Cradle Pillars holding the axle at CAGE_CENTER[1] = 1.24 (relative +2.89) */}
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh
              position={[side * 1.32, 2.03, 0]}
              rotation={[0, 0, -side * 0.24]}
              castShadow
            >
              <cylinderGeometry args={[0.075, 0.11, 1.88, 16]} />
              <meshStandardMaterial color="#D4A13A" metalness={0.9} roughness={0.22} />
            </mesh>
            {/* Axle bearing cap */}
            <mesh position={[side * 1.56, 2.89, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.14, 0.14, 0.18, 20]} />
              <meshStandardMaterial color="#F5C451" metalness={0.92} roughness={0.18} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Gold Exit Chute & Catch Tray (elevated cleanly above middle digit plaque) */}
      <group>
        <mesh geometry={chuteGeometry} castShadow>
          <meshStandardMaterial
            color="#E0AE3E"
            metalness={0.88}
            roughness={0.22}
            emissive="#543608"
            emissiveIntensity={0.18}
          />
        </mesh>
        {/* Chute exit bezel */}
        <mesh position={[0, -0.36, 1.88]} rotation={[Math.PI / 3.4, 0, 0]}>
          <torusGeometry args={[0.165, 0.032, 12, 28]} />
          <meshStandardMaterial color="#FCE08B" metalness={0.92} roughness={0.18} />
        </mesh>
        {/* Catch tray dish below chute mouth */}
        <mesh position={[0, -0.52, 1.92]} receiveShadow castShadow>
          <cylinderGeometry args={[0.34, 0.24, 0.06, 24]} />
          <meshStandardMaterial color="#C8962E" metalness={0.88} roughness={0.24} />
        </mesh>
      </group>

      {/* Kinematic Scripted Reveal Ball (travels chute -> arcs into target digit slot) */}
      <group ref={revealBallGroupRef} visible={false}>
        <pointLight color="#FFE394" intensity={6.5} distance={3.2} />
        <mesh ref={revealBallMeshRef} castShadow>
          <sphereGeometry args={[0.21, 28, 22]} />
          <meshPhysicalMaterial
            ref={revealBallMatRef}
            map={digitTextures[0]}
            roughness={0.08}
            metalness={0.08}
            clearcoat={1.0}
            clearcoatRoughness={0.05}
            reflectivity={0.98}
            envMapIntensity={1.5}
          />
        </mesh>
      </group>

      {/* Kinematic Rotating Cage Sphere Colliders + Internal Agitator Vanes */}
      <RigidBody
        ref={cageBodyRef}
        type="kinematicPosition"
        position={CAGE_CENTER}
        colliders={false}
        restitution={0.42}
        friction={0.35}
      >
        {CAGE_WALL_NORMALS.map((wall, idx) => (
          <CuboidCollider
            key={`wall-${idx}`}
            args={[0.88, WALL_THICKNESS / 2, 0.88]}
            position={wall.pos}
            rotation={wall.rot}
          />
        ))}
        {/* 3 Internal Agitator Vanes scooping balls upward smoothly */}
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, idx) => (
          <CuboidCollider
            key={`vane-${idx}`}
            args={[0.92, 0.045, 0.16]}
            position={[
              0,
              Math.cos(angle) * 1.18,
              Math.sin(angle) * 1.18,
            ]}
            rotation={[angle + 0.35, 0, 0]}
          />
        ))}
      </RigidBody>

      {/* Synchronized Visual Crystal & Ornate Gold Lottery Cage */}
      <group ref={visualCageRef} position={CAGE_CENTER}>
        {/* Crystal-Clear Thin Glass Dome (zero transmission FBO blur or pixelation) */}
        <mesh>
          <sphereGeometry args={[CAGE_RADIUS + 0.03, isLight ? 28 : 48, isLight ? 20 : 36]} />
          {isLight ? (
            <meshStandardMaterial
              color="#E8F1FF"
              transparent
              opacity={0.14}
              roughness={0.15}
              metalness={0.15}
              depthWrite={false}
            />
          ) : (
            <meshPhysicalMaterial
              color="#E8F1FF"
              transparent
              opacity={quality === 'high' ? 0.14 : 0.17}
              roughness={0.04}
              metalness={0.04}
              clearcoat={1.0}
              clearcoatRoughness={0.03}
              ior={1.5}
              reflectivity={1.0}
              envMapIntensity={quality === 'high' ? 1.65 : 1.0}
              depthWrite={false}
            />
          )}
        </mesh>

        {/* Ornate Gold Meridian & Equatorial Rings */}
        <mesh>
          <torusGeometry args={[CAGE_RADIUS + 0.045, 0.045, isLight ? 10 : 16, isLight ? 40 : 64]} />
          <meshStandardMaterial color="#F5C451" metalness={0.92} roughness={0.18} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[CAGE_RADIUS + 0.045, 0.042, isLight ? 10 : 16, isLight ? 40 : 64]} />
          <meshStandardMaterial color="#E5B94C" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[CAGE_RADIUS + 0.045, 0.038, isLight ? 8 : 14, isLight ? 40 : 64]} />
          <meshStandardMaterial color="#D4A13A" metalness={0.9} roughness={0.22} />
        </mesh>

        {/* Internal Visible Gold Agitator Scoops */}
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, idx) => (
          <mesh
            key={`visual-vane-${idx}`}
            position={[0, Math.cos(angle) * 1.18, Math.sin(angle) * 1.18]}
            rotation={[angle + 0.35, 0, 0]}
          >
            <boxGeometry args={[1.72, 0.055, 0.24]} />
            <meshStandardMaterial color="#E8B94B" metalness={0.9} roughness={0.22} />
          </mesh>
        ))}

        {/* Horizontal Axle Rod Finials */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.045, 0.045, (CAGE_RADIUS + 0.16) * 2, 16]} />
          <meshStandardMaterial color="#C89B34" metalness={0.92} roughness={0.2} />
        </mesh>
      </group>

      {/* 24-50 Dynamic Glossy Stained-Glass Jewel Balls (0-9 via CanvasTexture) */}
      {ballConfigs.map((ball) => (
        <LotteryBallBody
          key={ball.id}
          id={ball.id}
          position={ball.pos}
          radius={ballRadius}
          texture={digitTextures[ball.digit]}
          envIntensity={ballEnvIntensity}
          isLight={isLight}
          registerBody={registerBallBody}
        />
      ))}
    </group>
  );
}
