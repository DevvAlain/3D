export const CAGE_CENTER: [number, number, number] = [0, 1.24, 0];
export const CAGE_RADIUS = 1.48;
export const WALL_THICKNESS = 0.36;
export const CAGE_BOUNDARY_RADIUS = 1.72;

export interface RapierRigidBodyLike {
  handle: number;
  isValid?: () => boolean;
  translation: () => { x: number; y: number; z: number };
  setTranslation: (t: { x: number; y: number; z: number }, wakeUp: boolean) => void;
  setLinvel: (v: { x: number; y: number; z: number }, wakeUp: boolean) => void;
  setNextKinematicRotation: (r: { x: number; y: number; z: number; w: number }) => void;
}

export interface RapierWorldLike {
  bodies?: unknown;
  getRigidBody: (handle: number) => unknown;
}

/**
 * Safely verifies that a cached Rapier RigidBody handle still belongs to the
 * active Physics world and has not been removed or freed by React StrictMode,
 * quality switches, or world teardown before calling WASM FFI methods on it.
 */
export function isRigidBodyLive(
  world: RapierWorldLike | null | undefined,
  body: RapierRigidBodyLike | null | undefined
): boolean {
  if (!world || !body) return false;
  try {
    const bodiesObj = world.bodies;
    const worldRaw =
      bodiesObj && typeof bodiesObj === 'object'
        ? Reflect.get(bodiesObj, 'raw')
        : undefined;
    const bodyRaw = Reflect.get(body, 'rawSet');
    if (worldRaw && bodyRaw && worldRaw !== bodyRaw) {
      return false;
    }
    if (typeof body.isValid === 'function' && !body.isValid()) {
      return false;
    }
    return Boolean(world.getRigidBody(body.handle));
  } catch {
    return false;
  }
}

export function isPointOutsideBoundary(
  point: { x: number; y: number; z: number },
  center: readonly [number, number, number],
  maxRadius: number
): boolean {
  const dx = point.x - center[0];
  const dy = point.y - center[1];
  const dz = point.z - center[2];
  return dx * dx + dy * dy + dz * dz > maxRadius * maxRadius;
}

/**
 * Generates up to 57 collision-free 3D grid lattice coordinates strictly inside r <= 1.02
 * (minimum pairwise spacing = 0.43 > 2 * maxBallRadius = 0.396).
 */
export function buildBallSpawnPositions(count: number): Array<[number, number, number]> {
  const step = 0.43;
  const candidates: Array<[number, number, number]> = [];
  for (let ix = -2; ix <= 2; ix++) {
    for (let iy = -2; iy <= 2; iy++) {
      for (let iz = -2; iz <= 2; iz++) {
        const x = ix * step;
        const y = iy * step;
        const z = iz * step;
        if (x * x + y * y + z * z <= 1.02 * 1.02) {
          candidates.push([
            CAGE_CENTER[0] + x,
            CAGE_CENTER[1] + y,
            CAGE_CENTER[2] + z,
          ]);
        }
      }
    }
  }
  return candidates.slice(0, count);
}
