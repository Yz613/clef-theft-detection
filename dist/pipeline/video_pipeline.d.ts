import { VisualContext, ActivityWindow, TimelineEntry } from '../types/index.js';
export interface ProcessedVisualPipelineResult {
    segmented_windows: ActivityWindow[];
    visual_timeline: TimelineEntry[];
    evidence_quality_score: number;
}
export declare class VideoPipeline {
    /**
     * Processes raw visual context, extracts short event windows,
     * generates chronological visual timeline, and evaluates evidence quality.
     */
    static process(visualContext: VisualContext): ProcessedVisualPipelineResult;
    private static generateDefaultWindows;
    private static getPhaseDescription;
}
