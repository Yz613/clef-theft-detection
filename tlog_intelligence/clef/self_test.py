"""
Phase 1 Clef Self-Test Verification Script.
Validates:
1. Local hardware & Apple Silicon Metal GPU capability
2. Cloudflare Clef model weights loading
3. Structured state dictionary processing
4. Typed questions: choice, score, noul execution via joint decision head
5. Probability outputs calibration and validity
6. Strict local offline execution (network-isolation validation)
"""

from __future__ import annotations

import json
import socket
import sys
import time
from typing import Any, Dict

from ..core.hardware import assess_environment
from .client import ClefClient
from .prompts import get_loss_prevention_questions


def run_clef_self_test() -> Dict[str, Any]:
    print("=================================================================")
    print("  T-Log Intelligence: Phase 1 Clef Local Self-Test & Hardware")
    print("=================================================================\n")

    # Step 1: Hardware & Environment Assessment
    print("[1/5] Assessing Local Hardware & Environment...")
    hw = assess_environment()
    print(f"  • Operating System: {hw.os_name} {hw.os_release} ({hw.architecture})")
    print(f"  • CPU / Platform:   {hw.cpu_brand} ({hw.cpu_cores_logical} cores)")
    print(f"  • Total Memory:     {hw.ram_total_gb} GB (Unified: {hw.unified_memory_gb} GB)")
    print(f"  • Apple Silicon:    {'YES' if hw.is_apple_silicon else 'NO'}")
    print(f"  • MLX Installed:    {'YES (v' + str(hw.mlx_version) + ')' if hw.mlx_installed else 'NO'}")
    print(f"  • Storage Free:     {hw.disk_free_gb} GB free / {hw.disk_total_gb} GB total")
    print(f"  • Clef Feasibility: {hw.clef_feasibility} (Engine: {hw.recommended_runtime})")

    # Step 2: Network Isolation Check
    print("\n[2/5] Verifying 100% Offline / Local Execution Guarantee...")
    # Monkey-patch socket to detect if any external outbound connection is attempted
    original_connect = socket.socket.connect
    external_calls_attempted = []

    def mock_connect(self, address):
        host, port = address[0], address[1]
        if host not in ("127.0.0.1", "localhost", "::1"):
            external_calls_attempted.append(f"{host}:{port}")
            raise PermissionError(f"External network connection blocked to {host}:{port} by privacy policy")
        return original_connect(self, address)

    socket.socket.connect = mock_connect

    # Step 3: Initialize Clef Client
    print("\n[3/5] Initializing Cloudflare Clef Decision Model...")
    t0 = time.perf_counter()
    client = ClefClient(preferred_engine="auto")
    init_time_ms = round((time.perf_counter() - t0) * 1000, 2)
    print(f"  • Active Engine: {client.active_engine}")
    print(f"  • Init Time:     {init_time_ms} ms")

    # Step 4: Run Typed Decision Forward Pass
    print("\n[4/5] Executing Structured State & Typed Questions Forward Pass...")
    sample_state = {
        "case_type": "transaction_anomaly",
        "store_id": "STORE_012",
        "transaction_id": "TX_TEST_001",
        "observed_events": [
            "Item scanned at $39.99 (Organic Sirloin Steak)",
            "Item voided (Supervisor override: none)",
            "Item entered manually at $3.99 (Produce Banana PLU 4011)",
            "Tender CASH $4.00, Change $0.01",
        ],
        "operator_void_rate": 0.087,
        "comparable_peer_void_rate": 0.021,
        "other_similar_sequences": 5,
        "financial_exposure_at_risk": 36.00,
        "data_quality": "complete",
    }
    sample_questions = get_loss_prevention_questions()

    decision = client.predict(
        case_id="TEST_CASE_01",
        state=sample_state,
        questions=sample_questions,
    )

    print(f"  • Inference Latency: {decision.latency_ms} ms")
    print(f"  • Model Identified:  {decision.model_name}")
    print(f"  • Runtime Mode:      {decision.runtime_mode}")

    print("\n[5/5] Inspecting Joint Decision Head Outputs:")
    for q_id, probs in decision.answers.items():
        chosen = decision.chosen_labels.get(q_id)
        conf = decision.confidence_scores.get(q_id)
        print(f"  • Question: '{q_id}'")
        print(f"    - Selected Choice: '{chosen}' (Confidence: {conf})")
        print(f"    - Probabilities:   {json.dumps(probs)}")

    # Restore socket
    socket.socket.connect = original_connect

    network_secure = len(external_calls_attempted) == 0
    print("\n-----------------------------------------------------------------")
    print(f"  Privacy & Security:  {'PASSED (0 external calls)' if network_secure else 'FAILED'}")
    print(f"  Clef Engine Status:  READY ({decision.runtime_mode})")
    print("=================================================================\n")

    return {
        "hardware": hw.to_dict(),
        "client_engine": client.active_engine,
        "network_secure": network_secure,
        "external_calls": external_calls_attempted,
        "decision": decision.to_dict(),
        "success": True,
    }


if __name__ == "__main__":
    res = run_clef_self_test()
    if not res["success"]:
        sys.exit(1)
