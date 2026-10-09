#!/usr/bin/env python3
"""
T-Log Intelligence Launcher Script.
Launches the local API server and serves the Apple-inspired investigation UI.
Runs strictly on http://127.0.0.1:8080 with zero external telemetry or cloud dependencies.
"""

import sys
import webbrowser
from tlog_intelligence.cli import main

if __name__ == "__main__":
    if len(sys.argv) == 1:
        # Default action: launch server
        sys.argv.extend(["serve", "--port", "8080"])
    main()
