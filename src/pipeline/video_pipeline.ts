import { VisualContext, ActivityWindow, TimelineEntry } from '../types/index.js';

export interface ProcessedVisualPipelineResult {
  segmented_windows: ActivityWindow[];
  visual_timeline: TimelineEntry[];
  evidence_quality_score: number;
}

export class VideoPipeline {
  /**
   * Processes raw visual context, extracts short event windows,
   * generates chronological visual timeline, and evaluates evidence quality.
   */
  public static process(visualContext: VisualContext): ProcessedVisualPipelineResult {
    // If activity windows are already provided, use them; otherwise segment from tracked items and timestamps
    let windows = visualContext.activity_windows || [];

    if (windows.length === 0) {
      windows = this.generateDefaultWindows(visualContext);
    }

    const visualTimeline: TimelineEntry[] = [];

    // Build chronological timeline entries
    for (const win of windows) {
      let severity: 'normal' | 'suspicious' | 'alert' = 'normal';
      if (win.phase === 'bagging_interaction' && !win.scanner_activated) {
        severity = 'alert';
      } else if (win.phase === 'scanner_approach' && !win.scanner_activated) {
        severity = 'suspicious';
      }

      visualTimeline.push({
        timestamp: win.start_time,
        source: 'visual',
        description: this.getPhaseDescription(win),
        item_id: win.involved_item_ids[0],
        severity,
      });
    }

    // Include item-specific trajectory events if available
    const items = visualContext.tracked_items || [];
    for (const item of items) {
      if (item.first_seen && !visualTimeline.some((t) => t.timestamp === item.first_seen)) {
        visualTimeline.push({
          timestamp: item.first_seen,
          source: 'visual',
          description: `Item ${item.id}${item.label ? ` (${item.label})` : ''} detected in shopping basket/cart`,
          item_id: item.id,
          severity: 'normal',
        });
      }
    }

    // Sort timeline chronologically
    visualTimeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Calculate evidence quality
    let quality = 0.85;
    if (visualContext.camera_position) quality += 0.05;
    if (visualContext.frames && visualContext.frames.length >= 3) quality += 0.05;
    if (items.length > 0) quality += 0.03;
    const finalQuality = Math.min(0.98, Math.max(0.40, quality));

    return {
      segmented_windows: windows,
      visual_timeline: visualTimeline,
      evidence_quality_score: finalQuality,
    };
  }

  private static generateDefaultWindows(visualContext: VisualContext): ActivityWindow[] {
    const start = visualContext.event_start || '14:03:15';
    const items = visualContext.tracked_items || [];
    const hasUnscanned = items.some((i) => !i.scanner_interaction);

    return [
      {
        window_id: 'win_1',
        phase: 'before_interaction',
        start_time: start,
        end_time: '14:03:17',
        motion_intensity: 0.3,
        involved_item_ids: items.map((i) => i.id),
        scanner_activated: false,
        notes: 'Shopper / cart position established at lane',
      },
      {
        window_id: 'win_2',
        phase: 'scanner_approach',
        start_time: '14:03:18',
        end_time: '14:03:20',
        motion_intensity: 0.7,
        involved_item_ids: items.slice(0, 1).map((i) => i.id),
        scanner_activated: false,
        notes: 'Merchandise picked up from basket and moved toward scanner region',
      },
      {
        window_id: 'win_3',
        phase: 'scanner_interaction',
        start_time: '14:03:20',
        end_time: '14:03:21',
        motion_intensity: 0.8,
        involved_item_ids: items.slice(0, 1).map((i) => i.id),
        scanner_activated: !hasUnscanned,
        notes: hasUnscanned
          ? 'No clear optical scanner interaction or barcode read detected'
          : 'Barcode presented across optical scanner window',
      },
      {
        window_id: 'win_4',
        phase: 'bagging_interaction',
        start_time: '14:03:22',
        end_time: '14:03:24',
        motion_intensity: 0.6,
        involved_item_ids: items.map((i) => i.id),
        scanner_activated: false,
        notes: 'Item placed into bagging well / bag holder',
      },
      {
        window_id: 'win_5',
        phase: 'cart_state',
        start_time: '14:03:25',
        end_time: '14:03:27',
        motion_intensity: 0.2,
        involved_item_ids: [],
        scanner_activated: false,
        notes: 'Cart perimeter and lower tray scanned',
      },
      {
        window_id: 'win_6',
        phase: 'customer_departure',
        start_time: '14:03:28',
        end_time: '14:03:30',
        motion_intensity: 0.5,
        involved_item_ids: [],
        scanner_activated: false,
        notes: 'Shopper initiates egress from lane',
      },
    ];
  }

  private static getPhaseDescription(win: ActivityWindow): string {
    switch (win.phase) {
      case 'before_interaction':
        return 'Customer prepares merchandise at checkout';
      case 'scanner_approach':
        return 'Item enters hand and moves near scanner';
      case 'scanner_interaction':
        return win.scanner_activated
          ? 'Valid barcode interaction confirmed at scanner'
          : 'No clear scanner interaction observed';
      case 'bagging_interaction':
        return 'Item enters bagging area';
      case 'cart_state':
        return 'Cart perimeter inspected';
      case 'transaction_end':
        return 'Transaction conclusion reached';
      case 'customer_departure':
        return 'Customer departs checkout lane';
      default:
        return win.notes || 'Activity observed';
    }
  }
}
