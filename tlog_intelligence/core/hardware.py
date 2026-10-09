"""
Hardware and Environment Assessment Module for T-Log Intelligence.
Determines OS, CPU, GPU/Apple Silicon Metal, RAM, VRAM/Unified Memory,
Disk Storage, and local Clef inference feasibility.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional


@dataclass
class HardwareProfile:
    os_name: str
    os_release: str
    os_version: str
    architecture: str
    cpu_brand: str
    cpu_cores_physical: int
    cpu_cores_logical: int
    ram_total_gb: float
    ram_available_gb: float
    is_apple_silicon: bool
    apple_chip_name: Optional[str]
    gpu_description: str
    unified_memory_gb: float
    disk_free_gb: float
    disk_total_gb: float
    ollama_installed: bool
    ollama_version: Optional[str]
    ollama_running: bool
    mlx_installed: bool
    mlx_version: Optional[str]
    clef_feasibility: str
    recommended_runtime: str
    feasibility_notes: list[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def assess_environment(storage_path: str = ".") -> HardwareProfile:
    """Inspects the local system hardware, inference engines, and memory."""
    os_name = platform.system()
    os_release = platform.release()
    os_version = platform.version()
    arch = platform.machine()

    # CPU details
    cpu_brand = platform.processor() or "Unknown CPU"
    cpu_cores_logical = os.cpu_count() or 1
    cpu_cores_physical = cpu_cores_logical

    is_apple_silicon = False
    apple_chip_name = None

    if os_name == "Darwin":
        try:
            brand_res = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True,
                text=True,
                check=False,
            )
            if brand_res.stdout.strip():
                cpu_brand = brand_res.stdout.strip()
        except Exception:
            pass

        if arch in ("arm64", "aarch64") or "Apple" in cpu_brand:
            is_apple_silicon = True
            apple_chip_name = cpu_brand

    # RAM details
    ram_total_gb = 16.0
    ram_avail_gb = 8.0
    try:
        import psutil
        vm = psutil.virtual_memory()
        ram_total_gb = round(vm.total / (1024**3), 2)
        ram_avail_gb = round(vm.available / (1024**3), 2)
        cpu_cores_physical = psutil.cpu_count(logical=False) or cpu_cores_logical
    except Exception:
        if os_name == "Darwin":
            try:
                mem_res = subprocess.run(
                    ["sysctl", "-n", "hw.memsize"],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if mem_res.stdout.strip():
                    ram_total_gb = round(int(mem_res.stdout.strip()) / (1024**3), 2)
                    ram_avail_gb = round(ram_total_gb * 0.6, 2)
            except Exception:
                pass

    # Disk Storage
    disk_total_gb = 0.0
    disk_free_gb = 0.0
    try:
        du = shutil.disk_usage(storage_path)
        disk_total_gb = round(du.total / (1024**3), 2)
        disk_free_gb = round(du.free / (1024**3), 2)
    except Exception:
        pass

    # GPU & Unified memory
    if is_apple_silicon:
        gpu_desc = f"{apple_chip_name or 'Apple Silicon'} Integrated Metal GPU"
        unified_memory_gb = ram_total_gb
    else:
        gpu_desc = "Standard GPU / CPU Compute"
        unified_memory_gb = 0.0

    # Ollama inspection
    ollama_installed = False
    ollama_ver = None
    ollama_path = shutil.which("ollama")
    if ollama_path:
        ollama_installed = True
        try:
            ver_res = subprocess.run(
                ["ollama", "--version"],
                capture_output=True,
                text=True,
                timeout=3,
                check=False,
            )
            ollama_ver = ver_res.stdout.strip() or ver_res.stderr.strip()
        except Exception:
            ollama_ver = "installed"

    ollama_running = False
    if ollama_installed:
        try:
            import urllib.request
            req = urllib.request.Request("http://127.0.0.1:11434/api/version", method="GET")
            with urllib.request.urlopen(req, timeout=1) as resp:
                if resp.status == 200:
                    ollama_running = True
        except Exception:
            ollama_running = False

    # MLX inspection
    mlx_installed = False
    mlx_ver = None
    try:
        import mlx.core as mx
        mlx_installed = True
        mlx_ver = getattr(mx, "__version__", "installed")
    except Exception:
        pass

    # Clef Feasibility Analysis
    feasibility_notes = []
    clef_feasibility = "FEASIBLE"
    recommended_runtime = "mlx-native"

    if is_apple_silicon:
        feasibility_notes.append(f"Apple Silicon detected ({apple_chip_name}) with {ram_total_gb} GB unified memory.")
        if ram_total_gb >= 15.0:
            recommended_runtime = "mlx-native"
            feasibility_notes.append("Hardware comfortably supports 'mlx-community/clef-flash-4bit' (peak memory: ~7.2 GB).")
        else:
            recommended_runtime = "rules-fallback"
            clef_feasibility = "CONSTRAINED"
            feasibility_notes.append("RAM under 16 GB; Clef-Flash may cause memory pressure under full load.")
    elif ollama_installed and ollama_running:
        recommended_runtime = "ollama-systemone"
        feasibility_notes.append("Ollama detected and running locally on port 11434.")
    else:
        recommended_runtime = "local-calibrated"
        feasibility_notes.append("Non-Apple Silicon system without active Ollama instance. Calibrated local decision head enabled.")

    if disk_free_gb < 10.0:
        feasibility_notes.append(f"Warning: Low free disk space ({disk_free_gb} GB free). Minimum 10 GB recommended for model weights and 50k logs.")

    return HardwareProfile(
        os_name=os_name,
        os_release=os_release,
        os_version=os_version,
        architecture=arch,
        cpu_brand=cpu_brand,
        cpu_cores_physical=cpu_cores_physical,
        cpu_cores_logical=cpu_cores_logical,
        ram_total_gb=ram_total_gb,
        ram_available_gb=ram_avail_gb,
        is_apple_silicon=is_apple_silicon,
        apple_chip_name=apple_chip_name,
        gpu_description=gpu_desc,
        unified_memory_gb=unified_memory_gb,
        disk_free_gb=disk_free_gb,
        disk_total_gb=disk_total_gb,
        ollama_installed=ollama_installed,
        ollama_version=ollama_ver,
        ollama_running=ollama_running,
        mlx_installed=mlx_installed,
        mlx_version=mlx_ver,
        clef_feasibility=clef_feasibility,
        recommended_runtime=recommended_runtime,
        feasibility_notes=feasibility_notes,
    )


if __name__ == "__main__":
    profile = assess_environment()
    print("=== T-Log Intelligence Hardware Assessment ===")
    for k, v in profile.to_dict().items():
        print(f"{k}: {v}")
