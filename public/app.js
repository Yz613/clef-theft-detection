// Clef Grocery Checkout Shrink Detection Frontend Controller

let currentEvent = null;
let currentInput = null;
let currentDecision = null;
let animationTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadScenarios();
  await loadQueue();
});

function setupEventListeners() {
  document.getElementById('runScenarioBtn').addEventListener('click', async () => {
    const sel = document.getElementById('scenarioSelect');
    if (!sel.value) return;
    try {
      const res = await fetch(`/api/scenarios/${sel.value}/run`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to run scenario');
      const data = await res.json();
      await loadQueue();
      selectEvent(data.event_id);
    } catch (err) {
      alert('Error running scenario: ' + err.message);
    }
  });

  document.getElementById('viewClipBtn').addEventListener('click', () => {
    openClipModal();
  });

  document.getElementById('closeClipBtn').addEventListener('click', () => {
    closeClipModal();
  });

  document.getElementById('confirmClipDoneBtn').addEventListener('click', () => {
    closeClipModal();
  });

  document.getElementById('playPauseSimBtn').addEventListener('click', () => {
    startClipAnimation();
  });

  document.getElementById('viewRawJsonBtn').addEventListener('click', () => {
    openJsonModal();
  });

  document.getElementById('closeJsonBtn').addEventListener('click', () => {
    document.getElementById('jsonDialog').close();
  });

  document.getElementById('copyJsonBtn').addEventListener('click', () => {
    const text = document.getElementById('rawJsonViewer').textContent;
    navigator.clipboard.writeText(text);
    alert('Copied Clef payload to clipboard!');
  });

  // Review Decision button click handlers
  document.querySelectorAll('.btn-decision').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn-decision').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentDecision = btn.dataset.decision;

      // Auto-suggest matching label
      suggestLabelForDecision(currentDecision);
    });
  });

  // Submit Review
  document.getElementById('submitReviewBtn').addEventListener('click', async () => {
    if (!currentEvent) return;
    if (!currentDecision) {
      alert('Please select a human review decision (e.g. Confirmed Loss, Operational Error, etc.)');
      return;
    }

    const label = document.getElementById('reviewLabelSelect').value;
    const reviewerId = document.getElementById('reviewerIdInput').value || 'analyst_1';
    const notes = document.getElementById('reviewerNotesInput').value;

    try {
      const res = await fetch(`/api/events/${currentEvent.event_id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: currentDecision,
          label,
          reviewer_id: reviewerId,
          notes,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit review');
      const updated = await res.json();
      currentEvent = updated.event;
      renderCurrentEvent(updated);
      await loadQueue();
      alert(`Review recorded successfully: ${label} [${currentDecision}]`);
    } catch (err) {
      alert('Error submitting review: ' + err.message);
    }
  });
}

async function loadScenarios() {
  try {
    const res = await fetch('/api/scenarios');
    const scenarios = await res.json();
    const select = document.getElementById('scenarioSelect');
    select.innerHTML = '<option value="">-- Load Scenario --</option>';

    scenarios.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `[${s.phase}] ${s.name}`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load scenarios:', err);
  }
}

async function loadQueue() {
  try {
    const res = await fetch('/api/events');
    const items = await res.json();
    const list = document.getElementById('queueList');
    const count = document.getElementById('queueCount');
    list.innerHTML = '';
    count.textContent = `${items.length} items`;

    if (items.length === 0) {
      list.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 10px;">Queue is empty</div>';
      return;
    }

    items.forEach((item) => {
      const ev = item.event;
      const el = document.createElement('div');
      el.className = `queue-item ${currentEvent && currentEvent.event_id === ev.event_id ? 'active' : ''}`;
      el.dataset.id = ev.event_id;

      const scoreClass =
        ev.overall_shrink_probability >= 0.85
          ? 'score-critical'
          : ev.overall_shrink_probability >= 0.70
          ? 'score-high'
          : ev.overall_shrink_probability >= 0.40
          ? 'score-medium'
          : 'score-low';

      const pct = Math.round(ev.overall_shrink_probability * 100);

      el.innerHTML = `
        <div class="queue-header">
          <span class="queue-id">${ev.event_id}</span>
          <span class="queue-score ${scoreClass}">${pct}%</span>
        </div>
        <div class="queue-title">${ev.observable_behavior.primary_behavior}</div>
        <div class="queue-tags">
          <span class="tag">${ev.checkout_type === 'cashier' ? 'Cashier' : 'SCO'}</span>
          <span class="tag">${item.status === 'reviewed' ? '✓ ' + (item.review ? item.review.decision : 'Reviewed') : 'Pending'}</span>
        </div>
      `;

      el.addEventListener('click', () => {
        selectEvent(ev.event_id);
      });

      list.appendChild(el);
    });

    if (!currentEvent && items.length > 0) {
      selectEvent(items[0].event.event_id);
    }
  } catch (err) {
    console.error('Failed to load review queue:', err);
  }
}

async function selectEvent(eventId) {
  try {
    const res = await fetch(`/api/events/${eventId}`);
    if (!res.ok) throw new Error('Event not found');
    const item = await res.json();
    currentEvent = item.event;
    currentInput = item.input;
    renderCurrentEvent(item);

    // Update active class in list
    document.querySelectorAll('.queue-item').forEach((q) => {
      q.classList.toggle('active', q.dataset.id === eventId);
    });
  } catch (err) {
    console.error('Failed to load event details:', err);
  }
}

function renderCurrentEvent(item) {
  const ev = item.event;
  const review = item.review;

  // Hero Meta
  document.getElementById('heroEventId').textContent = ev.event_id;

  const prioBadge = document.getElementById('heroPriorityBadge');
  prioBadge.textContent = ev.review_priority.toUpperCase();
  prioBadge.className = `status-pill ${
    ev.review_priority === 'critical' ? 'score-critical' :
    ev.review_priority === 'high' ? 'score-high' :
    ev.review_priority === 'medium' ? 'score-medium' : 'score-low'
  }`;

  const typeBadge = document.getElementById('heroCheckoutTypeBadge');
  typeBadge.textContent = ev.checkout_type === 'cashier' ? 'CASHIER LANE' : 'SELF CHECKOUT';

  document.getElementById('heroStoreLane').textContent = `Lane: ${ev.lane_id || 'SCO-01'} | Store: ${ev.store_id || 'Store 104'}`;
  document.getElementById('heroTimestamp').textContent = `Observed: ${ev.timestamp}`;
  document.getElementById('heroPosStatus').textContent = ev.transaction_context_available ? 'POS: Correlated (T-Log)' : 'POS: Visual Only (Phase 1)';
  document.getElementById('heroExplanation').textContent = ev.explanation;

  // Gauges
  const lossPct = Math.round(ev.overall_shrink_probability * 100);
  document.getElementById('gaugeLossLikelihood').textContent = `${lossPct}%`;
  document.getElementById('gaugeLossLikelihood').style.color = lossPct >= 70 ? 'var(--danger)' : lossPct >= 40 ? 'var(--warning)' : 'var(--success)';

  const intentProb = ev.intent_probability.intentional_shrink_probability;
  document.getElementById('gaugeIntent').textContent = intentProb !== null ? `${Math.round(intentProb * 100)}%` : 'N/A';

  const qualProb = ev.visual_evidence_quality;
  document.getElementById('gaugeQuality').textContent = `${Math.round(qualProb * 100)}%`;

  // Primary behavior badge
  document.getElementById('primaryBehaviorBadge').textContent = `Primary: ${ev.observable_behavior.primary_behavior}`;

  // Behavior Probabilities List
  renderBehaviorProbabilities(ev);

  // Trajectory Path
  renderTrajectory(item.input);

  // Timeline
  renderTimeline(ev.timeline);

  // Review status
  const revStatusEl = document.getElementById('currentReviewStatus');
  if (item.status === 'reviewed' && review) {
    revStatusEl.textContent = `REVIEWED: ${review.decision.toUpperCase()} (${review.label})`;
    revStatusEl.className = 'status-pill score-low';
    document.getElementById('reviewerNotesInput').value = review.notes || '';
    document.getElementById('reviewLabelSelect').value = review.label;

    document.querySelectorAll('.btn-decision').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.decision === review.decision);
    });
    currentDecision = review.decision;
  } else {
    revStatusEl.textContent = 'PENDING REVIEW';
    revStatusEl.className = 'status-pill score-medium';
    document.querySelectorAll('.btn-decision').forEach((btn) => btn.classList.remove('selected'));
    document.getElementById('reviewerNotesInput').value = '';
    currentDecision = null;

    // Suggest default label based on highest probability
    suggestLabelFromEvent(ev);
  }
}

function renderBehaviorProbabilities(ev) {
  const container = document.getElementById('behaviorProbList');
  container.innerHTML = '';

  const behaviorKeys = [
    { key: 'skip_scan', name: 'Skip scan' },
    { key: 'fake_scan', name: 'Fake scan' },
    { key: 'pass_around', name: 'Pass-around' },
    { key: 'quantity_mismatch', name: 'Quantity mismatch' },
    { key: 'bagging_without_scan', name: 'Bagging without scan' },
    { key: 'item_left_in_cart', name: 'Item left in cart' },
    { key: 'bottom_of_basket', name: 'Bottom-of-basket item' },
    { key: 'sweethearting', name: 'Sweethearting collusion' },
    { key: 'walkoff', name: 'Walk-off without payment' },
    { key: 'plu_mismatch', name: 'Produce PLU mismatch' },
    { key: 'barcode_switch', name: 'Barcode switch / substitution' },
  ];

  behaviorKeys.forEach(({ key, name }) => {
    const entry = ev.events[key];
    const row = document.createElement('div');
    row.className = 'prob-row';

    if (!entry || entry.probability === null || !entry.evidence_available) {
      row.innerHTML = `
        <div class="prob-header">
          <span class="prob-name" style="color: var(--text-dim);">${name}</span>
          <span class="prob-unavailable">Unsupported / No evidence</span>
        </div>
        <div class="prob-meter-bg">
          <div class="prob-meter-fill" style="width: 0%;"></div>
        </div>
      `;
    } else {
      const pct = Math.round(entry.probability * 100);
      const color =
        pct >= 80 ? 'var(--danger)' :
        pct >= 60 ? '#f97316' :
        pct >= 30 ? 'var(--warning)' : 'var(--success)';

      row.innerHTML = `
        <div class="prob-header">
          <span class="prob-name">${name}</span>
          <span class="prob-percent" style="color: ${color};">${pct}%</span>
        </div>
        <div class="prob-meter-bg">
          <div class="prob-meter-fill" style="width: ${pct}%; background: ${color};"></div>
        </div>
      `;
    }

    container.appendChild(row);
  });
}

function renderTrajectory(input) {
  const container = document.getElementById('trajectoryPathContainer');
  const countEl = document.getElementById('trajectoryAnomaliesCount');
  container.innerHTML = '';

  const items = input?.visual_context?.tracked_items || [];
  if (items.length === 0) {
    container.innerHTML = '<span style="color: var(--text-dim); font-size: 0.8rem;">No item trajectories available</span>';
    countEl.textContent = 'None';
    return;
  }

  let totalAnomalies = 0;

  items.forEach((item, idx) => {
    const path = item.path || ['CART', 'HAND', 'SCANNER', 'BAG'];
    const hasScanner = item.scanner_interaction || path.some((p) => p.includes('SCANNER'));

    if (!hasScanner) totalAnomalies++;

    const itemLabel = document.createElement('div');
    itemLabel.style.width = '100%';
    itemLabel.style.fontSize = '0.78rem';
    itemLabel.style.color = 'var(--text-muted)';
    itemLabel.style.marginTop = idx > 0 ? '8px' : '0px';
    itemLabel.textContent = `Item ${idx + 1}: ${item.label || item.id}`;
    container.appendChild(itemLabel);

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.flexWrap = 'wrap';

    path.forEach((node, nIdx) => {
      const span = document.createElement('span');
      span.className = 'path-node';
      span.textContent = node;

      if (!hasScanner && (node.includes('BAG') || node.includes('CUSTOMER') || node.includes('EXIT'))) {
        span.classList.add('suspicious');
      } else if (node.includes('SCANNER')) {
        span.classList.add('valid');
      }

      row.appendChild(span);

      if (nIdx < path.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'path-arrow';
        arrow.textContent = '→';
        row.appendChild(arrow);
      }
    });

    container.appendChild(row);
  });

  countEl.textContent = totalAnomalies > 0 ? `${totalAnomalies} bypass anomalies detected` : 'Clean trajectory';
  countEl.style.color = totalAnomalies > 0 ? 'var(--danger)' : 'var(--success)';
}

function renderTimeline(timeline) {
  const container = document.getElementById('timelineList');
  container.innerHTML = '';

  if (!timeline || timeline.length === 0) {
    container.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem;">No timeline events</div>';
    return;
  }

  timeline.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'timeline-item';

    let dotClass = 'dot-normal';
    if (item.source === 'pos') {
      dotClass = item.severity === 'alert' ? 'dot-alert' : 'dot-pos';
    } else if (item.severity === 'alert') {
      dotClass = 'dot-alert';
    } else if (item.severity === 'suspicious') {
      dotClass = 'dot-suspicious';
    }

    el.innerHTML = `
      <div class="timeline-dot ${dotClass}"></div>
      <div class="timeline-time">${item.timestamp}</div>
      <div class="timeline-content">
        <span class="timeline-source source-${item.source}">${item.source}</span>
        ${item.description}
      </div>
    `;

    container.appendChild(el);
  });
}

function suggestLabelForDecision(decision) {
  const select = document.getElementById('reviewLabelSelect');
  if (!currentEvent) return;

  if (decision === 'no_loss') {
    select.value = 'not_loss';
    return;
  }
  if (decision === 'operational_error') {
    select.value = 'operational_error';
    return;
  }
  if (decision === 'unclear') {
    select.value = 'insufficient_evidence';
    return;
  }

  suggestLabelFromEvent(currentEvent);
}

function suggestLabelFromEvent(ev) {
  const select = document.getElementById('reviewLabelSelect');
  const prim = ev.observable_behavior.primary_behavior.toLowerCase();

  if (prim.includes('skip scan')) select.value = 'confirmed_skip_scan';
  else if (prim.includes('fake scan')) select.value = 'confirmed_fake_scan';
  else if (prim.includes('sweethearting')) select.value = 'confirmed_sweethearting';
  else if (prim.includes('quantity')) select.value = 'confirmed_quantity_error';
  else if (prim.includes('bottom-of-basket') || prim.includes('bob')) select.value = 'confirmed_bob';
  else if (prim.includes('plu')) select.value = 'confirmed_plu_fraud';
  else if (prim.includes('walk-off') || prim.includes('walkoff')) select.value = 'confirmed_walkoff';
  else if (prim.includes('void')) select.value = 'confirmed_void_abuse';
  else select.value = 'confirmed_other_loss';
}

function openClipModal() {
  const dialog = document.getElementById('clipDialog');
  dialog.showModal();
  startClipAnimation();
}

function closeClipModal() {
  if (animationTimer) cancelAnimationFrame(animationTimer);
  document.getElementById('clipDialog').close();
}

function startClipAnimation() {
  const canvas = document.getElementById('clipCanvas');
  const ctx = canvas.getContext('2d');
  let frame = 0;

  if (animationTimer) cancelAnimationFrame(animationTimer);

  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines for checkout camera view
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Checkout Lane Elements
    // Cart Zone (Left)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 100, 120, 180);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
    ctx.fillRect(40, 100, 120, 180);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '12px ui-monospace';
    ctx.fillText('CART ZONE', 60, 125);

    // Scanner Optical Window (Middle)
    const scannerX = 280;
    const scannerY = 140;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(scannerX, scannerY, 80, 100);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.fillRect(scannerX, scannerY, 80, 100);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('OPTICAL SCANNER', scannerX - 10, scannerY - 10);

    // Bagging Well (Right)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.strokeRect(480, 100, 120, 180);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
    ctx.fillRect(480, 100, 120, 180);
    ctx.fillStyle = '#10b981';
    ctx.fillText('BAGGING WELL', 495, 125);

    // Calculate item movement across frames
    frame = (frame + 1) % 240;
    const t = frame / 240;

    let itemX = 100;
    let itemY = 190;

    const isSkipScan = currentEvent?.events?.skip_scan?.probability && currentEvent.events.skip_scan.probability > 0.5;
    const isPassAround = currentEvent?.events?.pass_around?.probability && currentEvent.events.pass_around.probability > 0.5;

    if (isSkipScan || isPassAround) {
      // Bypasses around scanner (Arcing upwards away from scanner window)
      itemX = 100 + t * 440;
      itemY = 190 - Math.sin(t * Math.PI) * 90; // Routes above/around scanner
    } else {
      // Normal path: directly across optical scanner
      itemX = 100 + t * 440;
      itemY = 190;
    }

    // Draw item bounding box
    ctx.strokeStyle = isSkipScan ? '#ef4444' : '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(itemX - 25, itemY - 25, 50, 50);
    ctx.fillStyle = isSkipScan ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)';
    ctx.fillRect(itemX - 25, itemY - 25, 50, 50);

    // Item Label tag
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px ui-monospace';
    ctx.fillText('item_1 [TRACKED]', itemX - 40, itemY - 32);

    // Trajectory Path Trail
    ctx.strokeStyle = isSkipScan ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(100, 190);
    ctx.lineTo(itemX, itemY);
    ctx.stroke();
    ctx.setLineDash([]);

    animationTimer = requestAnimationFrame(draw);
  }

  draw();
}

function openJsonModal() {
  const dialog = document.getElementById('jsonDialog');
  const pre = document.getElementById('rawJsonViewer');
  pre.textContent = JSON.stringify(
    {
      input: currentInput,
      clef_output: currentEvent,
    },
    null,
    2
  );
  dialog.showModal();
}
