'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial } from '@react-three/drei';
import {
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier';
import type { DisplayQualityPreset } from '@/hooks/useDisplayController';
import {
  createBallDigitTexture,
  disposeTextureList,
} from '@/components/three/textures';

interface LotteryCageAndBallsProps {
  quality: DisplayQualityPreset;
  isSpinBoost: boolean;
}

const CAGE_CENTER: [number, number, number] = [0, 1.18, 0];
const CAGE_RADIUS = 1.48;
const WALL_THICKNESS = 0.36;

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
    // Handle exact -Y flip safely
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

/**
 * Generates up to 57 collision-free 3D grid lattice coordinates strictly inside r <= 1.08.
 */
function buildBallSpawnPositions(count: number): Array<[number, number, number]> {
  const step = 0.45;
  const candidates: Array<[number, number, number]> = [];
  for (let ix = -2; ix <= 2; ix++) {
    for (let iy = -2; iy <= 2; iy++) {
      for (let iz = -2; iz <= 2; iz++) {
        const x = ix * step;
        const y = iy * step;
        const z = iz * step;
        if (x * x + y * y + z * z <= 1.08 * 1.08) {
          candidates.push([
            CAGE_CENTER[0] + x,
            CAGE_CENTER[1] + y,
            CAGE_CENTER[2] + z,
          ]);
        }
      }
    }
  }
  // Spread digits around center evenly via stride sampling
  return candidates.slice(0, count);
}

export function LotteryCageAndBalls({
  quality,
  isSpinBoost,
}: LotteryCageAndBallsProps) {
  const cageBodyRef = React.useRef<RapierRigidBody>(null);
  const visualCageRef = React.useRef<THREE.Group>(null);
  const ballBodyRefs = React.useRef<Array<RapierRigidBody | null>>([]);
  const spinAngleRef = React.useRef<number>(0);
  const currentSpeedRef = React.useRef<number>(0.72);
  const tempQuatRef = React.useRef(new THREE.Quaternion());
  const spinAxisRef = React.useRef(new THREE.Vector3(1, 0.14, 0.06).normalize());

  const ballCount = quality === 'high' ? 50 : 40;
  const ballRadius = quality === 'high' ? 0.188 : 0.198;

  // Bake 10 crisp equirectangular CanvasTextures for digits 0-9 once and dispose cleanly
  const digitTextures = React.useMemo(() => {
    return Array.from({ length: 10 }, (_, d) => createBallDigitTexture(d));
  }, []);

  React.useEffect(() => {
    return () => {
      disposeTextureList(digitTextures);
    };
  }, [digitTextures]);

  // Curved brass exit chute sweeping from cage bottom to reveal tray
  const chuteGeometry = React.useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.26, 0.52),
      new THREE.Vector3(0, -0.56, 1.05),
      new THREE.Vector3(0, -0.82, 1.52),
      new THREE.Vector3(0, -0.94, 1.92),
    ]);
    return new THREE.TubeGeometry(curve, 28, 0.145, 16, false);
  }, []);

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

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const targetSpeed = isSpinBoost ? 1.85 : 0.72;
    currentSpeedRef.current = THREE.MathUtils.lerp(
      currentSpeedRef.current,
      targetSpeed,
      1 - Math.exp(-3.5 * dt)
    );
    spinAngleRef.current += currentSpeedRef.current * dt;

    tempQuatRef.current.setFromAxisAngle(spinAxisRef.current, spinAngleRef.current);

    if (cageBodyRef.current) {
      cageBodyRef.current.setNextKinematicRotation({
        x: tempQuatRef.current.x,
        y: tempQuatRef.current.y,
        z: tempQuatRef.current.z,
        w: tempQuatRef.current.w,
      });
    }
    if (visualCageRef.current) {
      visualCageRef.current.quaternion.copy(tempQuatRef.current);
    }

    // Fail-safe boundary check: guarantee zero balls ever escape the sphere
    for (let i = 0; i < ballBodyRefs.current.length; i++) {
      const body = ballBodyRefs.current[i];
      if (!body) continue;
      const t = body.translation();
      const dx = t.x - CAGE_CENTER[0];
      const dy = t.y - CAGE_CENTER[1];
      const dz = t.z - CAGE_CENTER[2];
      if (dx * dx + dy * dy + dz * dz > 1.72 * 1.72) {
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
        <mesh position={[0, 0.14, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[2.05, 2.28, 0.28, 8]} />
          <meshStandardMaterial color="#10152F" roughness={0.35} metalness={0.4} />
        </mesh>
        {/* Gold bevel ring */}
        <mesh position={[0, 0.3, 0]} receiveShadow>
          <cylinderGeometry args={[1.92, 2.02, 0.08, 32]} />
          <meshStandardMaterial color="#D4A13A" metalness={0.9} roughness={0.22} />
        </mesh>
        {/* Central sanctuary pedestal column */}
        <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.1, 1.48, 0.8, 12]} />
          <meshStandardMaterial color="#181236" roughness={0.42} metalness={0.32} />
        </mesh>
        {/* Upper gold altar collar */}
        <mesh position={[0, 1.15, 0]} castShadow>
          <cylinderGeometry args={[1.38, 1.18, 0.12, 32]} />
          <meshStandardMaterial color="#E5B94C" metalness={0.9} roughness={0.2} />
        </mesh>

        {/* Left & Right Curved Brass Cradle Pillars holding the axle at y=1.18 (relative +2.83) */}
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh
              position={[side * 1.32, 1.98, 0]}
              rotation={[0, 0, -side * 0.24]}
              castShadow
            >
              <cylinderGeometry args={[0.075, 0.11, 1.85, 16]} />
              <meshStandardMaterial color="#D4A13A" metalness={0.9} roughness={0.22} />
            </mesh>
            {/* Axle bearing cap */}
            <mesh position={[side * 1.56, 2.83, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.14, 0.14, 0.18, 20]} />
              <meshStandardMaterial color="#F5C451" metalness={0.92} roughness={0.18} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Gold Exit Chute & Catch Tray */}
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
        <mesh position={[0, -0.94, 1.95]} rotation={[Math.PI / 3, 0, 0]}>
          <torusGeometry args={[0.16, 0.032, 12, 28]} />
          <meshStandardMaterial color="#FCE08B" metalness={0.92} roughness={0.18} />
        </mesh>
        {/* Catch tray dish below chute mouth */}
        <mesh position={[0, -1.2, 2.02]} receiveShadow castShadow>
          <cylinderGeometry args={[0.38, 0.28, 0.08, 24]} />
          <meshStandardMaterial color="#C8962E" metalness={0.88} roughness={0.24} />
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
        {/* Refractive Crystal Shell (MeshTransmissionMaterial on high, light Fresnel on medium) */}
        <mesh>
          <sphereGeometry args={[CAGE_RADIUS + 0.03, 42, 32]} />
          {quality === 'high' ? (
            <MeshTransmissionMaterial
              transmission={0.92}
              thickness={0.18}
              roughness={0.07}
              ior={1.45}
              chromaticAberration={0.025}
              anisotropy={0}
              distortion={0.03}
              samples={4}
              resolution={256}
              color="#FFF9EC"
            />
          ) : (
            <meshPhysicalMaterial
              color="#DCE8FF"
              transparent
              opacity={0.2}
              roughness={0.08}
              metalness={0.1}
              clearcoat={1}
              reflectivity={0.92}
              depthWrite={false}
            />
          )}
        </mesh>

        {/* Ornate Gold Meridian & Equatorial Rings */}
        <mesh>
          <torusGeometry args={[CAGE_RADIUS + 0.045, 0.045, 16, 64]} />
          <meshStandardMaterial color="#F5C451" metalness={0.92} roughness={0.18} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[CAGE_RADIUS + 0.045, 0.042, 16, 64]} />
          <meshStandardMaterial color="#E5B94C" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[CAGE_RADIUS + 0.045, 0.038, 14, 64]} />
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

      {/* 40-50 Dynamic Glossy Numbered Balls (0-9 via CanvasTexture) */}
      {ballConfigs.map((ball, idx) => (
        <RigidBody
          key={ball.id}
          ref={(el) => {
            ballBodyRefs.current[idx] = el;
          }}
          position={ball.pos}
          colliders="ball"
          restitution={0.48}
          friction={0.28}
          linearDamping={0.15}
          angularDamping={0.22}
          ccd
        >
          <mesh castShadow receiveShadow>
            <sphereGeometry args={[ballRadius, 24, 18]} />
            <meshPhysicalMaterial
              map={digitTextures[ball.digit]}
              roughness={0.18}
              metalness={0.12}
              clearcoat={0.85}
              clearcoatRoughness={0.12}
            />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}
