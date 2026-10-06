import { ClefRequest, ClefResponse } from '../types/index.js';
/**
 * High-fidelity, probabilistic Clef emulator.
 * Evaluates Clef state and question instructions, returning structured
 * probabilities matching the exact @cf/cloudflare/clef System One API format.
 */
export declare class ClefSimulator {
    static evaluate(request: ClefRequest): ClefResponse;
    private static evaluateNoulQuestion;
}
