import {
  TrackedItem,
  TransactionContext,
  PosScan,
  PosPluEntry,
  TimelineEntry,
} from '../types/index.js';

export interface PosMatchCandidate {
  item_id: string;
  visual_timestamp?: string;
  matched_scan?: PosScan;
  matched_plu?: PosPluEntry;
  time_diff_seconds?: number;
  match_confidence: 'exact' | 'probable' | 'unmatched';
}

export interface CorrelationResult {
  has_transaction_context: boolean;
  total_physical_items: number;
  total_pos_units: number;
  unmatched_physical_items: TrackedItem[];
  unmatched_pos_scans: PosScan[];
  candidate_matches: PosMatchCandidate[];
  quantity_discrepancy: number; // positive = more physical items than POS
  pos_timeline: TimelineEntry[];
  flags: {
    visible_item_without_scan: boolean;
    scan_without_visible_item: boolean;
    quantity_mismatch: boolean;
    post_scan_void_detected: boolean;
    post_scan_delete_detected: boolean;
    cancelled_transaction: boolean;
    suspended_transaction: boolean;
    unpaid_walkoff_detected: boolean;
  };
}

export class CorrelationEngine {
  private static readonly MATCH_WINDOW_SECONDS = 3.5;

  /**
   * Correlates visual item movements against POS / T-log events.
   */
  public static correlate(
    items: TrackedItem[],
    txContext: TransactionContext | null
  ): CorrelationResult {
    if (!txContext) {
      return {
        has_transaction_context: false,
        total_physical_items: items.length,
        total_pos_units: 0,
        unmatched_physical_items: [],
        unmatched_pos_scans: [],
        candidate_matches: [],
        quantity_discrepancy: 0,
        pos_timeline: [],
        flags: {
          visible_item_without_scan: false,
          scan_without_visible_item: false,
          quantity_mismatch: false,
          post_scan_void_detected: false,
          post_scan_delete_detected: false,
          cancelled_transaction: false,
          suspended_transaction: false,
          unpaid_walkoff_detected: false,
        },
      };
    }

    const scans = txContext.scans || [];
    const plus = txContext.plu_entries || [];
    const voids = (txContext.voids || []) as any[];
    const deletes = (txContext.deletes || []) as any[];
    const cancels = (txContext.cancels || []) as any[];
    const suspends = (txContext.suspends || []) as any[];
    const tenders = (txContext.tenders || []) as any[];

    const totalPosUnits =
      scans.reduce((sum, s) => sum + (s.quantity || 1), 0) + plus.length;

    const posTimeline: TimelineEntry[] = [];
    const candidateMatches: PosMatchCandidate[] = [];
    const usedPosIndices = new Set<number>();

    // Parse scan timestamps and add to timeline
    scans.forEach((scan, idx) => {
      posTimeline.push({
        timestamp: scan.timestamp || '14:03:20',
        source: 'pos',
        description: `POS: Scan registered SKU ${scan.sku || scan.upc || 'N/A'} - ${scan.description || 'Item'} (Qty: ${scan.quantity || 1}, $${scan.price?.toFixed(2) || '0.00'})`,
        severity: 'normal',
      });
    });

    plus.forEach((plu) => {
      posTimeline.push({
        timestamp: plu.timestamp || '14:03:20',
        source: 'pos',
        description: `POS: PLU entered ${plu.plu} - ${plu.description || 'Produce'} (${plu.weight ? `${plu.weight} lbs, ` : ''}$${plu.price?.toFixed(2) || '0.00'})`,
        severity: 'normal',
      });
    });

    voids.forEach((v) => {
      posTimeline.push({
        timestamp: v.timestamp || '14:03:22',
        source: 'pos',
        description: `POS: VOID executed on ${v.description || v.sku || 'item'}`,
        severity: 'alert',
      });
    });

    deletes.forEach((d) => {
      posTimeline.push({
        timestamp: d.timestamp || '14:03:22',
        source: 'pos',
        description: `POS: Item ${d.sku || 'N/A'} deleted from transaction`,
        severity: 'alert',
      });
    });

    // Time alignment matching for physical items
    const unmatchedPhysical: TrackedItem[] = [];

    items.forEach((item) => {
      const itemTime = item.last_seen || item.first_seen || '14:03:20';
      const itemSeconds = this.parseTimestampToSeconds(itemTime);

      let bestMatchIdx = -1;
      let minDiff = Infinity;

      scans.forEach((scan, sIdx) => {
        if (usedPosIndices.has(sIdx)) return;
        const scanSeconds = this.parseTimestampToSeconds(scan.timestamp || itemTime);
        const diff = Math.abs(itemSeconds - scanSeconds);

        if (diff <= this.MATCH_WINDOW_SECONDS && diff < minDiff) {
          minDiff = diff;
          bestMatchIdx = sIdx;
        }
      });

      if (bestMatchIdx !== -1) {
        usedPosIndices.add(bestMatchIdx);
        candidateMatches.push({
          item_id: item.id,
          visual_timestamp: itemTime,
          matched_scan: scans[bestMatchIdx],
          time_diff_seconds: minDiff,
          match_confidence: minDiff < 1.5 ? 'exact' : 'probable',
        });
      } else {
        unmatchedPhysical.push(item);
        candidateMatches.push({
          item_id: item.id,
          visual_timestamp: itemTime,
          match_confidence: 'unmatched',
        });
        posTimeline.push({
          timestamp: itemTime,
          source: 'pos',
          description: `POS: No corresponding scan event detected for ${item.id}${item.label ? ` (${item.label})` : ''}`,
          item_id: item.id,
          severity: 'alert',
        });
      }
    });

    const unmatchedPosScans = scans.filter((_, idx) => !usedPosIndices.has(idx));
    const tenderSuccessful = tenders.length > 0 && tenders.some((t) => t.successful !== false);

    const flags = {
      visible_item_without_scan: unmatchedPhysical.length > 0,
      scan_without_visible_item: unmatchedPosScans.length > 0,
      quantity_mismatch: items.length !== totalPosUnits,
      post_scan_void_detected: voids.length > 0,
      post_scan_delete_detected: deletes.length > 0,
      cancelled_transaction: cancels.length > 0,
      suspended_transaction: suspends.length > 0,
      unpaid_walkoff_detected: !tenderSuccessful && items.length > 0,
    };

    return {
      has_transaction_context: true,
      total_physical_items: items.length,
      total_pos_units: totalPosUnits,
      unmatched_physical_items: unmatchedPhysical,
      unmatched_pos_scans: unmatchedPosScans,
      candidate_matches: candidateMatches,
      quantity_discrepancy: items.length - totalPosUnits,
      pos_timeline: posTimeline,
      flags,
    };
  }

  private static parseTimestampToSeconds(ts: string): number {
    const parts = ts.split(':').map((p) => parseFloat(p));
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  }
}
