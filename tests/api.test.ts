import { describe, it, expect, beforeAll } from 'vitest';
import { createServer } from '../src/server/api.js';
import { ShrinkDetectionService } from '../src/service/shrink_detection_service.js';
import express from 'express';

describe('HTTP REST API Integration Tests', () => {
  let app: express.Express;
  let service: ShrinkDetectionService;

  beforeAll(async () => {
    service = new ShrinkDetectionService({ useSimulator: true });
    await service.seedDemoData();
    app = createServer(service);
  });

  it('serves /api/status with Clef model info', async () => {
    const res = await fetchApi(app, '/api/status');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model).toBe('@cf/cloudflare/clef');
    expect(body.service).toContain('Clef');
  });

  it('lists benchmark scenarios on /api/scenarios', async () => {
    const res = await fetchApi(app, '/api/scenarios');
    expect(res.status).toBe(200);
    const scenarios = await res.json();
    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBeGreaterThanOrEqual(6);
    expect(scenarios.some((s: any) => s.id === 'sco_skip_scan')).toBe(true);
  });

  it('runs scenario on POST /api/scenarios/:id/run', async () => {
    const res = await fetchApi(app, '/api/scenarios/bob_loss/run', {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const output = await res.json();
    expect(output.event_id).toBe('evt_bob_003');
    expect(output.events.bottom_of_basket.probability).toBeGreaterThan(0.9);
  });

  it('lists events and processes review submission', async () => {
    const listRes = await fetchApi(app, '/api/events');
    const items = await listRes.json();
    expect(items.length).toBeGreaterThan(0);

    const testEvent = items[0].event;
    const reviewRes = await fetchApi(app, `/api/events/${testEvent.event_id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: 'confirmed_loss',
        label: 'confirmed_skip_scan',
        reviewer_id: 'test_reviewer',
        notes: 'Confirmed by automated test',
      }),
    });

    expect(reviewRes.status).toBe(200);
    const updated = await reviewRes.json();
    expect(updated.status).toBe('reviewed');
    expect(updated.review.label).toBe('confirmed_skip_scan');
  });
});

// Minimal test runner helper without needing an open network port
async function fetchApi(app: express.Express, path: string, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const addr = server.address() as any;
      const port = addr.port;
      try {
        const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
        server.close();
        resolve(res);
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });
}
