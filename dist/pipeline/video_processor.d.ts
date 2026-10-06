import { VisualContext } from '../types/index.js';
export interface VideoProcessingResult {
    video_path: string;
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
     * item trajectories, and keyframes from a real video file.
     */
    static processVideo(videoPath: string, checkoutType?: 'cashier' | 'self_checkout', outputFramesDir?: string): Promise<VideoProcessingResult>;
}
