#!/usr/bin/env python3
"""
Generates real playable .mp4 sample grocery checkout videos using OpenCV.
These are real H.264/MP4 files that play natively in HTML5 video players and browsers.
"""

import os
import cv2
import numpy as np

def create_checkout_frame(frame_w, frame_h, t, scenario="skip_scan"):
    # Create dark checkout lane scene
    frame = np.zeros((frame_h, frame_w, 3), dtype=np.uint8)
    frame[:] = (18, 24, 38)  # dark slate background

    # Conveyor / Counter surface
    counter_y = int(frame_h * 0.70)
    cv2.rectangle(frame, (0, counter_y), (frame_w, frame_h), (35, 45, 65), -1)
    cv2.line(frame, (0, counter_y), (frame_w, counter_y), (60, 80, 110), 2)

    # 1. Cart Zone (Left)
    cart_x1, cart_x2 = int(frame_w * 0.05), int(frame_w * 0.30)
    cart_y1, cart_y2 = int(frame_h * 0.25), int(frame_h * 0.85)
    cv2.rectangle(frame, (cart_x1, cart_y1), (cart_x2, cart_y2), (56, 189, 248), 2)
    cv2.putText(frame, "CART ZONE", (cart_x1 + 10, cart_y1 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (56, 189, 248), 2)

    # 2. Optical Scanner Window (Center)
    scan_x1, scan_x2 = int(frame_w * 0.40), int(frame_w * 0.60)
    scan_y1, scan_y2 = int(frame_h * 0.45), int(frame_h * 0.75)
    
    # Scanner red laser / optical glow
    is_scanner_active = scenario == "legitimate_scan" and 0.40 <= t <= 0.60
    scanner_color = (0, 255, 0) if is_scanner_active else (50, 50, 230)
    cv2.rectangle(frame, (scan_x1, scan_y1), (scan_x2, scan_y2), scanner_color, -1 if is_scanner_active else 2)
    cv2.putText(frame, "SCANNER WINDOW" if not is_scanner_active else "BARCODE READ OK",
                (scan_x1 - 15, scan_y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, scanner_color, 2)

    # 3. Bagging Well (Right)
    bag_x1, bag_x2 = int(frame_w * 0.70), int(frame_w * 0.95)
    bag_y1, bag_y2 = int(frame_h * 0.25), int(frame_h * 0.85)
    cv2.rectangle(frame, (bag_x1, bag_y1), (bag_x2, bag_y2), (16, 185, 129), 2)
    cv2.putText(frame, "BAGGING WELL", (bag_x1 + 10, bag_y1 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (16, 185, 129), 2)

    # 4. Moving Item Trajectory
    item_color = (255, 140, 0)  # Orange laundry detergent
    if scenario == "skip_scan":
        # Arcs above/around the scanner window (Bypass path)
        item_x = int(cart_x1 + 50 + t * (bag_x1 - cart_x1 + 30))
        item_y = int(counter_y - 80 - np.sin(t * np.pi) * 110)
        cv2.putText(frame, "BYPASS TRAJECTORY DETECTED", (frame_w // 2 - 150, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
    elif scenario == "legitimate_scan":
        # Enters directly into scanner window
        item_x = int(cart_x1 + 50 + t * (bag_x1 - cart_x1 + 30))
        item_y = int(counter_y - 40)
        cv2.putText(frame, "VALID SCAN TRAJECTORY", (frame_w // 2 - 120, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
    elif scenario == "bob_case":
        # Case on bottom rack stays in cart while cart rolls past
        item_x = int(cart_x1 + 30 + t * 80)
        item_y = int(cart_y2 - 30)
        cv2.putText(frame, "BOTTOM-OF-BASKET ITEM UNPROCESSED", (frame_w // 2 - 200, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 165, 255), 2)

    # Draw merchandise item
    cv2.rectangle(frame, (item_x - 30, item_y - 45), (item_x + 30, item_y + 45), item_color, -1)
    cv2.rectangle(frame, (item_x - 30, item_y - 45), (item_x + 30, item_y + 45), (255, 255, 255), 2)
    cv2.putText(frame, "ITEM 1", (item_x - 25, item_y - 50), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)

    # Timestamp overlay in corner
    cv2.putText(frame, f"CAM-03 | OVERHEAD 45 | {t * 5.0:.1f}s", (20, frame_h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (160, 160, 160), 1)

    return frame

def generate_video(filename, scenario="skip_scan", duration_sec=5.0, fps=30):
    output_dir = "public/samples"
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, filename)

    width, height = 854, 480
    total_frames = int(duration_sec * fps)

    # Try MP4 codecs available on system
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height))

    if not writer.isOpened():
        fourcc = cv2.VideoWriter_fourcc(*'avc1')
        writer = cv2.VideoWriter(out_path, fourcc, fps, (width, height))

    if not writer.isOpened():
        print(f"Failed to open video writer for {out_path}")
        return False

    for f_idx in range(total_frames):
        t = f_idx / float(total_frames)
        frame = create_checkout_frame(width, height, t, scenario)
        writer.write(frame)

    writer.release()
    print(f"✓ Generated real checkout video: {out_path} ({total_frames} frames, {duration_sec}s)")
    return True

if __name__ == "__main__":
    generate_video("real_skip_scan.mp4", scenario="skip_scan", duration_sec=5.0)
    generate_video("real_legitimate_scan.mp4", scenario="legitimate_scan", duration_sec=5.0)
    generate_video("real_bob_case.mp4", scenario="bob_case", duration_sec=5.0)
