import { describe, it, expect } from 'vitest';
import { VideoProcessor } from '../src/pipeline/video_processor.js';
import path from 'path';
import fs from 'fs';

describe('VideoProcessor (Real OpenCV Video Pipeline)', () => {
  it('processes real MP4 video and extracts bypass path and keyframes', async () => {
    const videoPath = path.resolve('public/samples/real_skip_scan.mp4');
    expect(fs.existsSync(videoPath)).toBe(true);

    const result = await VideoProcessor.processVideo(videoPath, 'self_checkout');

    expect(result.metadata.duration_seconds).toBeGreaterThan(0);
    expect(result.metadata.fps).toBe(30);
    expect(result.visual_context.tracked_items).toHaveLength(1);

    const tracked = result.visual_context.tracked_items![0];
    expect(tracked.path).toContain('BAGGING_AREA');
    expect(tracked.scanner_interaction).toBe(false); // bypassed scanner!

    expect(result.visual_context.frames!.length).toBeGreaterThan(0);
    expect(result.visual_context.activity_windows!.length).toBeGreaterThan(0);
  });

  it('detects legitimate scan interaction on real MP4 video', async () => {
    const videoPath = path.resolve('public/samples/real_legitimate_scan.mp4');
    expect(fs.existsSync(videoPath)).toBe(true);

    const result = await VideoProcessor.processVideo(videoPath, 'self_checkout');

    const tracked = result.visual_context.tracked_items![0];
    expect(tracked.path).toContain('SCANNER_ZONE');
    expect(tracked.scanner_interaction).toBe(true); // presented to optical scanner
  });
});
