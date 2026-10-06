import { CheckoutInferenceInput } from '../types/index.js';
export interface FormattedClefState {
    structured_summary: {
        event_id: string;
        checkout_type: string;
        lane_id?: string;
        store_id?: string;
        time_window: {
            start?: string;
            end?: string;
        };
        camera_position?: string;
        physical_items_detected: number;
        trajectories: Array<{
            item_id: string;
            label?: string;
            path_sequence: string;
            encountered_scanner: boolean;
            destination: string;
        }>;
        cart_inspection: {
            bottom_of_basket_items: number;
            child_seat_items: number;
            main_basket_empty: boolean;
            concealed_items_flagged: number;
        };
        activity_timeline: Array<{
            phase: string;
            time_range: string;
            scanner_active: boolean;
            notes?: string;
        }>;
        transaction_records?: {
            scans_recorded: number;
            plu_recorded: number;
            voids_count: number;
            deletes_count: number;
            cancels_count: number;
            suspended: boolean;
            tenders_successful: boolean;
            unmatched_physical_items: number;
            unmatched_pos_scans: number;
            quantity_discrepancy: number;
        };
        real_cv_metrics?: {
            pass_around_probability: number;
            skip_scan_probability: number;
            bottom_of_basket_probability: number;
            bypass_motion_ratio: number;
            scanner_dwell_seconds: number;
            motion_intensity: number;
            pass_around_hits: number;
            scanner_hits: number;
        };
    };
    narrative_context: string;
    frame_references?: string[];
}
/**
 * Builds the multimodal state payload for Clef decision reasoning.
 */
export declare function buildClefState(input: CheckoutInferenceInput): FormattedClefState;
