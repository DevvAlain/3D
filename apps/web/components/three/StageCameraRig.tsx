'use client';

import * as React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { RevealTimelineSnapshot } from '@/lib/reveal-timeline';

export interface CameraFitTarget {
  z: number;
  y: number;
  fov: number;
}

/**
 * Pure stage camera framing helper ensuring all N config-driven digit slots,
 * pedestal, gold cage, velvet curtains, and rose window remain cleanly inside frame
 * with comfortable bottom clearance on both 16:9 and 4:3 displays.
 */
export function computeStageCameraFit(params: {
  digits: number;
  aspect: number;
}): CameraFitTarget {
  const safeDigits = Math.max(3, Math.min(8, params.digits));
  const safeAspect = Math.max(0.65, Math.min(2.4, params.aspect || 16 / 9));

  const digitPullback = Math.max(0, safeDigits - 4) * 0.48;
  const aspectPullback = safeAspect < 1.55 ? (1.55 - safeAspect) * 3.8 : 0;

  return {
    z: 8.25 + digitPullback + aspectPullback,
    y: 0.85 + Math.max(0, safeDigits - 5) * 0.08,
    fov: safeAspect < 1.38 ? 47 : 42,
  };
}

interface StageCameraRigProps {
  digits: number;
  measureFps: boolean;
  onFpsSample: (fps: number) => void;
  revealTimelineRef: React.MutableRefObject<RevealTimelineSnapshot>;
}

export function StageCameraRig({
  digits,
  measureFps,
  onFpsSample,
  revealTimelineRef,
}: StageCameraRigProps) {
  const { camera, size } = useThree();
  const lookAtTarget = React.useMemo(() => new THREE.Vector3(0, 0.24, 0.25), []);
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
    const timeline = revealTimelineRef.current;

    // Gentle cathedral stage breath + subtle suspense pull-in on last digit
    const suspensePush = timeline.stageDimFactor * 0.42;
    const burstPull = timeline.finalBurstStrength * 0.25;
    const targetX = Math.sin(t * 0.32) * (0.14 * (1 - timeline.stageDimFactor * 0.65));
    const targetY = fit.y + Math.sin(t * 0.45 + 0.8) * 0.055;
    const targetZ = fit.z - suspensePush + burstPull;

    const damp = 1 - Math.exp(-3.4 * dt);
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
