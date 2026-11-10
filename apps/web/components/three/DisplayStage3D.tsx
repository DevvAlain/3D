'use client';

import * as React from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import type { DisplayController } from '@/hooks/useDisplayController';
import type { RevealTimelineSnapshot } from '@/lib/reveal-timeline';
import { DisplayStageChrome } from '@/components/display/DisplayStageChrome';
import { StainedGlassBackdrop } from '@/components/three/StainedGlassBackdrop';
import { LotteryCageAndBalls } from '@/components/three/LotteryCageAndBalls';
import { DigitSlots3D } from '@/components/three/DigitSlots3D';
import { StageCameraRig } from '@/components/three/StageCameraRig';
import { VictoryEffects3D } from '@/components/three/VictoryEffects3D';
import { getStageThemeSpec, type StageThemeSpec } from '@/components/three/stage-themes';

interface CanvasErrorBoundaryProps {
  onError: () => void;
  children: React.ReactNode;
}

interface CanvasErrorBoundaryState {
  hasError: boolean;
}

class CanvasErrorBoundary extends React.Component<
  CanvasErrorBoundaryProps,
  CanvasErrorBoundaryState
> {
  state: CanvasErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CanvasErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(): void {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface StageLightingRigProps {
  isHigh: boolean;
  isLight: boolean;
  primaryColor: string;
  themeSpec: StageThemeSpec;
  revealTimelineRef: React.MutableRefObject<RevealTimelineSnapshot>;
}

/**
 * Dynamically dims fill & rim illumination during last-digit suspense,
 * focusing a dramatic warm beam on the lottery cage before erupting bright on finale.
 */
function StageLightingRig({
  isHigh,
  isLight,
  primaryColor,
  themeSpec,
  revealTimelineRef,
}: StageLightingRigProps) {
  const ambientRef = React.useRef<THREE.AmbientLight>(null);
  const hemiRef = React.useRef<THREE.HemisphereLight>(null);
  const spotRef = React.useRef<THREE.SpotLight>(null);
  const leftRimRef = React.useRef<THREE.PointLight>(null);
  const rightRimRef = React.useRef<THREE.PointLight>(null);
  const roseBackRef = React.useRef<THREE.PointLight>(null);
  const lecternFillRef = React.useRef<THREE.PointLight>(null);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const k = 1 - Math.exp(-7.5 * dt);
    const { stageDimFactor, finalBurstStrength } = revealTimelineRef.current;

    const fillScale = 1 - stageDimFactor * 0.88 + finalBurstStrength * 0.45;
    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.lerp(
        ambientRef.current.intensity,
        (isLight ? 0.72 : 0.48) * fillScale,
        k
      );
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = THREE.MathUtils.lerp(
        hemiRef.current.intensity,
        (isLight ? 0.88 : 0.64) * fillScale,
        k
      );
    }
    if (spotRef.current) {
      // Overhead spotlight tightens onto the cage during tense final-digit spotlight moment
      const spotTarget = 84 * (1 + stageDimFactor * 0.55 + finalBurstStrength * 0.65);
      const angleTarget = 0.56 - stageDimFactor * 0.28 + finalBurstStrength * 0.08;
      spotRef.current.intensity = THREE.MathUtils.lerp(spotRef.current.intensity, spotTarget, k);
      spotRef.current.angle = THREE.MathUtils.lerp(spotRef.current.angle, angleTarget, k);
    }
    if (leftRimRef.current) {
      leftRimRef.current.intensity = THREE.MathUtils.lerp(
        leftRimRef.current.intensity,
        30 * (1 - stageDimFactor * 0.85 + finalBurstStrength * 0.5),
        k
      );
    }
    if (rightRimRef.current) {
      rightRimRef.current.intensity = THREE.MathUtils.lerp(
        rightRimRef.current.intensity,
        30 * (1 - stageDimFactor * 0.85 + finalBurstStrength * 0.5),
        k
      );
    }
    if (roseBackRef.current) {
      roseBackRef.current.intensity = THREE.MathUtils.lerp(
        roseBackRef.current.intensity,
        24 * (1 - stageDimFactor * 0.78 + finalBurstStrength * 0.85),
        k
      );
    }
    if (lecternFillRef.current) {
      lecternFillRef.current.intensity = THREE.MathUtils.lerp(
        lecternFillRef.current.intensity,
        12 * (1 - stageDimFactor * 0.42 + finalBurstStrength * 1.1),
        k
      );
    }
  });

  return (
    <>
      <ambientLight
        ref={ambientRef}
        intensity={isLight ? 0.72 : 0.48}
        color={themeSpec.ambientLightColor}
      />
      <hemisphereLight
        ref={hemiRef}
        args={[themeSpec.hemiSkyColor, themeSpec.hemiGroundColor, isLight ? 0.88 : 0.64]}
      />

      <spotLight
        ref={spotRef}
        position={[0, 7.6, 4.4]}
        angle={0.56}
        penumbra={0.72}
        intensity={84}
        color="#FFF2D2"
        castShadow={isHigh}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />

      {!isLight ? (
        <>
          <pointLight
            ref={leftRimRef}
            position={[-4.2, 2.6, -1.6]}
            intensity={30}
            distance={14}
            color={themeSpec.rimLightColor}
          />
          <pointLight
            ref={rightRimRef}
            position={[4.2, 2.6, -1.6]}
            intensity={30}
            distance={14}
            color={themeSpec.rimLightColor}
          />
        </>
      ) : null}

      <pointLight
        ref={roseBackRef}
        position={[0, 2.4, -4.1]}
        intensity={24}
        distance={12}
        color={primaryColor}
      />

      <pointLight
        ref={lecternFillRef}
        position={[0, 0.3, 4.8]}
        intensity={12}
        distance={9}
        color="#FFEAB8"
      />
    </>
  );
}

