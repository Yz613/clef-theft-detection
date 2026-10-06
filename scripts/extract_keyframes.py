#!/usr/bin/env python3
"""
scripts/extract_keyframes.py

Extracts keyframes from retail checkout video using PyAV and Pillow (No OpenCV).
Prepares high-resolution keyframes for UI playback and base64 data URLs
for multimodal inference with Cloudflare Clef (@cf/cloudflare/clef).
"""

import sys
import os
import json
import base64
import io
import math
from PIL import Image

try:
    import av
except ImportError:
    print(json.dumps({"error": "PyAV ('av') is required for pure video decoding. Run pip install av."}))
    sys.exit(1)


def extract_keyframes(video_path: str, output_frames_dir: str, num_keyframes: int = 4):
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video file not found: {video_path}")

    os.makedirs(output_frames_dir, exist_ok=True)
    basename = os.path.splitext(os.path.basename(video_path))[0]

    container = av.open(video_path)
    video_stream = container.streams.video[0]

    total_frames = video_stream.frames
    fps = float(video_stream.average_rate or 30.0)
    duration_sec = 0.0
    if video_stream.duration and video_stream.time_base:
        duration_sec = float(video_stream.duration * video_stream.time_base)
    elif total_frames and fps:
        duration_sec = float(total_frames / fps)

    width = video_stream.width or 640
    height = video_stream.height or 360

    # Determine keyframe percentage points (e.g. 15%, 40%, 65%, 90%)
    if num_keyframes == 4:
        sample_fractions = [0.15, 0.40, 0.65, 0.90]
    else:
        sample_fractions = [(i + 0.5) / num_keyframes for i in range(num_keyframes)]

    if total_frames and total_frames > num_keyframes:
        target_indices = [int(f * total_frames) for f in sample_fractions]
    else:
        target_indices = [0]

    keyframes_data = []
    current_idx = 0
    next_target_ptr = 0

    for frame in container.decode(video=0):
        if next_target_ptr < len(target_indices) and current_idx >= target_indices[next_target_ptr]:
            img = frame.to_image()

            # Save full/presentation resolution for UI
            frame_filename = f"{basename}_keyframe_{next_target_ptr + 1}.jpg"
            disk_path = os.path.join(output_frames_dir, frame_filename)
            img.save(disk_path, format="JPEG", quality=90)

            # Generate max 512px thumbnail for fast network transmission to Clef
            thumb = img.copy()
            thumb.thumbnail((512, 512))
            buf = io.BytesIO()
            thumb.save(buf, format="JPEG", quality=85)
            b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
            data_url = f"data:image/jpeg;base64,{b64_str}"

            frame_sec = float(frame.pts * video_stream.time_base) if frame.pts and video_stream.time_base else float(current_idx / (fps or 30))

            keyframes_data.append({
                "frame_number": current_idx,
                "timestamp_sec": round(frame_sec, 2),
                "relative_path": f"/uploads/frames/{frame_filename}",
                "disk_path": disk_path,
                "data_url": data_url
            })

            next_target_ptr += 1
            if next_target_ptr >= len(target_indices):
                break

        current_idx += 1

    container.close()

    # Fallback if fewer frames found
    if not keyframes_data and os.path.exists(video_path):
        # Retry with first decoded frame
        c = av.open(video_path)
        for frame in c.decode(video=0):
            img = frame.to_image()
            frame_filename = f"{basename}_keyframe_1.jpg"
            disk_path = os.path.join(output_frames_dir, frame_filename)
            img.save(disk_path, format="JPEG", quality=90)
            thumb = img.copy()
            thumb.thumbnail((512, 512))
            buf = io.BytesIO()
            thumb.save(buf, format="JPEG", quality=85)
            keyframes_data.append({
                "frame_number": 0,
                "timestamp_sec": 0.0,
                "relative_path": f"/uploads/frames/{frame_filename}",
                "disk_path": disk_path,
                "data_url": f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
            })
            break
        c.close()

    return {
        "success": True,
        "video_path": video_path,
        "duration_seconds": round(duration_sec, 2),
        "fps": round(fps, 2),
        "width": width,
        "height": height,
        "total_frames": total_frames or current_idx,
        "keyframes": keyframes_data
    }


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: extract_keyframes.py <video_path> <output_frames_dir> [num_keyframes]"}))
        sys.exit(1)

    video_path = sys.argv[1]
    frames_dir = sys.argv[2]
    num_frames = int(sys.argv[3]) if len(sys.argv) > 3 else 4

    try:
        result = extract_keyframes(video_path, frames_dir, num_frames)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
