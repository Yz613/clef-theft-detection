import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import { createServer } from '../src/server/api.js';
import { ShrinkDetectionService } from '../src/service/shrink_detection_service.js';

describe('Clef Crunch & Sample API Endpoints', () => {
  let app: express.Express;
  let server: any;
  let port: number;

  beforeAll(async () => {
    const service = new ShrinkDetectionService();
    app = createServer(service);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
    return () => {
      server?.close();
    };
  });

  it('serves static index.html and app.js', async () => {
    const htmlRes = await fetch(`http://localhost:${port}/index.html`);
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();
    expect(html).toContain("The universal decision engine for data & discovery");
    expect(html).toContain('app.js');

    const jsRes = await fetch(`http://localhost:${port}/app.js`);
    expect(jsRes.status).toBe(200);
    const js = await jsRes.text();
    expect(js).toContain('Clef');
  });

  it('handles open discovery query without data (e.g. random supermarkets in Texas)', async () => {
    const res = await fetch(`http://localhost:${port}/api/crunch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'find me random supermarkets in Texas',
        model: '@cf/cloudflare/clef-flash',
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.mode).toBe('discovery');
    expect(json.domain).toContain('Supermarkets');
    expect(json.incidents.length).toBeGreaterThan(0);
    expect(json.incidents[0].title).toBeDefined();
    expect(json.incidents[0].context).toContain('TX');
  });

  it('serves /api/sample-data with sweethearting CSV', async () => {
    const res = await fetch(`http://localhost:${port}/api/sample-data?preset=sweethearting`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('tx_id,store_id,register_id');
    expect(text).toContain('USDA Prime Filet Mignon');
  });

  it('runs analyze-sample for sweethearting scan-and-void detection', async () => {
    const res = await fetch(`http://localhost:${port}/api/analyze-sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset: 'sweethearting',
        query: 'Look for cashiers who scanned ribeye steak, voided it, and entered bananas',
        model: '@cf/cloudflare/clef-flash',
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.summary.records_checked).toBeGreaterThan(0);
    expect(json.summary.total_impact).toBeGreaterThan(0);
    expect(json.incidents.length).toBeGreaterThan(0);

    const first = json.incidents[0];
    expect(first.clef_match_pct).toBeDefined();
    expect(first.what_to_do).toBeDefined();
    expect(first.severity).toBeDefined();
  });

  it('runs POST /api/crunch with custom text records', async () => {
    const csv = `tx_id,store_id,register_id,cashier_id,timestamp,event_type,item_desc,total_price
TX_901,STORE_101,LANE_02,CASHIER_99,2026-10-08 14:00:00,ITEM_SCAN,Organic Ribeye Steak,45.00
TX_901,STORE_101,LANE_02,CASHIER_99,2026-10-08 14:00:05,ITEM_VOID,Organic Ribeye Steak,45.00
TX_901,STORE_101,LANE_02,CASHIER_99,2026-10-08 14:00:10,ITEM_MANUAL,Yellow Bananas PLU 4011,0.59`;

    const res = await fetch(`http://localhost:${port}/api/crunch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: csv,
        query: 'Look for cashiers who scanned ribeye steak, voided it, and entered bananas',
        model: '@cf/cloudflare/clef-flash',
        min_confidence: 0.50,
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.summary.records_checked).toBe(3);
    expect(json.incidents.length).toBeGreaterThan(0);
  });

  it('exports matched findings to CSV via POST /api/export/csv', async () => {
    const incidents = [
      {
        id: 'INC_001',
        severity: 'HIGH',
        title: 'Scan-Then-Void Substitution',
        entity: 'CASHIER_17',
        context: 'LANE_01',
        impact_formatted: '$39.99 at risk',
        clef_match_pct: '96% Match',
        clef_confidence: 'High',
        summary: 'Matches criteria',
        what_to_do: 'Inspect CCTV on Lane 01',
      },
    ];

    const res = await fetch(`http://localhost:${port}/api/export/csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        incidents,
        query: 'steak voided',
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const csvContent = await res.text();
    expect(csvContent).toContain('Incident ID');
    expect(csvContent).toContain('CASHIER_17');
    expect(csvContent).toContain('LANE_01');
  });
});
