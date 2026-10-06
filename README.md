# Clef Grocery Checkout Shrink Detection

A production-grade checkout-loss detection service powered by **Cloudflare Clef** (`@cf/cloudflare/clef`), designed specifically for grocery retail loss prevention across cashier-operated lanes and self-checkout (SCO) stations.

---

## 🎯 Core Architectural Principles

1. **No Forcible Boolean Decisions (`theft = true / false`)**:
   Instead of forcing every ambiguous visual event into a binary theft verdict, Clef classifies observable behaviors and estimates fine-grained probabilities.

2. **Tiered Probability Separation**:
   ```text
   Observable Behavior  ──►  Transaction Consistency  ──►  Loss Probability  ──►  Intent Probability  ──►  Human Review
   (What happened?)          (Did POS record it?)          (Was merchandise unpaid?)   (Was it deliberate?)
   ```
   - **Observable Behavior Probability**: Visual evaluation of the physical motion (e.g. `skip_scan: 0.96`, `quantity_mismatch: 0.71`).
   - **Loss Probability**: Likelihood that merchandise exited without payment (`unscanned_merchandise: 0.81`).
   - **Intent Probability**: Evaluated separately under a strictly higher evidentiary threshold (`intentional_shrink: 0.64`).

3. **Strict Evidence Integrity**:
   Unsupported categories are **never** populated with invented zeroes. If evidence is unavailable (e.g. barcode switching without POS item recognition), the service returns:
   ```json
   {
     "probability": null,
     "evidence_available": false
   }
   ```
   *`0.02` means: We observed the checkout event and believe it probably did not happen.*
   *`null` means: We do not have sufficient information to evaluate this event.*

4. **Zero General-Purpose LLM Theft Decisions**:
   All final probabilistic decision gates are executed by Cloudflare Clef (`@cf/cloudflare/clef` / `@cf/cloudflare/clef-flash`) using typed `noul` questions in a single forward pass.

---

## 🏗️ System Architecture

```text
       ┌────────────────────────┐
       │ Checkout CCTV Camera   │
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────────────────────────────────────┐
       │ Video Pipeline & Activity Window Segmentation          │
       │ (before interaction, approach, scan, bag, cart, exit)  │
       └───────────┬────────────────────────────────────────────┘
                   │
                   ▼
       ┌────────────────────────────────────────────────────────┐
       │ Object Tracker: Merchandise Trajectory Model           │
       │ Track IDs: item_1, item_2...                           │
       │ Path: CART ─► HAND ─► SCANNER ─► BAG (Valid)           │
       │ Path: CART ─► HAND ─► BAG (Bypass Anomaly)             │
       └───────────┬────────────────────────────────────────────┘
                   │
                   ├──────────────────────────────────┐
                   │                                  │
                   ▼                                  ▼
      ┌─────────────────────────┐       ┌───────────────────────────┐
      │ Phase 1: Visual State   │       │ Phase 2: T-Log / POS      │
      │ Multimodal Context      │       │ Temporal Correlation      │
      │ (Frames, Trajectories)  │       │ (±3.5s Scan / PLU Match)  │
      └────────────┬────────────┘       └─────────────┬─────────────┘
                   │                                  │
                   └─────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │ Cloudflare Clef Decision Model  │
                    │      @cf/cloudflare/clef        │
                    │ System One Typed noul Questions │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │ Probabilistic Shrink Classifier │
                    │ Behavior, Loss, Intent, Alerts  │
                    └────────────────┬────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │ Interactive LP Review Dashboard │
                    │ Reviewer Decisions & Labels     │
                    └─────────────────────────────────┘
```

---

## 📋 Event Taxonomy

### Phase 1A — Cashier Lanes
- **Fake Scan / Scan Bypass** (`fake_scan`): Hand mimics scan motion without presenting barcode.
- **Pass-Around** (`pass_around`): Item routed around side of scanner rather than across window.
- **Multi-Item / Partial Scan** (`quantity_mismatch`): Multiple units handled, fewer scans observed.
- **Item Left in Cart** (`item_left_in_cart`): Merchandise left in main basket, child seat, or bottom tray.
- **Bottom-of-Basket (BOB)** (`bottom_of_basket`): Untouched items on cart lower rack exiting lane.
- **Unscanned Handoff** (`unscanned_handoff`): Cashier transfers merchandise directly to customer without scan.
- **Sweethearting Collusion** (`sweethearting`): Repeated deliberate bypasses & collusion patterns.
- **Concealed Cart Item** (`concealed_item`): Merchandise hidden under bags, boxes, or personal items.

### Phase 1B — Self-Checkout (SCO)
- **Skip Scan** (`skip_scan`): Merchandise moved from cart to bag bypassing scanner.
- **Fake Scan** (`fake_scan`): Ineffective presentation followed by immediate bagging.
- **Pass-Around** (`pass_around`): Routing merchandise around scanner perimeter.
- **Multi-Item Skip Scan** (`quantity_mismatch`): 3 cans handled, 1 scan interaction.
- **Product Stacking** (`product_stacking`): Two products held together during one scan.
- **Direct-to-Bag / Bagging Without Scan** (`bagging_without_scan`): Placement into bag without scanner interaction.
- **Walk-Off / Nonpayment** (`walkoff`): Customer leaves SCO area with merchandise without completing checkout.

