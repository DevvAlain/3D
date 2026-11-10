'use client';

import * as React from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import type { DisplayController } from '@/hooks/useDisplayController';
import { DisplayStageChrome } from '@/components/display/DisplayStageChrome';
import { StainedGlassBackdrop } from '@/components/three/StainedGlassBackdrop';
import { LotteryCageAndBalls } from '@/components/three/LotteryCageAndBalls';
import { DigitSlots3D } from '@/components/three/DigitSlots3D';
import { StageCameraRig } from '@/components/three/StageCameraRig';

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
  const isHigh = controller.quality === 'high';
  const currentTicket = controller.state.currentDraw?.ticket ?? null;
  const isSpinBoost =
    controller.isAnimating || Boolean(controller.state.currentDraw);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#060918]">
      <CanvasErrorBoundary onError={controller.handleWebGLContextLost}>
        <Canvas
          className="h-full w-full"
          dpr={isHigh ? [1, 2] : [1, 1.5]}
          shadows={isHigh}
          camera={{ position: [0, 0.75, 7.9], fov: 42, near: 0.1, far: 50 }}
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
          <color attach="background" args={['#060918']} />
          <fog attach="fog" args={['#060918', 11, 24]} />

          {/* Sanctuary Lighting: Overhead Spotlight + Dual Gold Rim Lights */}
          <ambientLight intensity={0.44} color="#D4E1FF" />
          <hemisphereLight args={['#FFE8B3', '#160B2E', 0.58]} />

          <spotLight
            position={[0, 7.6, 4.4]}
            angle={0.56}
            penumbra={0.72}
            intensity={80}
            color="#FFF2D2"
            castShadow={isHigh}
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0004}
          />

          {/* Left & Right Gold Rim Lights */}
          <pointLight
            position={[-4.2, 2.6, -1.6]}
            intensity={28}
            distance={14}
            color="#FFD062"
          />
          <pointLight
            position={[4.2, 2.6, -1.6]}
            intensity={28}
            distance={14}
            color="#FFD062"
          />

          {/* Soft Warm Rose-Window Sanctuary Backlight */}
          <pointLight
            position={[0, 2.4, -4.1]}
            intensity={22}
            distance={12}
            color={primaryColor}
          />

          {/* Foreground Lectern Warm Fill */}
          <pointLight
            position={[0, 0.25, 4.8]}
            intensity={9}
            distance={8}
            color="#FFEAB8"
          />

          <StageCameraRig
            digits={digits}
            measureFps={controller.showFps}
            onFpsSample={setFps}
          />

          <StainedGlassBackdrop
            quality={controller.quality}
            primaryColor={primaryColor}
          />

          <React.Suspense fallback={null}>
            <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
              <LotteryCageAndBalls
                quality={controller.quality}
                isSpinBoost={isSpinBoost}
              />
            </Physics>
          </React.Suspense>

          <DigitSlots3D
            digits={digits}
            currentTicket={currentTicket}
            revealedDigits={controller.revealedDigits}
          />

          {isHigh ? (
            <EffectComposer multisampling={0}>
              <Bloom
                mipmapBlur
                luminanceThreshold={0.85}
                intensity={0.44}
              />
              <Vignette eskil={false} offset={0.28} darkness={0.48} />
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
