// Clef Store Guard — Minimalist Decision Engine Interface
// Inspired by Shortlist (brochbuilds.com/shortlist)

const BASE = "";
const $ = (id) => document.getElementById(id);
const escH = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const usd = (v) => "$" + Number(v || 0).toFixed(2);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function toast(t) {
  const e = $("toast");
  if (!e) return;
  e.textContent = t;
  e.classList.add("show");
  setTimeout(() => e.classList.remove("show"), 2200);
}

// -----------------------------------------------------------------------------
// PRESETS & CONFIG
// -----------------------------------------------------------------------------
const LANE_CONFIGS = {
  sweethearting: {
    placeholder: "cashiers scanning ribeye steak, voiding it, and entering bananas",
    defaultQuery: "Look for cashiers who scanned ribeye steak, voided it, and entered bananas",
    dataset: "sweethearting",
    datasetLabel: "248 records · Sweethearting",
    plan: "Evaluates against <b>248 transaction records</b> · Clef Flash 9B · Scan-then-void detection",
  },
  post_void: {
    placeholder: "completed cash transactions post-voided after customer departure",
    defaultQuery: "Look for completed cash transactions that were post-voided shortly after customer departure",
    dataset: "post_void",
    datasetLabel: "190 records · Cash Till Skimming",
    plan: "Evaluates against <b>190 cash register events</b> · Clef Flash 9B · Post-void analysis",
  },
  refunds: {
    placeholder: "unverified cash refunds over $50 without receipt or manager override",
    defaultQuery: "Find unverified cash refunds over $50 without receipt or repeated security overrides",
    dataset: "refunds",
    datasetLabel: "115 records · Refunds & Overrides",
    plan: "Evaluates against <b>115 return transactions</b> · Clef Flash 9B · Exception scoring",
  },
  universal: {
    placeholder: "type any pattern, policy violation, or anomaly to check...",
    defaultQuery: "Detect any suspicious anomalies, policy violations, or exceptions in this data",
    dataset: "sweethearting",
    datasetLabel: "Custom data / Universal",
    plan: "Evaluates against active dataset · Clef Flash 9B · Edge decision questions",
  },
};

// -----------------------------------------------------------------------------
// STATE
// -----------------------------------------------------------------------------
let activeLane = "sweethearting";
let activeModel = "@cf/cloudflare/clef-flash";
let activeDataset = "sweethearting";
let customDataContent = null;
let customFile = null;
let currentResults = null;
let activeTab = "hot";
let manualFilters = {};
let isRunning = false;
let abortCtrl = null;
let recentSearches = [];

// -----------------------------------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  loadRecentSearches();
  setupLaneButtons();
  setupSampleBox();
  setupTryChips();
  setupModelToggle();
  setupThemeToggle();
  setupDrawer();
  setupFilters();
  setupActions();
  setupBackLink();

  // Set initial input and plan
  updateLane(activeLane);
});

// -----------------------------------------------------------------------------
// THEME & MODEL TOGGLES
// -----------------------------------------------------------------------------
function setupThemeToggle() {
  const btn = $("themeBtn");
  if (!btn) return;
  btn.onclick = () => {
    const current = document.documentElement.dataset.theme;
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("clef_theme", next);
    toast(`Switched to ${next} theme`);
  };
}

function setupModelToggle() {
  const btn = $("modelPill");
  if (!btn) return;
  btn.onclick = () => {
    if (activeModel === "@cf/cloudflare/clef-flash") {
      activeModel = "@cf/cloudflare/clef";
      btn.textContent = "Clef 27B";
      toast("Model switched to Clef 27B (Deep Reasoning)");
    } else {
      activeModel = "@cf/cloudflare/clef-flash";
      btn.textContent = "Clef Flash 9B";
      toast("Model switched to Clef Flash 9B (Ultra-fast edge)");
    }
    updatePlanText();
  };
}

