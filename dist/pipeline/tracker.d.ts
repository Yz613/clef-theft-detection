import { TrackedItem } from '../types/index.js';
export interface TrajectoryAnomaly {
    item_id: string;
    type: 'SCANNER_BYPASS' | 'PASS_AROUND' | 'BOTTOM_OF_BASKET_UNTOUCHED' | 'MULTI_ITEM_GROUPING' | 'DIRECT_TO_BAG' | 'UNSCANNED_HANDOFF' | 'UNPAID_EXIT';
    description: string;
    severity: 'low' | 'medium' | 'high';
}
export declare class ObjectTracker {
    /**
     * Analyzes raw tracked item paths and labels to extract normalized
     * state sequences, scanner interactions, and behavioral trajectory flags.
     */
    static analyzeTrajectories(items: TrackedItem[]): {
        normalizedItems: TrackedItem[];
        anomalies: TrajectoryAnomaly[];
        summary: {
            totalItems: number;
            scannedCount: number;
            bypassedCount: number;
            bobCount: number;
        };
    };
}
