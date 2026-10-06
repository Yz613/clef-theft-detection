import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { VisualContext } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export class VideoProcessor {
  /**
   * Invokes Python OpenCV script to extract activity windows,
   * item trajectories, and keyframes from a real video file.
   */
  public static async processVideo(
    videoPath: string,
    checkoutType: 'cashier' | 'self_checkout' = 'self_checkout',
    outputFramesDir: string = 'public/uploads/frames'
  ): Promise<VideoProcessingResult> {
    const scriptPath = path.resolve(__dirname, '../../scripts/process_video.py');
    const absVideoPath = path.resolve(videoPath);
    const absFramesDir = path.resolve(outputFramesDir);

    return new Promise((resolve, reject) => {
      execFile(
        'python3',
        [scriptPath, absVideoPath, checkoutType, absFramesDir],
        { maxBuffer: 10 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) {
            console.error('[VideoProcessor error]', stderr);
            return reject(new Error(`Failed to process video: ${stderr || error.message}`));
          }

          try {
            const parsed = JSON.parse(stdout);
            if (parsed.error) {
              return reject(new Error(parsed.error));
            }
            resolve(parsed as VideoProcessingResult);
          } catch (err: any) {
            reject(new Error(`Invalid JSON output from video processor: ${err.message}. Output was: ${stdout}`));
          }
        }
      );
    });
  }
}