### Phase 2 — POS / T-Log Correlation
- **Time Alignment**: Correlates visual item crossing scanner (`14:03:21.4`) with POS scan events (`14:03:20.9 UPC 12345`).
- **Produce / PLU Fraud** (`plu_visual_mismatch`): Organic Honeycrisp apples rung as 4011 bananas.
- **Visible Item Without Scan** (`visible_item_without_scan`): Physical item crossed with no matching POS scan.
- **Ghost Scans** (`scan_without_visible_item`): POS entry without physical merchandise interaction.
- **Quantity Discrepancy** (`visual_pos_quantity_mismatch`): Physical items count vs POS quantity mismatch.
- **Post-Scan Voids & Deletes** (`post_scan_void`, `post_scan_delete`): Item voided while departing with customer.

---

## 💻 Quick Start

### 1. Install & Build

```bash
# Clone repository
cd "Clef theft detection"

# Install dependencies
npm install

# Compile TypeScript
npm run build

# Run Vitest test suite (18 unit & integration tests)
npm test
```

### 2. Run the Service & Review UI

```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser to access the interactive Review UI!

---

## 📡 REST API Reference

### 1. Run Inference on a Checkout Event
`POST /api/detect`

**Request Body (`CheckoutInferenceInput`):**
```json
{
  "event_id": "evt_sco_001",
  "store_id": "store_104",
  "lane_id": "sco_lane_03",
  "checkout_type": "self_checkout",
  "visual_context": {
    "camera_position": "overhead_45deg_scanner_bagging",
    "event_start": "14:03:18",
    "event_end": "14:03:26",
    "tracked_items": [
      {
        "id": "item_1",
        "label": "Tide Liquid Detergent (92oz)",
        "path": ["CART_MAIN", "HAND_CUSTOMER", "BAGGING_AREA"],
        "scanner_interaction": false
      }
    ],
    "cart_inspection": {
      "main_basket_empty": true,
      "lower_rack_items_detected": 0,
      "child_seat_items_detected": 0,
      "concealed_items_detected": 0
    }
  },
  "transaction_context": null
}
```

**Response (`CheckoutEventOutput`):**
```json
{
  "event_id": "evt_sco_001",
  "checkout_type": "self_checkout",
  "overall_shrink_probability": 0.96,
  "observable_behavior": {
    "primary_behavior": "Skip scan",
    "behavior_probabilities": {
      "skip_scan": 0.96,
      "fake_scan": 0.03,
      "pass_around": 0.05,
      "quantity_mismatch": 0.06,
      "bottom_of_basket": 0.02,
      "item_left_in_cart": 0.03,
      "sweethearting": null,
      "walkoff": 0.03
    }
  },
  "loss_probability": {
    "unscanned_merchandise_probability": 0.91
  },
  "intent_probability": {
    "intentional_shrink_probability": 0.64,
    "intent_confidence": "moderate"
  },
  "events": {
    "skip_scan": { "probability": 0.96, "evidence_available": true },
    "fake_scan": { "probability": 0.03, "evidence_available": true },
    "bottom_of_basket": { "probability": 0.02, "evidence_available": true },
    "sweethearting": { "probability": null, "evidence_available": false },
    "barcode_switch": { "probability": null, "evidence_available": false }
  },
  "visual_evidence_quality": 0.88,
  "review_priority": "critical",
  "transaction_context_available": false,
  "timeline": [
    { "timestamp": "14:03:18", "source": "visual", "description": "Item lifted by shopper hand", "severity": "normal" },
    { "timestamp": "14:03:20", "source": "visual", "description": "No clear optical scanner interaction", "severity": "alert" },
    { "timestamp": "14:03:22", "source": "visual", "description": "Item deposited directly into bagging well", "severity": "alert" }
  ]
}
```

### 2. Submit Human Review Decision
`POST /api/events/:id/review`

**Decisions:**
- `confirmed_loss`
- `probably_loss`
- `operational_error`
- `no_loss`
- `unclear`

**Labels:**
- `confirmed_skip_scan`
- `confirmed_fake_scan`
- `confirmed_sweethearting`
- `confirmed_quantity_error`
- `confirmed_bob`
- `confirmed_barcode_switch`
- `confirmed_plu_fraud`
- `confirmed_walkoff`
- `confirmed_void_abuse`
- `confirmed_other_loss`
- `accidental_miss`
- `operational_error`
- `not_loss`
- `insufficient_evidence`

---

## 🧪 Testing & Verification

The test suite runs with Vitest:
```bash
npm test
```
Tests cover:
- ✅ Probabilistic separation (Behavior vs Loss vs Intent)
- ✅ Null output preservation for unsupported categories without inventing evidence
- ✅ Cashier Sweethearting detection
- ✅ Bottom-of-Basket (BOB) lower cart rack detection
- ✅ Self-checkout Skip Scan (`CART -> HAND -> BAG` path bypass)
- ✅ Multi-item partial scan / Quantity mismatch
- ✅ SCO Walk-off unpaid cart detection
- ✅ Phase 2 T-Log PLU produce fraud cross-referencing
- ✅ Clean baseline checkout verification
- ✅ REST API endpoints and review submission workflow