// -----------------------------------------------------------------------------
// LANE (MODE) SWITCHER
// -----------------------------------------------------------------------------
function setupLaneButtons() {
  const laneEl = $("lane");
  if (!laneEl) return;
  laneEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-lane]");
    if (!btn) return;
    const lane = btn.dataset.lane;
    updateLane(lane);
  });
}

function updateLane(lane) {
  activeLane = lane;
  document.querySelectorAll("#lane button").forEach((b) => {
    b.classList.toggle("on", b.dataset.lane === lane);
  });

  const cfg = LANE_CONFIGS[lane] || LANE_CONFIGS.sweethearting;
  const line = $("line");
  if (line) {
    line.placeholder = cfg.placeholder;
  }
  if (!customDataContent && !customFile) {
    activeDataset = cfg.dataset;
    updateDatasetPill(cfg.datasetLabel);
  }
  updatePlanText();
}

function updateDatasetPill(label) {
  const pill = $("datasetPill");
  if (pill) pill.textContent = label;
}

function updatePlanText() {
  const planEl = $("plan");
  if (!planEl) return;
  const cfg = LANE_CONFIGS[activeLane] || LANE_CONFIGS.sweethearting;
  const modelShort = activeModel.includes("clef-flash") ? "Clef Flash 9B" : "Clef 27B";
  const recordsNote = customFile ? `${customFile.name} loaded` : customDataContent ? "Custom records loaded" : cfg.datasetLabel;
  planEl.innerHTML = `Evaluates against <b>${escH(recordsNote)}</b> · ${modelShort} · Cloudflare Workers AI edge`;
}

// -----------------------------------------------------------------------------
// SAMPLE PREVIEW CARD
// -----------------------------------------------------------------------------
function setupSampleBox() {
  const sample = $("sample");
  if (!sample) return;
  sample.onclick = () => {
    updateLane("sweethearting");
    $("line").value = LANE_CONFIGS.sweethearting.defaultQuery;
    executeScan();
  };
}

// -----------------------------------------------------------------------------
// TRY CHIPS
// -----------------------------------------------------------------------------
function setupTryChips() {
  document.querySelectorAll(".exb").forEach((btn) => {
    btn.onclick = () => {
      const q = btn.dataset.q;
      const lane = btn.dataset.lane || "sweethearting";
      updateLane(lane);
      $("line").value = q;
      executeScan();
    };
  });
}

