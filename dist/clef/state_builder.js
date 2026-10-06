/**
 * Builds the multimodal state payload for Clef decision reasoning.
 */
export function buildClefState(input) {
    const { visual_context, transaction_context, checkout_type, event_id, lane_id, store_id } = input;
    const items = visual_context.tracked_items || [];
    const windows = visual_context.activity_windows || [];
    const cart = visual_context.cart_inspection || {
        main_basket_empty: true,
        lower_rack_items_detected: 0,
        child_seat_items_detected: 0,
        concealed_items_detected: 0,
    };
    const trajectories = items.map((item) => {
        const pathStr = item.path ? item.path.join(' -> ') : 'UNKNOWN';
        const encounteredScanner = item.scanner_interaction ??
            (item.path?.some((p) => p.toUpperCase().includes('SCANNER')) ?? false);
        const destination = item.path && item.path.length > 0
            ? item.path[item.path.length - 1]
            : 'UNKNOWN';
        return {
            item_id: item.id,
            label: item.label,
            path_sequence: pathStr,
            encountered_scanner: encounteredScanner,
            destination,
        };
    });
    const activityTimeline = windows.map((w) => ({
        phase: w.phase,
        time_range: `${w.start_time} - ${w.end_time}`,
        scanner_active: w.scanner_activated,
        notes: w.notes,
    }));
    // POS transaction metrics if provided (Phase 2)
    let transactionRecords;
    if (transaction_context) {
        const scansCount = (transaction_context.scans || []).reduce((acc, s) => acc + (s.quantity || 1), 0);
        const pluCount = (transaction_context.plu_entries || []).length;
        const totalPosUnits = scansCount + pluCount;
        const physicalUnits = items.length;
        const tenders = transaction_context.tenders || [];
        const tendersSuccessful = tenders.length > 0 && tenders.some((t) => t.successful !== false);
        transactionRecords = {
            scans_recorded: scansCount,
            plu_recorded: pluCount,
            voids_count: (transaction_context.voids || []).length,
            deletes_count: (transaction_context.deletes || []).length,
            cancels_count: (transaction_context.cancels || []).length,
            suspended: (transaction_context.suspends || []).length > 0,
            tenders_successful: tendersSuccessful,
            unmatched_physical_items: Math.max(0, physicalUnits - totalPosUnits),
            unmatched_pos_scans: Math.max(0, totalPosUnits - physicalUnits),
            quantity_discrepancy: physicalUnits - totalPosUnits,
        };
    }
    // Construct high-information density narrative for Clef's multimodal reasoning
    const narrativeParts = [];
    narrativeParts.push(`CHECKOUT LOSS ASSESSMENT: Event ${event_id} at lane ${lane_id || 'unspecified'} (${checkout_type.toUpperCase()}).`);
    narrativeParts.push(`VISUAL OBSERVATION WINDOW: ${visual_context.event_start || 'start'} to ${visual_context.event_end || 'end'}.`);
    narrativeParts.push(`PHYSICAL MERCHANDISE TRACKING:`);
    if (items.length === 0) {
        narrativeParts.push(`- No discrete item trajectories registered in current window.`);
    }
    else {
        items.forEach((item, idx) => {
            const path = item.path?.join(' -> ') || 'Unknown path';
            const scanStatus = item.scanner_interaction ? 'INTERACTION_OBSERVED' : 'NO_SCAN_INTERACTION';
            narrativeParts.push(`- Item #${idx + 1} (${item.id}${item.label ? `: ${item.label}` : ''}): Path [${path}], Scanner: [${scanStatus}].`);
        });
    }
    narrativeParts.push(`CART STATE INSPECTION:`);
    narrativeParts.push(`- Main basket empty: ${cart.main_basket_empty}`);
    narrativeParts.push(`- Bottom of basket (lower rack) items: ${cart.lower_rack_items_detected}`);
    narrativeParts.push(`- Child seat items: ${cart.child_seat_items_detected}`);
    narrativeParts.push(`- Concealed items flagged: ${cart.concealed_items_detected}`);
    if (activityTimeline.length > 0) {
        narrativeParts.push(`CHRONOLOGICAL ACTIVITY PHASES:`);
        activityTimeline.forEach((t) => {
            narrativeParts.push(`- [${t.time_range}] ${t.phase}: scanner_active=${t.scanner_active}${t.notes ? ` (${t.notes})` : ''}`);
        });
    }
    if (transaction_context && transactionRecords) {
        narrativeParts.push(`POS TRANSACTION LOG CROSS-REFERENCE:`);
        narrativeParts.push(`- Recorded Scans: ${transactionRecords.scans_recorded}, PLU entries: ${transactionRecords.plu_recorded}`);
        narrativeParts.push(`- Voids: ${transactionRecords.voids_count}, Deletes: ${transactionRecords.deletes_count}, Cancels: ${transactionRecords.cancels_count}`);
        narrativeParts.push(`- Transaction Suspended: ${transactionRecords.suspended}`);
        narrativeParts.push(`- Tender successful: ${transactionRecords.tenders_successful}`);
        narrativeParts.push(`- Physical items vs POS count discrepancy: ${transactionRecords.quantity_discrepancy}`);
    }
    else {
        narrativeParts.push(`POS TRANSACTION LOG: Not available for this event (Visual-only Phase 1 analysis).`);
    }
    return {
        structured_summary: {
            event_id,
            checkout_type,
            lane_id,
            store_id,
            time_window: {
                start: visual_context.event_start,
                end: visual_context.event_end,
            },
            camera_position: visual_context.camera_position,
            physical_items_detected: items.length,
            trajectories,
            cart_inspection: {
                bottom_of_basket_items: cart.lower_rack_items_detected,
                child_seat_items: cart.child_seat_items_detected,
                main_basket_empty: cart.main_basket_empty,
                concealed_items_flagged: cart.concealed_items_detected,
            },
            activity_timeline: activityTimeline,
            transaction_records: transactionRecords,
        },
        narrative_context: narrativeParts.join('\n'),
        frame_references: visual_context.frames,
    };
}
//# sourceMappingURL=state_builder.js.map