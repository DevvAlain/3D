'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

export interface CameraFitTarget {
  z: number;
  y: number;
  fov: number;
}

/**
 * Pure stage camera framing helper ensuring all N config-driven digit slots,
 * pedestal, gold cage, velvet curtains, and rose window remain inside frame.
 */
export function computeStageCameraFit(params: {
  digits: number;
  aspect: number;
}): CameraFitTarget {
  const safeDigits = Math.max(3, Math.min(8, params.digits));
  const safeAspect = Math.max(0.65, Math.min(2.4, params.aspect || 16 / 9));

  // Extra span needed horizontally when N > 5 or viewport is narrower than 16:9
  const digitPullback = Math.max(0, safeDigits - 4) * 0.48;
  const aspectPullback = safeAspect < 1.5 ? (1.5 - safeAspect) * 3.1 : 0;

  return {
    z: 7.45 + digitPullback + aspectPullback,
    y: 0.72 + Math.max(0, safeDigits - 5) * 0.08,
    fov: safeAspect < 1.25 ? 48 : 42,
  };
}

interface StageCameraRigProps {
  digits: number;
  measureFps: boolean;
  onFpsSample: (fps: number) => void;
}

export function StageCameraRig({
  digits,
  measureFps,
  onFpsSample,
}: StageCameraRigProps) {
  const { camera, size } = useThree();
  const lookAtTarget = React.useMemo(() => new THREE.Vector3(0, 0.32, 0.25), []);
  const frameCountRef = React.useRef(0);
  const accumTimeRef = React.useRef(0);

  const aspect = size.height > 0 ? size.width / size.height : 16 / 9;
  const fit = React.useMemo(
    () => computeStageCameraFit({ digits, aspect }),
    [digits, aspect]
  );

  React.useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - fit.fov) > 0.1) {
      camera.fov = fit.fov;
      camera.updateProjectionMatrix();
    }
  }, [camera, fit.fov]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;

    // Gentle cathedral stage breath for depth without unsettling projector viewers
    const targetX = Math.sin(t * 0.32) * 0.14;
    const targetY = fit.y + Math.sin(t * 0.45 + 0.8) * 0.06;
    const targetZ = fit.z;

    const damp = 1 - Math.exp(-3.2 * dt);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, damp);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, damp);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, damp);
    camera.lookAt(lookAtTarget);

    if (measureFps && delta > 0) {
      frameCountRef.current += 1;
      accumTimeRef.current += delta;
      if (accumTimeRef.current >= 0.45) {
        const avgFps = Math.round(frameCountRef.current / accumTimeRef.current);
        onFpsSample(avgFps);
        frameCountRef.current = 0;
        accumTimeRef.current = 0;
      }
    }
  });

  return null;
}
