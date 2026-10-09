"""
Command-Line Interface for T-Log Intelligence.
Provides end-to-end management of hardware assessment, Clef self-testing,
synthetic data generation, ingestion, analysis, and local web serving.
"""

from __future__ import annotations

import argparse
import sys
import uvicorn

from .clef.self_test import run_clef_self_test
from .core.hardware import assess_environment
from .core.storage import StorageEngine
from .ingestion.pipeline import IngestionPipeline
from .synthetic.generator import SyntheticDatasetGenerator


def main():
    parser = argparse.ArgumentParser(description="T-Log Intelligence: Local AI Retail LP System")
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # Command: test
    subparsers.add_parser("test", help="Run Phase 1 Clef Self-Test and Hardware Verification")

    # Command: hardware
    subparsers.add_parser("hardware", help="Print Hardware and Environment Profile")

    # Command: generate
    gen_parser = subparsers.add_parser("generate", help="Generate realistic synthetic grocery POS T-logs")
    gen_parser.add_argument("--count", type=int, default=50000, help="Target event count (default: 50,000)")
    gen_parser.add_argument("--out", type=str, default="data/synthetic_50k_tlogs.csv", help="Output CSV path")

    # Command: ingest
    ing_parser = subparsers.add_parser("ingest", help="Ingest and reconstruct transaction logs")
    ing_parser.add_argument("--file", type=str, required=True, help="Path to T-log file, directory, or ZIP")

    # Command: serve
    serve_parser = subparsers.add_parser("serve", help="Launch local API and Investigation Dashboard")
    serve_parser.add_argument("--host", type=str, default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
    serve_parser.add_argument("--port", type=int, default=8080, help="Port (default: 8080)")

    args = parser.parse_args()

    if args.command == "test":
        res = run_clef_self_test()
        sys.exit(0 if res.get("success") else 1)

    elif args.command == "hardware":
        hw = assess_environment()
        print("=== Hardware Assessment ===")
        for k, v in hw.to_dict().items():
            print(f"{k}: {v}")

    elif args.command == "generate":
        print(f"Generating {args.count:,} synthetic grocery POS log events...")
        gen = SyntheticDatasetGenerator()
        info = gen.generate(target_events=args.count, output_file=args.out)
        print("Dataset generated successfully:")
        print(f"  • Total events: {info['total_events_generated']:,}")
        print(f"  • Total transactions: {info['total_transactions_generated']:,}")
        print(f"  • File path: {info['output_path']}")

    elif args.command == "ingest":
        print(f"Ingesting {args.file} into DuckDB...")
        storage = StorageEngine()
        pipeline = IngestionPipeline(storage)
        txs, q = pipeline.process_file_or_directory(args.file)
        print("Ingestion complete:")
        print(f"  • Reconstructed Transactions: {len(txs):,}")
        print(f"  • Data Hygiene Score: {q.data_hygiene_score}%")
        print(f"  • Summary: {q.quality_summary}")

    elif args.command == "serve":
        print(f"Starting T-Log Intelligence locally at http://{args.host}:{args.port}")
        uvicorn.run("tlog_intelligence.api.server:app", host=args.host, port=args.port, log_level="info")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
