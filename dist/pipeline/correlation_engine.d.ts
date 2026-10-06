import { TrackedItem, TransactionContext, PosScan, PosPluEntry, TimelineEntry } from '../types/index.js';
export interface PosMatchCandidate {
    item_id: string;
    visual_timestamp?: string;
    matched_scan?: PosScan;
    matched_plu?: PosPluEntry;
    time_diff_seconds?: number;
    match_confidence: 'exact' | 'probable' | 'unmatched';
}
export interface CorrelationResult {
    has_transaction_context: boolean;
    total_physical_items: number;
    total_pos_units: number;
    unmatched_physical_items: TrackedItem[];
    unmatched_pos_scans: PosScan[];
    candidate_matches: PosMatchCandidate[];
    quantity_discrepancy: number;
    pos_timeline: TimelineEntry[];
    flags: {
        visible_item_without_scan: boolean;
        scan_without_visible_item: boolean;
        quantity_mismatch: boolean;
        post_scan_void_detected: boolean;
        post_scan_delete_detected: boolean;
        cancelled_transaction: boolean;
        suspended_transaction: boolean;
        unpaid_walkoff_detected: boolean;
    };
}
export declare class CorrelationEngine {
    private static readonly MATCH_WINDOW_SECONDS;
    /**
     * Correlates visual item movements against POS / T-log events.
     */
    static correlate(items: TrackedItem[], txContext: TransactionContext | null): CorrelationResult;
    private static parseTimestampToSeconds;
}
