import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { VisualContext } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export class VideoProcessor {
  /**
   * Extracts visual keyframes from video using PyAV & Pillow (No OpenCV)
   * for direct multimodal evaluation by Cloudflare Clef (@cf/cloudflare/clef).
   */
  public static async processVideo(
    videoPath: string,
    outputFramesDir: string = 'public/uploads/frames',
    numKeyframes: number = 4
  ): Promise<VideoProcessingResult> {
    const scriptPath = path.resolve(__dirname, '../../scripts/extract_keyframes.py');
    const absVideoPath = path.resolve(videoPath);
    const absFramesDir = path.resolve(outputFramesDir);

    return new Promise((resolve, reject) => {
      execFile(
        'python3',
        [scriptPath, absVideoPath, absFramesDir, String(numKeyframes)],
        { maxBuffer: 30 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            console.error('[VideoProcessor error]', stderr);
            return reject(new Error(`Failed to extract keyframes: ${stderr || error.message}`));
          }

          try {
            const parsed = JSON.parse(stdout);
            if (!parsed.success || parsed.error) {
              return reject(new Error(parsed.error || 'Unknown video extraction error'));
            }

            const keyframes: ExtractedKeyframe[] = parsed.keyframes || [];

            const result: VideoProcessingResult = {
              video_path: absVideoPath,
              metadata: {
                fps: parsed.fps,
                total_frames: parsed.total_frames,
                duration_seconds: parsed.duration_seconds,
                width: parsed.width,
                height: parsed.height,
              },
              keyframes,
              visual_context: {
                video: path.basename(absVideoPath),
                frames: keyframes.map((k) => k.relative_path),
                keyframes: keyframes.map((k) => ({
                  frame_number: k.frame_number,
                  timestamp_sec: k.timestamp_sec,
                  relative_path: k.relative_path,
                  data_url: k.data_url,
                })),
                activity_windows: [
                  {
                    window_id: 'win_checkout_transit',
                    phase: 'scanner_interaction',
                    start_time: '0.0s',
                    end_time: `${parsed.duration_seconds}s`,
                    motion_intensity: 0.8,
                    involved_item_ids: ['item_1'],
                    scanner_activated: true,
                  },
                ],
              },
            };

            resolve(result);
          } catch (err: any) {
            reject(new Error(`Invalid JSON from keyframe extractor: ${err.message}. Output was: ${stdout.slice(0, 300)}`));
          }
        }
      );
    });
  }
}