interface DisplayStage3DProps {
  controller: DisplayController;
}

export function DisplayStage3D({ controller }: DisplayStage3DProps) {
  const [fps, setFps] = React.useState<number | null>(null);
  const cleanupContextListenerRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    return () => {
      cleanupContextListenerRef.current?.();
      cleanupContextListenerRef.current = null;
    };
  }, []);

  const event = controller.state.event;
  const digits = event?.digits ?? 5;
  const primaryColor = event?.primary_color || '#F5C451';
  const themeSpec = React.useMemo(
    () => getStageThemeSpec(event?.theme, primaryColor),
    [event?.theme, primaryColor]
  );

  const isHigh = controller.quality === 'high';
  const isLight = controller.quality === 'light';
  const currentTicket = controller.state.currentDraw?.ticket ?? null;
  const isSpinBoost =
    controller.isAnimating || Boolean(controller.state.currentDraw);

  return (
    <div
      data-stage-theme={themeSpec.id}
      className="relative h-screen w-screen overflow-hidden"
      style={{ backgroundColor: themeSpec.skyColor }}
    >
      <CanvasErrorBoundary onError={controller.handleWebGLContextLost}>
        <Canvas
          className="h-full w-full"
          dpr={isHigh ? [1, 2] : isLight ? 1 : [1, 1.5]}
          shadows={isHigh}
          camera={{ position: [0, 0.85, 8.73], fov: 42, near: 0.1, far: 50 }}
          gl={{
            antialias: true,
            powerPreference: 'high-performance',
            alpha: false,
            stencil: false,
          }}
          onCreated={({ gl }) => {
            const canvas = gl.domElement;
            const handleLost = (e: Event) => {
              e.preventDefault();
              controller.handleWebGLContextLost();
            };
            canvas.addEventListener('webglcontextlost', handleLost, false);
            cleanupContextListenerRef.current?.();
            cleanupContextListenerRef.current = () => {
              canvas.removeEventListener('webglcontextlost', handleLost, false);
            };
          }}
        >
          <color attach="background" args={[themeSpec.skyColor]} />
          <fog attach="fog" args={[themeSpec.fogColor, 11, 25]} />

          {/* Procedural Sanctuary Cubemap Reflections (skipped in Light 3D for maximum FPS) */}
          {!isLight ? (
            <Environment resolution={128} frames={1}>
              <Lightformer
                form="ring"
                intensity={2.4}
                color="#FFE9A8"
                scale={[6, 6, 1]}
                position={[0, 5.5, 2]}
                rotation={[Math.PI / 2, 0, 0]}
              />
              <Lightformer
                form="circle"
                intensity={2.2}
                color={primaryColor}
                scale={5}
                position={[0, 2.5, -5.5]}
              />
              <Lightformer
                form="rect"
                intensity={1.7}
                color={themeSpec.rosePetals[0]}
                scale={[3.2, 5, 1]}
                position={[-5.5, 2, -1]}
                rotation={[0, Math.PI / 2.2, 0]}
              />
              <Lightformer
                form="rect"
                intensity={1.7}
                color={themeSpec.rosePetals[1]}
                scale={[3.2, 5, 1]}
                position={[5.5, 2, -1]}
                rotation={[0, -Math.PI / 2.2, 0]}
              />
            </Environment>
          ) : null}

          <StageLightingRig
            isHigh={isHigh}
            isLight={isLight}
            primaryColor={primaryColor}
            themeSpec={themeSpec}
            revealTimelineRef={controller.revealTimelineRef}
          />

          <StageCameraRig
            digits={digits}
            quality={controller.quality}
            onFpsSample={setFps}
            onAutoDowngradeQuality={controller.handleAutoDowngradeQuality}
            revealTimelineRef={controller.revealTimelineRef}
          />

          <StainedGlassBackdrop
            quality={controller.quality}
            primaryColor={primaryColor}
            themeSpec={themeSpec}
            revealTimelineRef={controller.revealTimelineRef}
          />

          <React.Suspense fallback={null}>
            <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
              <LotteryCageAndBalls
                quality={controller.quality}
                isSpinBoost={isSpinBoost}
                digits={digits}
                activeRevealTicketDigits={controller.activeRevealTicketDigits}
                themeSpec={themeSpec}
                revealTimelineRef={controller.revealTimelineRef}
              />
            </Physics>
          </React.Suspense>

          <DigitSlots3D
            digits={digits}
            currentTicket={currentTicket}
            revealedDigits={controller.revealedDigits}
            isFinalReveal={controller.isFinalRevealVisible}
            themeSpec={themeSpec}
            revealTimelineRef={controller.revealTimelineRef}
          />

          <VictoryEffects3D
            burstKey={controller.confettiBurstKey}
            palette={themeSpec.confettiPalette}
          />

          {isHigh ? (
            <EffectComposer multisampling={0}>
              <Bloom
                mipmapBlur
                luminanceThreshold={0.9}
                intensity={0.36}
              />
              <Vignette eskil={false} offset={0.28} darkness={0.42} />
            </EffectComposer>
          ) : null}
        </Canvas>
      </CanvasErrorBoundary>

      <DisplayStageChrome
        controller={controller}
        variant="3d"
        fpsValue={fps}
      />
    </div>
  );
}
