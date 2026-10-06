import { VisualContext } from '../types/index.js';
export interface ExtractedKeyframe {
    frame_number: number;
    timestamp_sec: number;
    relative_path: string;
    disk_path: string;
    data_url: string;
}
export interface VideoProcessingResult {
    video_path: string;
    metadata: {
        fps: number;
        total_frames: number;
        duration_seconds: number;
        width: number;
        height: number;
    };
    keyframes: ExtractedKeyframe[];
    visual_context: VisualContext;
}
export declare class VideoProcessor {
    /**
     * Extracts visual keyframes from video using PyAV & Pillow (No OpenCV)
     * for direct multimodal evaluation by Cloudflare Clef (@cf/cloudflare/clef).
     */
    static processVideo(videoPath: string, outputFramesDir?: string, numKeyframes?: number): Promise<VideoProcessingResult>;
}
