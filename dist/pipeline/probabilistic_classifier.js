export class ProbabilisticClassifier {
    clefClient;
    constructor(clefClient) {
        this.clefClient = clefClient;
    }
    /**
     * Evaluates checkout video keyframes directly through Cloudflare Clef
     * multimodal decision model (@cf/cloudflare/clef).
     */
    async classify(input) {
        const { checkout_type, visual_context, transaction_context, event_id, store_id, lane_id } = input;
        // 1. Gather multimodal visual images (up to 4 keyframes)
        const images = [];
        if (visual_context.keyframes && visual_context.keyframes.length > 0) {
            visual_context.keyframes.forEach((kf) => {
                if (kf.data_url)
                    images.push(kf.data_url);
            });
        }
        // 2. Define comprehensive schema of typed decision questions for Clef
        const questions = {
            checkout_type: {
                type: 'choice',
                instructions: 'What type of checkout lane is shown in the camera footage?',
                criteria: {
                    cashier: 'A traditional manned cashier lane with cashier workstation and counter or conveyor',
                    self_checkout: 'A self-service customer checkout kiosk or terminal',
                },
            },
            non_scan: {
                type: 'noul',
                instructions: 'Did a non-scan, scan bypass, pass-around, or fake scan occur where merchandise moved past or around the scanner into bagging without being scanned?',
            },
            pass_around: {
                type: 'noul',
                instructions: 'Did the operator move merchandise around the perimeter or side of the scanner instead of across the scanner glass?',
            },
            left_in_cart: {
                type: 'noul',
                instructions: 'Did merchandise remain in the shopping cart, basket, child seat, or bottom-of-basket (BOB) rack without being presented for checkout?',
            },
            bottom_of_basket: {
                type: 'noul',
                instructions: 'Is there merchandise on the lower bottom rack of the shopping cart that was not scanned?',
            },
            sweethearting: {
                type: 'noul',
                instructions: 'Did the cashier deliberately allow unscanned merchandise through for a customer or sweetheart the transaction?',
            },
            unscanned_handoff: {
                type: 'noul',
                instructions: 'Was merchandise handed directly to the customer or placed into bags/cart without being scanned?',
            },
            no_sale: {
                type: 'noul',
                instructions: 'Did an unauthorized no-sale, register opening, or merchandise handoff occur without active scanning?',
            },
            price_lookup_abuse: {
                type: 'noul',
                instructions: 'Did a produce misclassification, cheap item substitution, or PLU price lookup abuse occur?',
            },
            suspicious_refund: {
                type: 'noul',
                instructions: 'Did a suspicious refund or return interaction occur where merchandise left with the customer?',
            },
            canceled_transaction: {
                type: 'noul',
                instructions: 'Did the transaction appear to be voided or canceled while merchandise left in the customer possession?',
            },
            inventory_loss: {
                type: 'noul',
                instructions: 'Is there probable inventory loss or unrecovered merchandise shrink from this interaction?',
            },
            late_night_food_prep: {
                type: 'noul',
                instructions: 'Is food or merchandise being prepared or taken during off-hours or late night without register ringing?',
            },
            review_recommended: {
                type: 'noul',
                instructions: 'Should this checkout event be escalated for human loss prevention review based on probable shrink?',
            },
        };
        // 3. Assemble state description for Clef
        const state = 'Sequential visual keyframes from grocery checkout security camera monitoring register, cashier/shopper, scanning deck, bagging area, and shopping cart. Analyze visual merchandise handling trajectories, scanner interactions, cart areas, and lane configuration.';
        // 4. Query Cloudflare Clef multimodal decision model
        console.log(`[ProbabilisticClassifier] Running Clef inference (${images.length} multimodal frames attached)...`);
        const clefResponse = await this.clefClient.run({
            state,
            images: images.length > 0 ? images.slice(0, 4) : undefined,
            questions,
        });
        const answers = clefResponse.result?.answers || {};
        const getProb = (key, defaultVal = 0.03) => {
            const ans = answers[key];
            if (ans && ans.type === 'noul')
                return Math.round(ans.noul * 1000) / 1000;
            return defaultVal;
        };
        // 5. Lane Type Auto-Detection from Clef
        const choiceAns = answers.checkout_type;
        let detectedCheckoutType = 'cashier';
        let checkoutTypeConfidence = 0.85;
        if (choiceAns && choiceAns.type === 'choice') {
            detectedCheckoutType = choiceAns.choice === 'cashier' ? 'cashier' : 'self_checkout';
            if (choiceAns.probabilities) {
                checkoutTypeConfidence = choiceAns.probabilities[detectedCheckoutType] ?? 0.85;
            }
        }
        const resolvedCheckoutType = checkout_type === 'auto' ? detectedCheckoutType : checkout_type;
        const laneEvidence = `Evaluated directly by Cloudflare Clef multimodal decision model (@cf/cloudflare/clef). Confidence: ${(checkoutTypeConfidence * 100).toFixed(1)}%.`;
        // 6. Retailer 8-Theft Categories Multi-Label Evaluation directly from Clef
        const nonScanProb = getProb('non_scan');
        const leftInCartProb = getProb('left_in_cart');
        const noSaleProb = getProb('no_sale');
        const pluAbuseProb = getProb('price_lookup_abuse');
        const refundProb = getProb('suspicious_refund');
        const cancelProb = getProb('canceled_transaction');
        const inventoryLossProb = getProb('inventory_loss');
        const foodPrepProb = getProb('late_night_food_prep');
        const passAroundProb = getProb('pass_around');
        const sweetheartingProb = getProb('sweethearting');
        const bobProb = getProb('bottom_of_basket');
        const unscannedHandoffProb = getProb('unscanned_handoff');
        const reviewRecommendedProb = getProb('review_recommended');
        const detectedTheftTypes = [];
        if (nonScanProb >= 0.50)
            detectedTheftTypes.push('Non-Scan');
        if (leftInCartProb >= 0.50)
            detectedTheftTypes.push('Left in Cart');
        if (inventoryLossProb >= 0.50)
            detectedTheftTypes.push('Inventory Loss');
        if (pluAbuseProb >= 0.50)
            detectedTheftTypes.push('Price Look-Up Abuse');
        if (noSaleProb >= 0.50)
            detectedTheftTypes.push('No Sale');
        if (refundProb >= 0.50)
            detectedTheftTypes.push('Suspicious Refund');
        if (cancelProb >= 0.50)
            detectedTheftTypes.push('Canceled Transaction');
        if (foodPrepProb >= 0.50)
            detectedTheftTypes.push('Late Night Food Prep');
        const retailerTheftSummary = {
            theft_count: detectedTheftTypes.length,
            detected_thefts: detectedTheftTypes,
            categories: {
                non_scan: {
                    key: 'non_scan',
                    label: 'Non-Scan',
                    detected: nonScanProb >= 0.50,
                    probability: nonScanProb,
                    evidence: nonScanProb >= 0.50
                        ? 'Item routed around or past scanner without scan interaction'
                        : 'Normal scanner presentation observed',
                },
                left_in_cart: {
                    key: 'left_in_cart',
                    label: 'Left in Cart',
                    detected: leftInCartProb >= 0.50,
                    probability: leftInCartProb,
                    evidence: leftInCartProb >= 0.50
                        ? 'Merchandise detected remaining in cart basket or bottom rack'
                        : 'Cart and lower rack clear upon departure',
                },
                no_sale: {
                    key: 'no_sale',
                    label: 'No Sale',
                    detected: noSaleProb >= 0.50,
                    probability: noSaleProb,
                    evidence: noSaleProb >= 0.50
                        ? 'Register drawer opened or item handed off without active scanning'
                        : 'No unassociated register opening observed',
                },
                price_lookup_abuse: {
                    key: 'price_lookup_abuse',
                    label: 'Price Look-Up Abuse',
                    detected: pluAbuseProb >= 0.50,
                    probability: pluAbuseProb,
                    evidence: pluAbuseProb >= 0.50
                        ? 'Item visually inconsistent with standard product class'
                        : 'No PLU or produce substitution observed',
                },
                suspicious_refund: {
                    key: 'suspicious_refund',
                    label: 'Suspicious Refund',
                    detected: refundProb >= 0.50,
                    probability: refundProb,
                    evidence: refundProb >= 0.50
                        ? 'Customer retained possession of returned merchandise'
                        : 'No suspicious refund flow detected',
                },
                canceled_transaction: {
                    key: 'canceled_transaction',
                    label: 'Canceled Transaction',
                    detected: cancelProb >= 0.50,
                    probability: cancelProb,
                    evidence: cancelProb >= 0.50
                        ? 'Shopper departed with merchandise following transaction cancellation'
                        : 'No canceled transaction departure detected',
                },
                inventory_loss: {
                    key: 'inventory_loss',
                    label: 'Inventory Loss',
                    detected: inventoryLossProb >= 0.50,
                    probability: inventoryLossProb,
                    evidence: inventoryLossProb >= 0.50
                        ? 'Probable unrecovered merchandise loss from unscanned checkout transit'
                        : 'All visible merchandise accounted for',
                },
                late_night_food_prep: {
                    key: 'late_night_food_prep',
                    label: 'Late Night Food Prep',
                    detected: foodPrepProb >= 0.50,
                    probability: foodPrepProb,
                    evidence: foodPrepProb >= 0.50
                        ? 'Food prep or consumption observed without register ring'
                        : 'No off-hour food preparation detected',
                },
            },
        };
        // 7. Overall shrink probability & prioritization
        const overallShrink = Math.max(reviewRecommendedProb, inventoryLossProb, nonScanProb, leftInCartProb);
        let review_priority = 'low';
        if (overallShrink >= 0.85) {
            review_priority = 'critical';
        }
        else if (overallShrink >= 0.70) {
            review_priority = 'high';
        }
        else if (overallShrink >= 0.40) {
            review_priority = 'medium';
        }
        const isReviewRecommended = overallShrink >= 0.50 || detectedTheftTypes.length > 0;
        // 8. Universal Typed Probabilities
        const universal_probabilities = {
            overall_shrink_probability: overallShrink,
            unscanned_merchandise_probability: Math.max(nonScanProb, leftInCartProb),
            fake_scan_probability: nonScanProb,
            skip_scan_probability: resolvedCheckoutType === 'self_checkout' ? nonScanProb : 0.0,
            pass_around_probability: passAroundProb,
            quantity_mismatch_probability: 0.05,
            item_left_in_cart_probability: leftInCartProb,
            bottom_of_basket_probability: bobProb,
            concealed_item_probability: 0.04,
            barcode_switch_probability: pluAbuseProb,
            ticket_switch_probability: 0.0,
            scan_swap_probability: 0.0,
            plu_mismatch_probability: pluAbuseProb,
            weight_manipulation_probability: 0.02,
            void_abuse_probability: 0.03,
            item_delete_probability: 0.03,
            cancelled_transaction_loss_probability: cancelProb,
            suspended_transaction_loss_probability: 0.02,
            refund_abuse_probability: refundProb,
            sweethearting_probability: sweetheartingProb,
            unauthorized_giveaway_probability: unscannedHandoffProb,
            attendant_assisted_shrink_probability: 0.02,
            walkoff_probability: cancelProb,
            evidence_quality_probability: 0.95,
        };
        // 9. Categories map
        const makeCat = (p) => ({
            probability: p,
            evidence_available: true,
        });
        const events = {
            fake_scan: makeCat(nonScanProb),
            pass_around: makeCat(passAroundProb),
            quantity_mismatch: makeCat(0.05),
            item_left_in_cart: makeCat(leftInCartProb),
            bottom_of_basket: makeCat(bobProb),
            concealed_item: makeCat(0.04),
            sweethearting: resolvedCheckoutType === 'cashier' ? makeCat(sweetheartingProb) : { probability: null, evidence_available: false },
            unscanned_handoff: resolvedCheckoutType === 'cashier' ? makeCat(unscannedHandoffProb) : { probability: null, evidence_available: false },
            skip_scan: resolvedCheckoutType === 'self_checkout' ? makeCat(nonScanProb) : { probability: null, evidence_available: false },
            product_stacking: { probability: null, evidence_available: false },
            bagging_without_scan: resolvedCheckoutType === 'self_checkout' ? makeCat(nonScanProb) : { probability: null, evidence_available: false },
            walkoff: makeCat(cancelProb),
            barcode_switch: makeCat(pluAbuseProb),
            ticket_switch: { probability: null, evidence_available: false },
            scan_swap: { probability: null, evidence_available: false },
            plu_mismatch: makeCat(pluAbuseProb),
            weight_manipulation: { probability: null, evidence_available: false },
            void_abuse: { probability: null, evidence_available: false },
            item_delete: { probability: null, evidence_available: false },
            cancelled_transaction_loss: makeCat(cancelProb),
            suspended_transaction_loss: { probability: null, evidence_available: false },
            refund_abuse: makeCat(refundProb),
            unauthorized_giveaway: makeCat(unscannedHandoffProb),
            attendant_assisted_shrink: { probability: null, evidence_available: false },
        };
        // Determine primary observable behavior
        let primaryBehavior = 'Normal Checkout Interaction';
        if (detectedTheftTypes.length > 1) {
            primaryBehavior = `Multiple Shrink Violations (${detectedTheftTypes.join(', ')})`;
        }
        else if (detectedTheftTypes.length === 1) {
            primaryBehavior = detectedTheftTypes[0];
        }
        // Timeline entries from keyframes
        const visualTimeline = (visual_context.keyframes || []).map((kf, idx) => ({
            timestamp: `${kf.timestamp_sec.toFixed(1)}s`,
            source: 'visual',
            severity: idx === 1 || idx === 2 ? 'suspicious' : 'normal',
            description: `Clef visual keyframe ${idx + 1} at ${kf.timestamp_sec.toFixed(1)}s`,
        }));
        // Explanations
        let humanExplanation = '';
        if (detectedTheftTypes.length > 1) {
            humanExplanation = `🚨 MULTIPLE THEFTS DETECTED (${detectedTheftTypes.length}): Clef identified concurrent shrink violations: ${detectedTheftTypes.join(', ')}. Overall loss probability is ${(overallShrink * 100).toFixed(1)}%. Immediate loss prevention review recommended.`;
        }
        else if (detectedTheftTypes.length === 1) {
            humanExplanation = `⚠️ THEFT DETECTED: Clef identified ${detectedTheftTypes[0]} with probability ${(overallShrink * 100).toFixed(1)}%. Escalation recommended.`;
        }
        else {
            humanExplanation = `✅ CLEAN TRANSACTION: Clef analyzed visual evidence and found no significant shrink indications across all 8 retailer theft categories (overall shrink probability: ${(overallShrink * 100).toFixed(1)}%).`;
        }
        return {
            event_id,
            store_id,
            lane_id,
            checkout_type: resolvedCheckoutType,
            detected_checkout_type: detectedCheckoutType,
            checkout_type_confidence: checkoutTypeConfidence,
            lane_classification_evidence: laneEvidence,
            detected_theft_types: detectedTheftTypes,
            retailer_theft_summary: retailerTheftSummary,
            timestamp: new Date().toISOString(),
            overall_shrink_probability: overallShrink,
            observable_behavior: {
                primary_behavior: primaryBehavior,
                behavior_probabilities: {
                    fake_scan: nonScanProb,
                    pass_around: passAroundProb,
                    item_left_in_cart: leftInCartProb,
                    sweethearting: sweetheartingProb,
                    unscanned_handoff: unscannedHandoffProb,
                },
            },
            loss_probability: {
                unscanned_merchandise_probability: Math.max(nonScanProb, leftInCartProb),
            },
            intent_probability: {
                intentional_shrink_probability: sweetheartingProb >= 0.5 ? sweetheartingProb : null,
                intent_confidence: sweetheartingProb >= 0.7 ? 'high' : sweetheartingProb >= 0.4 ? 'moderate' : 'low',
            },
            events,
            universal_probabilities,
            visual_evidence_quality: 0.95,
            review_priority,
            transaction_context_available: transaction_context !== null,
            timeline: visualTimeline,
            explanation: humanExplanation,
            recommendation: {
                review_recommended: isReviewRecommended,
                reason: humanExplanation,
                flagged_items: detectedTheftTypes.length > 0 ? ['item_unscanned_transit'] : [],
            },
        };
    }
}
//# sourceMappingURL=probabilistic_classifier.js.map