import { describe, it, expect } from 'vitest';
import { CorrelationEngine } from '../src/pipeline/correlation_engine.js';
import { TrackedItem, TransactionContext } from '../src/types/index.js';

describe('CorrelationEngine (Phase 2 T-Log Alignment)', () => {
  it('handles null transaction context (Visual-only Phase 1)', () => {
    const items: TrackedItem[] = [
      { id: 'item_1', path: ['CART_MAIN', 'HAND_CUSTOMER', 'BAGGING_AREA'], scanner_interaction_observed: false },
    ];
    const result = CorrelationEngine.correlate(items, null);

    expect(result.has_transaction_context).toBe(false);
    expect(result.unmatched_physical_items).toHaveLength(0);
    expect(result.quantity_discrepancy).toBe(0);
  });

  it('matches physical item to POS scan within time window', () => {
    const items: TrackedItem[] = [
      { id: 'item_1', first_seen: '14:03:20', last_seen: '14:03:22', scanner_interaction_observed: true },
    ];
    const tx: TransactionContext = {
      scans: [
        { sku: 'SKU_123', upc: '012345', description: 'Cereal', quantity: 1, timestamp: '14:03:21' },
      ],
      tenders: [{ successful: true }],
    };

    const result = CorrelationEngine.correlate(items, tx);

    expect(result.has_transaction_context).toBe(true);
    expect(result.unmatched_physical_items).toHaveLength(0);
    expect(result.candidate_matches[0].match_confidence).toBe('exact');
    expect(result.candidate_matches[0].matched_scan?.sku).toBe('SKU_123');
  });

  it('detects visible item without scan when no POS scan occurred in time window', () => {
    const items: TrackedItem[] = [
      { id: 'item_skipped', first_seen: '14:03:20', last_seen: '14:03:22', scanner_interaction_observed: false },
    ];
    const tx: TransactionContext = {
      scans: [],
      tenders: [{ successful: true }],
    };

    const result = CorrelationEngine.correlate(items, tx);

    expect(result.unmatched_physical_items).toHaveLength(1);
    expect(result.flags.visible_item_without_scan).toBe(true);
    expect(result.quantity_discrepancy).toBe(1);
  });

  it('flags post-scan voids and deletes as suspicious', () => {
    const items: TrackedItem[] = [
      { id: 'item_1', first_seen: '14:03:20', scanner_interaction_observed: true },
    ];
    const tx: TransactionContext = {
      scans: [{ sku: 'SKU_ABC', quantity: 1, timestamp: '14:03:20' }],
      voids: [{ sku: 'SKU_ABC', timestamp: '14:03:22' }],
      deletes: [],
      tenders: [{ successful: true }],
    };

    const result = CorrelationEngine.correlate(items, tx);

    expect(result.flags.post_scan_void_detected).toBe(true);
    expect(result.pos_timeline.some((t) => t.description.includes('VOID'))).toBe(true);
  });
});
