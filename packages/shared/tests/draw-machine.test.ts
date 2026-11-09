import { describe, it, expect } from 'vitest';
import {
  transitionDraw,
  canTransitionState,
  countsTowardPrizeQuota,
  excludesTicketFromPool,
  DisplayState,
} from '../src/state-machine';

describe('Draw State Machine', () => {
  it('follows the standard winning happy path: idle -> revealing -> won -> idle', () => {
    let state: DisplayState = 'idle';

    state = transitionDraw(state, { type: 'START_DRAW' });
    expect(state).toBe('revealing');

    state = transitionDraw(state, { type: 'CONFIRM_WON' });
    expect(state).toBe('won');

    state = transitionDraw(state, { type: 'RESET_TO_IDLE' });
    expect(state).toBe('idle');
  });

  it('follows the absent attendee path: idle -> revealing -> absent -> idle', () => {
    let state: DisplayState = 'idle';

    state = transitionDraw(state, { type: 'START_DRAW' });
    expect(state).toBe('revealing');

    state = transitionDraw(state, { type: 'MARK_ABSENT' });
    expect(state).toBe('absent');

    state = transitionDraw(state, { type: 'RESET_TO_IDLE' });
    expect(state).toBe('idle');
  });

  it('allows voiding an in-progress draw: revealing -> void -> idle', () => {
    let state: DisplayState = 'idle';

    state = transitionDraw(state, { type: 'START_DRAW' });
    expect(state).toBe('revealing');

    state = transitionDraw(state, { type: 'VOID' });
    expect(state).toBe('void');

    state = transitionDraw(state, { type: 'RESET_TO_IDLE' });
    expect(state).toBe('idle');
  });

  it('allows void_last to undo a mistaken won confirmation: won -> void', () => {
    const state: DisplayState = 'won';
    const nextState = transitionDraw(state, { type: 'VOID_LAST' });
    expect(nextState).toBe('void');
  });

  it('rejects invalid state transitions with descriptive error', () => {
    expect(() => transitionDraw('idle', { type: 'CONFIRM_WON' })).toThrowError(/Cannot CONFIRM_WON from state "idle"/);
    expect(() => transitionDraw('idle', { type: 'MARK_ABSENT' })).toThrowError(/Cannot MARK_ABSENT from state "idle"/);
    expect(() => transitionDraw('won', { type: 'CONFIRM_WON' })).toThrowError(/Cannot CONFIRM_WON from state "won"/);
    expect(() => transitionDraw('absent', { type: 'CONFIRM_WON' })).toThrowError(/Cannot CONFIRM_WON from state "absent"/);
    expect(() => transitionDraw('revealing', { type: 'START_DRAW' })).toThrowError(/Cannot START_DRAW from state "revealing"/);
  });

  it('correctly reports canTransitionState', () => {
    expect(canTransitionState('idle', 'revealing')).toBe(true);
    expect(canTransitionState('revealing', 'won')).toBe(true);
    expect(canTransitionState('revealing', 'absent')).toBe(true);
    expect(canTransitionState('revealing', 'void')).toBe(true);
    expect(canTransitionState('won', 'void')).toBe(true);
    expect(canTransitionState('won', 'idle')).toBe(true);
    expect(canTransitionState('absent', 'idle')).toBe(true);

    // Invalid direct jumps
    expect(canTransitionState('idle', 'won')).toBe(false);
    expect(canTransitionState('idle', 'absent')).toBe(false);
    expect(canTransitionState('absent', 'won')).toBe(false);
  });

  it('correctly calculates prize quota contribution', () => {
    // Only 'won' and 'revealing' count toward prize quantity
    expect(countsTowardPrizeQuota('won')).toBe(true);
    expect(countsTowardPrizeQuota('revealing')).toBe(true);
    expect(countsTowardPrizeQuota('absent')).toBe(false);
    expect(countsTowardPrizeQuota('void')).toBe(false);
  });

  it('correctly calculates ticket pool exclusion', () => {
    // 'revealing', 'won', and 'absent' cannot be drawn again
    expect(excludesTicketFromPool('revealing')).toBe(true);
    expect(excludesTicketFromPool('won')).toBe(true);
    expect(excludesTicketFromPool('absent')).toBe(true);

    // 'void' returns ticket to the pool
    expect(excludesTicketFromPool('void')).toBe(false);
  });
});