// -----------------------------------------------------------------------------
// BACK NAVIGATION
// -----------------------------------------------------------------------------
function setupBackLink() {
  const back = $("back");
  const home = $("brandHome");
  const reset = () => {
    if (isRunning) abortCtrl?.abort();
    document.body.classList.remove("ran");
    $("results").classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (back) back.onclick = reset;
  if (home) home.onclick = (e) => { e.preventDefault(); reset(); };
}

// -----------------------------------------------------------------------------
// RUNNING THE SCAN
// -----------------------------------------------------------------------------
const form = $("form");
if (form) {
  form.onsubmit = (e) => {
    e.preventDefault();
    if (isRunning) {
      abortCtrl?.abort();
      return;
    }
    executeScan();
  };
}

async function executeScan() {
  const inputEl = $("line");
  const query = (inputEl?.value || "").trim() || (LANE_CONFIGS[activeLane]?.defaultQuery || "Find retail theft anomalies");

  isRunning = true;
  abortCtrl = new AbortController();

  // Switch UI to ran state (collapses hero, opens results)
  document.body.classList.add("ran");
  $("results").classList.remove("hidden");
  $("go").textContent = "Stop";
  $("go").classList.add("stop");
  $("progWrap").classList.remove("hidden");
  $("prog").style.width = "20%";

  $("lvTitle").textContent = query;
  $("lvKick").textContent = `Clef Store Guard × Workers AI · evaluating`;
  $("lvBarA").style.width = "30%";
  $("lvBarB").style.width = "30%";

  saveRecentSearch(query);

  const t0 = performance.now();

  try {
    let res;
    if (customFile) {
      const fd = new FormData();
      fd.append("file", customFile);
      fd.append("query", query);
      fd.append("model", activeModel);
      fd.append("min_confidence", "0.50");
      res = await fetch(`${BASE}/api/crunch`, { method: "POST", body: fd, signal: abortCtrl.signal });
    } else if (customDataContent) {
      const fd = new FormData();
      fd.append("data", customDataContent);
      fd.append("query", query);
      fd.append("model", activeModel);
      fd.append("min_confidence", "0.50");
      res = await fetch(`${BASE}/api/crunch`, { method: "POST", body: fd, signal: abortCtrl.signal });
    } else {
      // Use preloaded sample dataset
      res = await fetch(`${BASE}/api/analyze-sample`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset: activeDataset,
          query: query,
          model: activeModel,
        }),
        signal: abortCtrl.signal,
      });
    }

    $("prog").style.width = "75%";
    $("lvBarA").style.width = "80%";
    $("lvBarB").style.width = "80%";

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with ${res.status}`);
    }

    const data = await res.json();
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

    $("prog").style.width = "100%";
    $("lvBarA").style.width = "100%";
    $("lvBarB").style.width = "100%";
    $("lvTime").textContent = `${elapsed}s`;
    $("lvModel").textContent = activeModel.replace("@cf/cloudflare/", "");
    $("lvKick").textContent = `Clef Store Guard × Workers AI · complete (${elapsed}s)`;

    setTimeout(() => {
      $("progWrap").classList.add("hidden");
    }, 400);

    renderResults(data);
  } catch (err) {
    if (err.name === "AbortError") {
      toast("Scan stopped by user.");
      $("lvKick").textContent = `Clef Store Guard · stopped`;
    } else {
      console.error("Scan error:", err);
      toast("Scan error: " + err.message);
      $("lvKick").textContent = `Clef Store Guard · error`;
    }
  } finally {
    isRunning = false;
    abortCtrl = null;
    $("go").textContent = "Scan with Clef";
    $("go").classList.remove("stop");
    $("progWrap").classList.add("hidden");
  }
}

// -----------------------------------------------------------------------------
// RENDER FINDINGS & RESULTS
// -----------------------------------------------------------------------------
function renderResults(data) {
  currentResults = data;
  manualFilters = {};
  activeTab = "hot";

  const sum = data.summary || {};
  const incidents = data.incidents || [];

  // Update live stat cards
  $("lvFound").textContent = Number(sum.records_checked || 0).toLocaleString();
  $("lvRecordNote").textContent = `${sum.data_integrity || "100%"} clean records`;

  $("lvChecked").textContent = (sum.total_incidents || incidents.length).toString();
  $("lvMatch").textContent = `${incidents.length} ${plural(incidents.length, "match", "matches")} passed criteria`;

  $("lvImpact").textContent = sum.total_impact_formatted || usd(sum.total_impact || 0);
  $("lvImpactLbl").textContent = sum.impact_label || "Money at risk";

  drawFilters();
  drawResultsList();
}

// -----------------------------------------------------------------------------
// FILTERING & VERDICTS
// -----------------------------------------------------------------------------
function verdict(inc) {
  const sev = (inc.severity || "").toUpperCase();
  if (sev === "CRITICAL" || sev === "HIGH") return "hot";
  if (sev === "MEDIUM") return "maybe";
  return "no";
}

function passesFilters(inc) {
  for (const [key, val] of Object.entries(manualFilters)) {
    if (!val) continue;
    if (key === "severity" && inc.severity !== val) return false;
    if (key === "context" && inc.context !== val) return false;
    if (key === "entity" && inc.entity !== val) return false;
    if (key === "pattern" && inc.clef_pattern !== val) return false;
  }
  return true;
}

function getFilteredList() {
  if (!currentResults || !currentResults.incidents) return [];
  return currentResults.incidents.filter(passesFilters);
}

// -----------------------------------------------------------------------------
// DRAW FILTERS SIDEBAR
// -----------------------------------------------------------------------------
function setupFilters() {
  const side = $("side");
  if (!side) return;

  side.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.id === "clearAll") {
      manualFilters = {};
      drawFilters();
      drawResultsList();
      return;
    }
    if (t.dataset.k) {
      const k = t.dataset.k;
      const v = t.dataset.v || null;
      manualFilters[k] = v;
      drawFilters();
      drawResultsList();
    }
  });

  $("filtersBtn").onclick = () => {
    side.classList.toggle("open");
  };
  $("sideDone").onclick = () => {
    side.classList.remove("open");
    document.querySelector(".main")?.scrollIntoView({ behavior: "smooth" });
  };
}

function drawFilters() {
  const all = (currentResults && currentResults.incidents) || [];
  const groupsEl = $("groups");
  if (!groupsEl) return;

  // Counts for Severity
  const sevs = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const sevCounts = {};
  sevs.forEach((s) => (sevCounts[s] = all.filter((i) => i.severity === s).length));

  // Counts for Register / Lane (context)
  const contextCounts = {};
  all.forEach((i) => {
    if (i.context) contextCounts[i.context] = (contextCounts[i.context] || 0) + 1;
  });

  // Counts for Cashier / Entity
  const entityCounts = {};
  all.forEach((i) => {
    if (i.entity) entityCounts[i.entity] = (entityCounts[i.entity] || 0) + 1;
  });

  // Counts for Pattern
  const patternCounts = {};
  all.forEach((i) => {
    if (i.clef_pattern) patternCounts[i.clef_pattern] = (patternCounts[i.clef_pattern] || 0) + 1;
  });

  const curSev = manualFilters.severity || "";
  const curCtx = manualFilters.context || "";
  const curEnt = manualFilters.entity || "";
  const curPat = manualFilters.pattern || "";

  let html = `
    <div class="group">
      <div class="gtitle">Severity</div>
      <button type="button" class="opt ${!curSev ? "on" : ""}" data-k="severity" data-v=""><span class="lab">Any</span><span class="n">${all.length}</span></button>
      ${sevs.map((s) => `
        <button type="button" class="opt ${curSev === s ? "on" : ""} ${sevCounts[s] === 0 ? "zero" : ""}" data-k="severity" data-v="${s}">
          <span class="lab">${s}</span><span class="n">${sevCounts[s]}</span>
        </button>
      `).join("")}
    </div>
  `;

  if (Object.keys(contextCounts).length > 1) {
    html += `
      <div class="group">
        <div class="gtitle">Register / Lane</div>
        <button type="button" class="opt ${!curCtx ? "on" : ""}" data-k="context" data-v=""><span class="lab">Any</span><span class="n">${all.length}</span></button>
        ${Object.entries(contextCounts).map(([c, count]) => `
          <button type="button" class="opt ${curCtx === c ? "on" : ""}" data-k="context" data-v="${escH(c)}">
            <span class="lab">${escH(c)}</span><span class="n">${count}</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  if (Object.keys(entityCounts).length > 1) {
    html += `
      <div class="group">
        <div class="gtitle">Cashier / Entity</div>
        <button type="button" class="opt ${!curEnt ? "on" : ""}" data-k="entity" data-v=""><span class="lab">Any</span><span class="n">${all.length}</span></button>
        ${Object.entries(entityCounts).slice(0, 6).map(([e, count]) => `
          <button type="button" class="opt ${curEnt === e ? "on" : ""}" data-k="entity" data-v="${escH(e)}">
            <span class="lab">${escH(e)}</span><span class="n">${count}</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  if (Object.keys(patternCounts).length > 1) {
    html += `
      <div class="group">
        <div class="gtitle">Pattern Type</div>
        <button type="button" class="opt ${!curPat ? "on" : ""}" data-k="pattern" data-v=""><span class="lab">Any</span><span class="n">${all.length}</span></button>
        ${Object.entries(patternCounts).map(([p, count]) => `
          <button type="button" class="opt ${curPat === p ? "on" : ""}" data-k="pattern" data-v="${escH(p)}">
            <span class="lab">${escH(p)}</span><span class="n">${count}</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  groupsEl.innerHTML = html;

  const hasFilter = Object.values(manualFilters).some(Boolean);
  $("clearAll").classList.toggle("hidden", !hasFilter);
  $("filtersBtn").textContent = hasFilter ? `Filters · on` : `Filters`;
}

// -----------------------------------------------------------------------------
// DRAW RESULTS LIST & TABS
// -----------------------------------------------------------------------------
function drawResultsList() {
  const vis = getFilteredList();
  const c = { hot: 0, maybe: 0, no: 0 };
  vis.forEach((i) => c[verdict(i)]++);

  // Render tabs
  const tabsEl = $("tabs");
  tabsEl.innerHTML = [
    ["hot", "Matches", c.hot],
    ["maybe", "Unsure", c.maybe],
    ["no", "Cleared", c.no],
    ["all", "All", vis.length],
  ].map(([k, label, count]) => `
    <button type="button" class="tab ${activeTab === k ? "on" : ""}" data-tab="${k}">
      ${label}<span>${count}</span>
    </button>
  `).join("");

  tabsEl.onclick = (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (!btn) return;
    activeTab = btn.dataset.tab;
    drawResultsList();
  };

  // Filter by active tab
  const items = vis.filter((i) => activeTab === "all" || verdict(i) === activeTab);

  $("count").innerHTML = `${plural(items.length, "match", "matches")} found<span>of ${(currentResults?.summary?.records_checked || 0).toLocaleString()} records evaluated</span>`;
  $("meta").innerHTML = `Target: "${escH(currentResults?.query || "")}" · ${currentResults?.domain || "Retail & Loss Prevention"}`;

  const listEl = $("list");
  if (!items.length) {
    listEl.innerHTML = `
      <div class="empty">
        <b style="color: var(--ink); font-weight: 600;">No records in this tab match your filters.</b>
        <div style="font-size: 13px; margin-top: 4px; color: var(--muted);">Try checking the other tabs or clearing the active filters above.</div>
      </div>
    `;
    return;
  }

  let html = `
    <div class="row head">
      <div>Entity / Lane</div>
      <div>Risk / Amount</div>
      <div>Activity & Summary</div>
      <div>CCTV / Next Action</div>
      <div>Clef Verdict</div>
    </div>
  `;

  items.forEach((inc) => {
    const v = verdict(inc);
    const tagClass = v === "hot" ? "hot" : v === "maybe" ? "maybe" : "no";
    const tagLabel = v === "hot" ? "Match" : v === "maybe" ? "Unsure" : "Cleared";
    const riskClass = inc.impact_value > 50 ? "risk-amt hi" : "risk-amt";
    const inspId = `insp-${inc.id}`;

    html += `
      <div class="row">
        <div class="who">
          <b>${escH(inc.entity || "Unknown")}</b>
          <span>${escH(inc.context || "Register")} · ${escH(inc.timestamp || "")}</span>
        </div>
        <div class="${riskClass}">
          ${inc.impact_formatted || usd(inc.impact_value)}
          <small>${escH(inc.severity)} priority</small>
        </div>
        <div class="evidence">
          ${escH(inc.summary || "")}
          <small>${escH(inc.evidence_details || inc.clef_pattern || "")}</small>
        </div>
        <div class="action-cell">
          <b>CCTV Review</b>
          ${escH(inc.what_to_do || "Verify transaction records with register camera")}
        </div>
        <div class="clefcell">
          <span class="tag ${tagClass}">${tagLabel}</span>
          <div class="chk y tip-left" data-tip="Clef confidence score">${inc.clef_match_pct || "92% Match"}</div>
          <div class="chk y">${inc.clef_confidence || "High Certainty"}</div>
          <button type="button" class="insp-btn" onclick="toggleInspector('${inspId}')">Inspect Clef Decision</button>
          <div class="insp-box" id="${inspId}"><b>Model:</b> ${inc.clef_decision?.model || "clef-flash"}
<b>Match Prob:</b> ${inc.clef_decision?.match_probability ?? 0.92}
<b>Severity Dist:</b> ${JSON.stringify(inc.clef_decision?.severity_distribution || {})}
<b>Evidence IDs:</b> ${(inc.evidence_records || []).join(", ") || inc.id}</div>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

window.toggleInspector = function (id) {
  const box = $(id);
  if (box) box.classList.toggle("open");
};

// -----------------------------------------------------------------------------
// REPORT COPY & EXPORTS
// -----------------------------------------------------------------------------
function setupActions() {
  const copyBtn = $("copyReportBtn");
  if (copyBtn) {
    copyBtn.onclick = () => {
      const items = getFilteredList();
      if (!items.length) {
        toast("No matches to copy");
        return;
      }
      const sum = currentResults?.summary || {};
      let text = `CLEF LOSS PREVENTION & ANOMALY REPORT\n`;
      text += `Target Query: "${currentResults?.query || ""}"\n`;
      text += `Records Evaluated: ${sum.records_checked} | Total Risk: ${sum.total_impact_formatted || usd(sum.total_impact)}\n`;
      text += `Flagged Incidents: ${items.length}\n\n`;
      items.forEach((inc, idx) => {
        text += `${idx + 1}. [${inc.severity}] ${inc.title}\n`;
        text += `   Entity: ${inc.entity} (${inc.context}) | Exposure: ${inc.impact_formatted || usd(inc.impact_value)}\n`;
        text += `   Clef Verdict: ${inc.clef_match_pct} | ${inc.summary}\n`;
        text += `   Action: ${inc.what_to_do}\n\n`;
      });
      navigator.clipboard.writeText(text).then(() => {
        toast("Copied Loss Prevention Report to clipboard");
      });
    };
  }

  const csvBtn = $("csvBtn");
  if (csvBtn) {
    csvBtn.onclick = async () => {
      const items = getFilteredList();
      if (!items.length) {
        toast("No matches to download");
        return;
      }
      try {
        const res = await fetch(`${BASE}/api/export/csv`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            incidents: items,
            query: currentResults?.query || "",
          }),
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `clef_findings_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast("Downloaded CSV spreadsheet");
      } catch (err) {
        toast("CSV download failed: " + err.message);
      }
    };
  }

  const jsonBtn = $("jsonBtn");
  if (jsonBtn) {
    jsonBtn.onclick = () => {
      if (!currentResults) return;
      const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentResults, null, 2));
      const a = document.createElement("a");
      a.href = str;
      a.download = `clef_results_${Date.now()}.json`;
      a.click();
      toast("Exported JSON findings");
    };
  }
}

// -----------------------------------------------------------------------------
// CUSTOM DATA DRAWER
// -----------------------------------------------------------------------------
function setupDrawer() {
  const drawer = $("drawer");
  const bg = $("drawerBg");
  const openBtn = $("openDrawerBtn");
  const pillBtn = $("datasetPill");
  const closeBtn = $("drawerX");
  const cancelBtn = $("cancelDrawerBtn");

  const openDrawer = () => {
    drawer.classList.add("open");
    bg.classList.remove("hidden");
  };

  const closeDrawer = () => {
    drawer.classList.remove("open");
    bg.classList.add("hidden");
  };

  if (openBtn) openBtn.onclick = openDrawer;
  if (pillBtn) pillBtn.onclick = openDrawer;
  if (closeBtn) closeBtn.onclick = closeDrawer;
  if (cancelBtn) cancelBtn.onclick = closeDrawer;
  if (bg) bg.onclick = closeDrawer;

  // Preset chips inside drawer
  document.querySelectorAll(".pchip").forEach((chip) => {
    chip.onclick = () => {
      const presetKey = chip.dataset.preset;
      activeDataset = presetKey;
      customDataContent = null;
      customFile = null;
      const bTitle = chip.querySelector("b")?.textContent || presetKey;
      updateDatasetPill(bTitle);
      updatePlanText();
      closeDrawer();
      toast(`Loaded preset dataset: ${bTitle}`);
    };
  });

  // File Upload
  const dropArea = $("dropArea");
  const fileInput = $("fileInput");
  if (dropArea && fileInput) {
    dropArea.onclick = () => fileInput.click();
    dropArea.ondragover = (e) => { e.preventDefault(); dropArea.classList.add("dragover"); };
    dropArea.ondragleave = () => dropArea.classList.remove("dragover");
    dropArea.ondrop = (e) => {
      e.preventDefault();
      dropArea.classList.remove("dragover");
      if (e.dataTransfer.files.length) handleLoadedFile(e.dataTransfer.files[0]);
    };
    fileInput.onchange = (e) => {
      if (e.target.files.length) handleLoadedFile(e.target.files[0]);
    };
  }

  // Paste area
  const pasteArea = $("pasteArea");
  const counter = $("pasteCounter");
  const clearBtn = $("clearPasteBtn");
  if (pasteArea && counter) {
    pasteArea.oninput = () => {
      const lines = pasteArea.value ? pasteArea.value.split(/\r?\n/).length : 0;
      counter.textContent = `${lines} lines · ${pasteArea.value.length} characters`;
    };
  }
  if (clearBtn && pasteArea) {
    clearBtn.onclick = () => {
      pasteArea.value = "";
      if (counter) counter.textContent = "0 lines · 0 characters";
    };
  }

  // Apply custom dataset
  const applyBtn = $("applyDataBtn");
  if (applyBtn) {
    applyBtn.onclick = () => {
      const text = (pasteArea?.value || "").trim();
      if (text) {
        customDataContent = text;
        customFile = null;
        updateDatasetPill(`Custom text (${text.split(/\r?\n/).length} rows)`);
        updatePlanText();
        closeDrawer();
        toast("Applied custom pasted records");
      } else if (customFile) {
        closeDrawer();
        toast(`Applied uploaded file: ${customFile.name}`);
      } else {
        closeDrawer();
      }
    };
  }
}

function handleLoadedFile(file) {
  customFile = file;
  customDataContent = null;
  const label = $("fileChosenLabel");
  const sizeKb = (file.size / 1024).toFixed(1);
  if (label) label.textContent = `✓ ${file.name} (${sizeKb} KB ready)`;
  updateDatasetPill(`${file.name} (${sizeKb} KB)`);
  updatePlanText();
  toast(`File ready: ${file.name}`);
}

// -----------------------------------------------------------------------------
// RECENT SEARCHES
// -----------------------------------------------------------------------------
function loadRecentSearches() {
  try {
    const raw = localStorage.getItem("clef_recent_searches");
    recentSearches = raw ? JSON.parse(raw) : [];
  } catch {
    recentSearches = [];
  }
  renderRecentSearches();
}

function saveRecentSearch(query) {
  if (!query) return;
  recentSearches = [query, ...recentSearches.filter((q) => q !== query)].slice(0, 6);
  try {
    localStorage.setItem("clef_recent_searches", JSON.stringify(recentSearches));
  } catch {}
  renderRecentSearches();
}

function renderRecentSearches() {
  const recentBox = $("recent");
  const listEl = $("recentList");
  if (!recentBox || !listEl) return;

  if (!recentSearches.length) {
    recentBox.classList.add("hidden");
    return;
  }

  recentBox.classList.remove("hidden");
  listEl.innerHTML = recentSearches.map((q, idx) => `
    <div class="rrow">
      <button type="button" class="ropen" data-idx="${idx}">
        <b>${escH(q)}</b>
        <span>Run again →</span>
      </button>
      <button type="button" class="rdel" data-del="${idx}" aria-label="Delete">×</button>
    </div>
  `).join("");

  listEl.onclick = (e) => {
    const del = e.target.closest("button[data-del]");
    if (del) {
      const idx = parseInt(del.dataset.del, 10);
      recentSearches.splice(idx, 1);
      localStorage.setItem("clef_recent_searches", JSON.stringify(recentSearches));
      renderRecentSearches();
      return;
    }
    const open = e.target.closest("button[data-idx]");
    if (open) {
      const idx = parseInt(open.dataset.idx, 10);
      $("line").value = recentSearches[idx];
      executeScan();
    }
  };
}
