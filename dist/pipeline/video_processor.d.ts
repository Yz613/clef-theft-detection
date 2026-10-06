import { VisualContext, RetailerTheftSummary } from '../types/index.js';
export interface VideoProcessingResult {
    video_path: string;
    detected_checkout_type: 'cashier' | 'self_checkout';
    checkout_type_confidence: number;
    lane_classification_evidence: string;
    detected_theft_types: string[];
    retailer_theft_summary: RetailerTheftSummary;
    metadata: {
        fps: number;
        total_frames: number;
        duration_seconds: number;
        width: number;
        height: number;
    };
    visual_context: VisualContext;
}
export declare class VideoProcessor {
    /**
     * Invokes Python OpenCV script to extract activity windows,
     * item trajectories, keyframes, lane type, and retailer theft classifications.
     */
    static processVideo(videoPath: string, checkoutType?: 'cashier' | 'self_checkout' | 'auto', outputFramesDir?: string): Promise<VideoProcessingResult>;
}
