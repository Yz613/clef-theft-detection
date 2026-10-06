export class ObjectTracker {
    /**
     * Analyzes raw tracked item paths and labels to extract normalized
     * state sequences, scanner interactions, and behavioral trajectory flags.
     */
    static analyzeTrajectories(items) {
        const anomalies = [];
        let scannedCount = 0;
        let bypassedCount = 0;
        let bobCount = 0;
        const normalizedItems = items.map((item) => {
            const path = item.path || ['CART_MAIN', 'HAND_CUSTOMER', 'SCANNER_ZONE', 'BAGGING_AREA'];
            const pathUpper = path.map((p) => p.toUpperCase());
            // Did item encounter scanner zone?
            const encounteredScanner = item.scanner_interaction_observed ??
                pathUpper.some((p) => p.includes('SCANNER') && !p.includes('AROUND') && !p.includes('SIDE'));
            if (encounteredScanner) {
                scannedCount++;
            }
            else {
                bypassedCount++;
            }
            // Check for Bottom-of-Basket untouched
            const isBob = pathUpper.includes('CART_LOWER_RACK') || pathUpper.includes('LOWER_RACK');
            const staysInBob = isBob && !pathUpper.includes('HAND') && !pathUpper.includes('SCANNER');
            if (staysInBob) {
                bobCount++;
                anomalies.push({
                    item_id: item.id,
                    type: 'BOTTOM_OF_BASKET_UNTOUCHED',
                    description: `Item remained on lower cart rack (BOB) throughout checkout`,
                    severity: 'high',
                });
            }
            // Check for Skip Scan / Direct to Bag: CART -> HAND -> BAG without SCANNER
            const entersBag = pathUpper.some((p) => p.includes('BAG'));
            const entersHand = pathUpper.some((p) => p.includes('HAND'));
            if (entersHand && entersBag && !encounteredScanner) {
                anomalies.push({
                    item_id: item.id,
                    type: 'DIRECT_TO_BAG',
                    description: `Item moved from cart into bagging area without interacting with scanner`,
                    severity: 'high',
                });
            }
            // Check for Pass-around: routed around scanner
            const isPassAround = pathUpper.some((p) => p.includes('SIDE_OF_SCANNER') || p.includes('AROUND_SCANNER') || p.includes('BYPASS'));
            if (isPassAround) {
                anomalies.push({
                    item_id: item.id,
                    type: 'PASS_AROUND',
                    description: `Item deliberately moved around scanner perimeter into bagging area`,
                    severity: 'high',
                });
            }
            // Check for Unscanned Handoff: Handed directly to customer
            const isHandoff = pathUpper.some((p) => p.includes('HAND_CUSTOMER') || p.includes('CUSTOMER_POSSESSION')) &&
                pathUpper.includes('HAND_CASHIER') &&
                !encounteredScanner;
            if (isHandoff) {
                anomalies.push({
                    item_id: item.id,
                    type: 'UNSCANNED_HANDOFF',
                    description: `Cashier passed merchandise directly to customer without presentation to scanner`,
                    severity: 'high',
                });
            }
            // Check for Unpaid Exit
            const exitsWithCustomer = pathUpper.some((p) => p.includes('EXIT')) && !encounteredScanner;
            if (exitsWithCustomer) {
                anomalies.push({
                    item_id: item.id,
                    type: 'UNPAID_EXIT',
                    description: `Merchandise exited checkout area without scan confirmation`,
                    severity: 'high',
                });
            }
            return {
                ...item,
                scanner_interaction_observed: encounteredScanner,
            };
        });
        return {
            normalizedItems,
            anomalies,
            summary: {
                totalItems: items.length,
                scannedCount,
                bypassedCount,
                bobCount,
            },
        };
    }
}
//# sourceMappingURL=tracker.js.map