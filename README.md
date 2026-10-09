# Clef Store Guard — Universal Data Theft & Exception Scanner

**Cloudflare Clef Multi-Modal Decision Model for Retail Loss Prevention & Anomaly Detection**  
Deployed live on Cloudflare Workers edge: **`https://clef-theft-detection.yehudazahler.workers.dev`**

---

## 🎯 What This Tool Does

Clef Store Guard lets investigators and store operators:
1. **Input Any Data or Files**: Upload any file (CSV, TSV, JSON, JSONL, TXT, LOG, POSLog XML, etc.) or paste arbitrary text records directly into the built-in editor.
2. **Type What You Want Clef to Look For**: Instruct Clef in natural language with custom criteria (e.g., *"Find cashiers who scanned expensive meats, voided them, and typed produce PLUs like bananas"*, *"Look for completed cash transactions post-voided"*, *"Find drawer openings adjacent to voids"*).
3. **Crunch That Exact Data with Cloudflare Clef**: Cloudflare's `@cf/cloudflare/clef-flash` (9B) and `@cf/cloudflare/clef` (27B) multimodal decision models execute on Cloudflare Workers AI edge, evaluating System One typed decision questions (`matches_user_criteria`, `severity`, `investigation_priority`) to rank and explain matched incidents with exact receipts and CCTV review recommendations.

---

## 🌐 Live Deployed Application

- **Live URL**: [https://clef-theft-detection.yehudazahler.workers.dev](https://clef-theft-detection.yehudazahler.workers.dev)
- **Edge Architecture**: Cloudflare Workers with Workers AI (`env.AI`) binding + Cloudflare Assets.

---

## 🚀 Key Features

- **Shortlist-Inspired Minimalist Interface**:
  - Clean, distraction-free search experience modeled after `brochbuilds.com/shortlist`.
  - Single search box with warm editorial typography (`Inter` + `JetBrains Mono`), responsive design, and light/dark theme toggle.
  - Interactive preview card showing instant example scan results before typing.
  - Quick-fill suggestion chips for common loss prevention investigations.
- **Low-Friction Custom Data Input**:
  - Slide-out drawer with 1-click sample datasets (Sweethearting Steak Voids, Post-Void Cash Pocketing, Unverified Cash Refunds, Attendant Security Overrides).
  - Drag-and-drop file upload with live size feedback or direct paste editor for raw CSV rows, JSON arrays, or terminal logs.
  - Toggle between `@cf/cloudflare/clef-flash` (Fast 9B) and `@cf/cloudflare/clef` (Deep 27B).
- **Clean Results View & Live Stats**:
  - Live status ticker with 4 KPI cards: Records Checked, Flagged by Clef, Money at Risk, and Edge Latency.
  - Sticky sidebar filters by Severity, Register / Lane, Cashier / Operator, and Pattern Type with live record counts.
  - Filter tabs: Matches, Unsure, Cleared, and All.
  - Row cards with exposure amount, evidence chain, CCTV review recommendations, and expandable Clef System One Decision Inspector.
  - 1-click "Copy for Report" loss prevention brief, CSV download, and JSON export.

---

## 🛠️ API Reference

### `POST /api/crunch`
Crunches arbitrary data against investigator instructions.

**Payload (JSON or multipart/form-data):**
```json
{
  "data": "tx_id,store_id,register_id,cashier_id,timestamp,event_type,item_desc,total_price\nTX_01,Store 101,Lane 02,Cashier 15,2026-10-08 14:00:00,ITEM_SCAN,Organic Ribeye Steak,45.00\nTX_01,Store 101,Lane 02,Cashier 15,2026-10-08 14:00:05,ITEM_VOID,Organic Ribeye Steak,45.00\nTX_01,Store 101,Lane 02,Cashier 15,2026-10-08 14:00:10,ITEM_MANUAL,Yellow Bananas PLU 4011,0.59",
  "query": "Look for cashiers who scanned ribeye steak, voided it, and entered bananas",
  "model": "@cf/cloudflare/clef-flash",
  "min_confidence": 0.50
}
```

**Response:**
```json
{
  "status": "success",
  "query": "Look for cashiers who scanned ribeye steak, voided it, and entered bananas",
  "summary": {
    "transactions_checked": 3,
    "money_at_risk": 45.00,
    "high_risk_incidents": 1,
    "total_incidents": 1,
    "store_integrity": "92.0% Clean",
    "store_count": 1,
    "cashier_count": 1,
    "model_used": "@cf/cloudflare/clef-flash"
  },
  "incidents": [
    {
      "id": "INC_001",
      "severity": "HIGH",
      "title": "Scan-Then-Void Substitutions (1 items flagged)",
      "cashier": "Cashier 15",
      "register": "Lane 02",
      "store": "Store 101",
      "money_at_risk": 45.00,
      "summary": "Matches criteria: \"Look for cashiers who scanned ribeye steak, voided it, and entered bananas\"...",
      "what_to_do": "Inspect overhead CCTV on Lane 02 around 14:00:10. Verify if customer placed the voided items into bag.",
      "clef_pattern": "Sweethearting & Price Substitution",
      "clef_match_pct": "89% Match",
      "clef_confidence": "88% Certainty",
      "evidence_transactions": ["TX_01"]
    }
  ]
}
```

### `GET /api/sample-data?preset=sweethearting`
Returns pre-configured sample dataset CSV (`sweethearting`, `post_void`, `refunds`, `overrides`).

### `POST /api/export/csv`
Exports matched incident results as a downloadable CSV file.

---

## 💻 Local Development & Deployment

### Cloudflare Worker Deployment
```bash
bunx wrangler deploy
```

### Local Dev Server
```bash
bunx wrangler dev --port 8787
```

### Local Python Server
```bash
python3 start.py
```
Runs at `http://127.0.0.1:8080`.
