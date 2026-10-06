/**
 * High-fidelity, probabilistic Clef emulator.
 * Evaluates Clef state and question instructions, returning structured
 * probabilities matching the exact @cf/cloudflare/clef System One API format.
 */
export class ClefSimulator {
    static evaluate(request) {
        const stateObj = typeof request.state === 'string'
            ? (() => {
                try {
                    return JSON.parse(request.state);
                }
                catch {
                    return null;
                }
            })()
            : request.state;
        const answers = {};
        for (const [qKey, qDef] of Object.entries(request.questions)) {
            if (qDef.type === 'noul') {
                const prob = this.evaluateNoulQuestion(qKey, stateObj, request.state);
                answers[qKey] = {
                    type: 'noul',
                    noul: Math.min(0.99, Math.max(0.01, Math.round(prob * 100) / 100)),
                };
            }
            else if (qDef.type === 'choice') {
                answers[qKey] = {
                    type: 'choice',
                    choice: 'cashier',
                    probabilities: { cashier: 0.82, self_checkout: 0.18 },
                    confidence: 0.64,
                };
            }
        }
        return {
            result: {
                model: request.model || '@cf/cloudflare/clef',
                answers,
            },
            success: true,
        };
    }
    static evaluateNoulQuestion(questionKey, stateObj, rawState) {
        const summary = stateObj?.structured_summary;
        const trajectories = summary?.trajectories || [];
        const cart = summary?.cart_inspection;
        const tx = summary?.transaction_records;
        const checkoutType = summary?.checkout_type || 'self_checkout';
        const cvMetrics = summary?.real_cv_metrics;
        // If real video computer vision metrics are present, compute dynamically from actual pixel motion!
        if (cvMetrics) {
            if (questionKey === 'pass_around')
                return cvMetrics.pass_around_probability;
            if (questionKey === 'skip_scan')
                return cvMetrics.skip_scan_probability;
            if (questionKey === 'bottom_of_basket')
                return cvMetrics.bottom_of_basket_probability;
            if (questionKey === 'unscanned_merchandise_event') {
                return Math.max(cvMetrics.pass_around_probability, cvMetrics.skip_scan_probability, cvMetrics.bottom_of_basket_probability);
            }
            if (questionKey === 'intentional_shrink') {
                const primary = Math.max(cvMetrics.pass_around_probability, cvMetrics.skip_scan_probability);
                return primary >= 0.60 ? Math.round(primary * 0.85 * 100) / 100 : 0.05;
            }
            if (questionKey === 'sweethearting' && checkoutType === 'cashier') {
                return cvMetrics.pass_around_probability >= 0.60 ? Math.round(cvMetrics.pass_around_probability * 0.88 * 100) / 100 : 0.02;
            }
            if (questionKey === 'sufficient_visual_evidence') {
                return Math.min(0.98, Math.max(0.70, 0.85 + (cvMetrics.motion_intensity * 0.1)));
            }
        }
        switch (questionKey) {
            case 'non_scan': {
                const passAround = this.evaluateNoulQuestion('pass_around', stateObj, rawState);
                const skipScan = this.evaluateNoulQuestion('skip_scan', stateObj, rawState);
                const fakeScan = this.evaluateNoulQuestion('fake_scan', stateObj, rawState);
                return Math.max(passAround, skipScan, fakeScan);
            }
            case 'left_in_cart': {
                const inCart = this.evaluateNoulQuestion('item_left_in_cart', stateObj, rawState);
                const bob = this.evaluateNoulQuestion('bottom_of_basket', stateObj, rawState);
                return Math.max(inCart, bob);
            }
            case 'inventory_loss': {
                const nonScan = this.evaluateNoulQuestion('non_scan', stateObj, rawState);
                const leftInCart = this.evaluateNoulQuestion('left_in_cart', stateObj, rawState);
                return Math.min(0.98, Math.max(0.04, Math.round(Math.max(nonScan * 0.94, leftInCart * 0.90) * 100) / 100));
            }
            case 'review_recommended': {
                const nonScan = this.evaluateNoulQuestion('non_scan', stateObj, rawState);
                const leftInCart = this.evaluateNoulQuestion('left_in_cart', stateObj, rawState);
                return Math.max(nonScan, leftInCart);
            }
            case 'no_sale': return 0.03;
            case 'price_lookup_abuse': return 0.04;
            case 'suspicious_refund': return 0.02;
            case 'canceled_transaction': return 0.03;
            case 'late_night_food_prep': return 0.01;
            case 'sufficient_visual_evidence': {
                if (!stateObj)
                    return 0.50;
                let score = 0.85;
                if (summary?.camera_position)
                    score += 0.05;
                if (trajectories.length > 0)
                    score += 0.05;
                return score;
            }
            case 'skip_scan': {
                // Did merchandise move from cart to bag without scanner interaction?
                const skippedItems = trajectories.filter((t) => !t.encountered_scanner &&
                    (t.path_sequence.includes('BAG') || t.path_sequence.includes('CUSTOMER_POSSESSION')));
                if (trajectories.length === 0)
                    return 0.04;
                if (skippedItems.length > 0) {
                    const ratio = skippedItems.length / trajectories.length;
                    return 0.80 + ratio * 0.16;
                }
                return 0.04;
            }
            case 'fake_scan': {
                // Apparent scanning motion but failed scanner presentation
                const fakeScanItems = trajectories.filter((t) => !t.encountered_scanner &&
                    t.path_sequence.includes('SCANNER_ZONE') &&
                    t.path_sequence.includes('BAG'));
                if (fakeScanItems.length > 0) {
                    return 0.88;
                }
                return 0.03;
            }
            case 'pass_around': {
                // Routed around scanner perimeter
                const passAroundItems = trajectories.filter((t) => !t.encountered_scanner &&
                    (t.path_sequence.includes('SIDE_OF_SCANNER') ||
                        t.path_sequence.includes('AROUND_SCANNER') ||
                        (t.path_sequence.includes('HAND') && t.path_sequence.includes('BAG') && !t.path_sequence.includes('SCANNER'))));
                if (passAroundItems.length > 0) {
                    return 0.86;
                }
                return 0.05;
            }
            case 'quantity_mismatch': {
                // Multiple units handled with fewer scanner interactions
                const totalItems = trajectories.length;
                const scannedItems = trajectories.filter((t) => t.encountered_scanner).length;
                if (totalItems >= 2 && scannedItems < totalItems) {
                    const diff = totalItems - scannedItems;
                    return Math.min(0.95, 0.65 + diff * 0.12);
                }
                if (tx && tx.quantity_discrepancy > 0) {
                    return Math.min(0.96, 0.70 + tx.quantity_discrepancy * 0.10);
                }
                return 0.06;
            }
            case 'product_stacking': {
                const stacked = trajectories.filter((t) => t.label?.toLowerCase().includes('stack') || t.path_sequence.includes('STACK'));
                return stacked.length > 0 ? 0.91 : 0.02;
            }
            case 'bagging_without_scan': {
                const directToBag = trajectories.filter((t) => (t.path_sequence.startsWith('CART') && t.path_sequence.endsWith('BAG') && !t.path_sequence.includes('SCANNER')) ||
                    t.path_sequence === 'CART -> HAND -> BAG');
                return directToBag.length > 0 ? 0.93 : 0.05;
            }
            case 'item_left_in_cart': {
                if (!cart)
                    return 0.05;
                if (cart.child_seat_items > 0 || !cart.main_basket_empty) {
                    return 0.89;
                }
                return 0.03;
            }
            case 'bottom_of_basket': {
                if (!cart)
                    return 0.02;
                if (cart.bottom_of_basket_items > 0) {
                    return 0.94;
                }
                return 0.02;
            }
            case 'concealed_item': {
                if (!cart)
                    return 0.02;
                if (cart.concealed_items_flagged > 0) {
                    return 0.82;
                }
                return 0.02;
            }
            case 'sweethearting': {
                // Deliberate cashier collusion
                if (checkoutType !== 'cashier')
                    return 0.01;
                const unscanned = trajectories.filter((t) => !t.encountered_scanner);
                const handoffs = trajectories.filter((t) => t.path_sequence.includes('CUSTOMER_POSSESSION'));
                if (unscanned.length >= 2 || (unscanned.length >= 1 && handoffs.length >= 1)) {
                    return 0.76;
                }
                if (unscanned.length === 1) {
                    return 0.32; // Ordinary missed scan doesn't prove collusion
                }
                return 0.02;
            }
            case 'unscanned_handoff': {
                if (checkoutType !== 'cashier')
                    return 0.01;
                const handoffs = trajectories.filter((t) => !t.encountered_scanner &&
                    (t.path_sequence.includes('CUSTOMER') || t.path_sequence.includes('HAND_CUSTOMER')));
                return handoffs.length > 0 ? 0.92 : 0.02;
            }
            case 'walkoff': {
                const departed = trajectories.filter((t) => t.destination === 'EXIT_ZONE' ||
                    t.path_sequence.includes('EXIT') ||
                    t.destination === 'CUSTOMER_POSSESSION');
                const unscanned = trajectories.filter((t) => !t.encountered_scanner);
                if (tx) {
                    if (!tx.tenders_successful && (departed.length > 0 || unscanned.length > 0)) {
                        return 0.97;
                    }
                    if (tx.tenders_successful)
                        return 0.01;
                }
                if (departed.length > 0 && unscanned.length > 0) {
                    return 0.87;
                }
                return 0.03;
            }
            case 'unscanned_merchandise_event': {
                // Overall unscanned merchandise likelihood
                const bob = cart?.bottom_of_basket_items > 0;
                const leftCart = cart?.child_seat_items > 0 || !cart?.main_basket_empty;
                const unscanned = trajectories.some((t) => !t.encountered_scanner);
                const posMismatch = tx && (tx.quantity_discrepancy > 0 || tx.unmatched_physical_items > 0);
                if (bob || leftCart || unscanned || posMismatch) {
                    return 0.91;
                }
                return 0.04;
            }
            case 'intentional_shrink': {
                // High evidence threshold for intent
                let intentSignals = 0;
                const unscanned = trajectories.filter((t) => !t.encountered_scanner);
                if (unscanned.length >= 2)
                    intentSignals += 2;
                if (trajectories.some((t) => t.path_sequence.includes('SIDE_OF_SCANNER') || t.path_sequence.includes('AROUND_SCANNER'))) {
                    intentSignals += 2;
                }
                if (cart?.concealed_items_flagged > 0)
                    intentSignals += 2;
                if (checkoutType === 'cashier' && unscanned.length > 0 && trajectories.some((t) => t.path_sequence.includes('CUSTOMER'))) {
                    intentSignals += 2;
                }
                if (tx && !tx.tenders_successful && trajectories.some((t) => t.path_sequence.includes('EXIT'))) {
                    intentSignals += 3;
                }
                if (intentSignals >= 3)
                    return 0.78;
                if (intentSignals >= 2)
                    return 0.64;
                if (intentSignals === 1)
                    return 0.35;
                return 0.05;
            }
            // Phase 2 T-Log questions
            case 'visible_item_without_scan': {
                if (!tx)
                    return 0.05;
                return tx.unmatched_physical_items > 0 ? 0.95 : 0.02;
            }
            case 'scan_without_visible_item': {
                if (!tx)
                    return 0.05;
                return tx.unmatched_pos_scans > 0 ? 0.88 : 0.02;
            }
            case 'visual_pos_quantity_mismatch': {
                if (!tx)
                    return 0.05;
                return tx.quantity_discrepancy !== 0 ? 0.93 : 0.03;
            }
            case 'sku_visual_mismatch': {
                // Check for substitution
                const hasSubstitution = trajectories.some((t) => t.label?.toLowerCase().includes('expensive') || t.label?.toLowerCase().includes('substitution'));
                return hasSubstitution ? 0.89 : 0.04;
            }
            case 'plu_visual_mismatch': {
                const hasPluMismatch = trajectories.some((t) => t.label?.toLowerCase().includes('organic') || t.label?.toLowerCase().includes('plu_fraud'));
                return hasPluMismatch ? 0.92 : 0.03;
            }
            case 'weight_mismatch': {
                const hasWeightIssue = trajectories.some((t) => t.label?.toLowerCase().includes('lift') || t.label?.toLowerCase().includes('weight'));
                return hasWeightIssue ? 0.87 : 0.03;
            }
            case 'post_scan_void': {
                if (!tx)
                    return 0.02;
                return tx.voids_count > 0 ? 0.91 : 0.02;
            }
            case 'post_scan_delete': {
                if (!tx)
                    return 0.02;
                return tx.deletes_count > 0 ? 0.90 : 0.02;
            }
            case 'cancelled_transaction_loss': {
                if (!tx)
                    return 0.02;
                return tx.cancels_count > 0 && trajectories.length > 0 ? 0.96 : 0.01;
            }
            case 'suspended_transaction_loss': {
                if (!tx)
                    return 0.02;
                return tx.suspended && trajectories.length > 0 ? 0.94 : 0.01;
            }
            case 'unpaid_walkoff': {
                if (!tx)
                    return 0.02;
                return !tx.tenders_successful && trajectories.length > 0 ? 0.97 : 0.01;
            }
            case 'override_abuse': {
                return stateObj?.structured_summary?.transaction_records ? 0.15 : 0.02;
            }
            default:
                return 0.10;
        }
    }
}
//# sourceMappingURL=simulator.js.map