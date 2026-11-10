import { DrawStatus } from '../schemas/draw';

export type DisplayState = 'idle' | 'revealing' | 'won' | 'absent' | 'void';

export type DrawAction =
  | { type: 'START_DRAW' }
  | { type: 'CONFIRM_WON' }
  | { type: 'MARK_ABSENT' }
  | { type: 'UNDO_ABSENT' }
  | { type: 'VOID' }
  | { type: 'VOID_LAST' }
  | { type: 'RESET_TO_IDLE' };

export const VALID_TRANSITIONS: Record<DisplayState, ReadonlyArray<DisplayState>> = {
  idle: ['revealing'],
  revealing: ['won', 'absent', 'void'],
  won: ['void', 'idle'],
  absent: ['idle', 'revealing'],
  void: ['idle'],
} as const;

/**
 * Checks if a direct state-to-state transition is valid.
 */
export function canTransitionState(from: DisplayState, to: DisplayState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Given current state and an action, computes next state or throws an error.
 */
export function transitionDraw(current: DisplayState, action: DrawAction): DisplayState {
  switch (action.type) {
    case 'START_DRAW':
      if (current === 'idle') return 'revealing';
      throw new Error(`INVALID_TRANSITION: Cannot START_DRAW from state "${current}". Expected "idle".`);

    case 'CONFIRM_WON':
      if (current === 'revealing') return 'won';
      throw new Error(`INVALID_TRANSITION: Cannot CONFIRM_WON from state "${current}". Expected "revealing".`);

    case 'MARK_ABSENT':
      if (current === 'revealing') return 'absent';
      throw new Error(`INVALID_TRANSITION: Cannot MARK_ABSENT from state "${current}". Expected "revealing".`);

    case 'UNDO_ABSENT':
      if (current === 'absent') return 'revealing';
      throw new Error(`INVALID_TRANSITION: Cannot UNDO_ABSENT from state "${current}". Expected "absent".`);

    case 'VOID':
      if (current === 'revealing') return 'void';
      throw new Error(`INVALID_TRANSITION: Cannot VOID from state "${current}". Expected "revealing".`);

    case 'VOID_LAST':
      if (current === 'won' || current === 'revealing') return 'void';
      throw new Error(`INVALID_TRANSITION: Cannot VOID_LAST from state "${current}". Expected "won" or "revealing".`);

    case 'RESET_TO_IDLE':
      if (current === 'won' || current === 'absent' || current === 'void') return 'idle';
      throw new Error(`INVALID_TRANSITION: Cannot RESET_TO_IDLE from state "${current}". Expected finished state.`);

    default:
      // Exhaustive check
      const _exhaustive: never = action;
      throw new Error(`UNKNOWN_ACTION: ${JSON.stringify(_exhaustive)}`);
  }
}

/**
 * Checks if a ticket status counts towards the prize quantity.
 * Only 'revealing' (in-flight) and 'won' (claimed) count toward prize quota.
 * 'absent' and 'void' do NOT count.
 */
export function countsTowardPrizeQuota(status: DrawStatus): boolean {
  return status === 'won' || status === 'revealing';
}

/**
 * Checks if a ticket is removed from the available pool.
 * 'revealing', 'won', and 'absent' tickets cannot be drawn again.
 * Only 'void' tickets return to the valid pool.
 */
export function excludesTicketFromPool(status: DrawStatus): boolean {
  return status === 'revealing' || status === 'won' || status === 'absent';
}
