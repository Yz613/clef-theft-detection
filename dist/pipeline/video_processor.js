import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class VideoProcessor {
    /**
     * Invokes Python OpenCV script to extract activity windows,
     * item trajectories, keyframes, lane type, and retailer theft classifications.
     */
    static async processVideo(videoPath, checkoutType = 'auto', outputFramesDir = 'public/uploads/frames') {
        const scriptPath = path.resolve(__dirname, '../../scripts/process_video.py');
        const absVideoPath = path.resolve(videoPath);
        const absFramesDir = path.resolve(outputFramesDir);
        return new Promise((resolve, reject) => {
            execFile('python3', [scriptPath, absVideoPath, checkoutType, absFramesDir], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('[VideoProcessor error]', stderr);
                    return reject(new Error(`Failed to process video: ${stderr || error.message}`));
                }
                try {
                    const parsed = JSON.parse(stdout);
                    if (parsed.error) {
                        return reject(new Error(parsed.error));
                    }
                    resolve(parsed);
                }
                catch (err) {
                    reject(new Error(`Invalid JSON output from video processor: ${err.message}. Output was: ${stdout}`));
                }
            });
        });
    }
}
//# sourceMappingURL=video_processor.js.map