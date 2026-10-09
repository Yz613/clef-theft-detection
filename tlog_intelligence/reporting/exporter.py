"""
Local Reporting and Export Engine.
Generates:
1. Executive Findings Summary in PDF (via ReportLab, local fonts, no external network)
2. Complete Exceptions Report in Excel XLSX (via OpenPyXL)
3. Standard CSV and JSON reports
4. Implements strict Formula Injection Sanitization (=, +, -, @)
"""

from __future__ import annotations

import csv
import io
import json
import os
from typing import Any, Dict, List, Optional


def sanitize_formula_injection(val: Any) -> Any:
    """Guards against spreadsheet formula injection."""
    if isinstance(val, str):
        if val.startswith(("=", "+", "-", "@", "\t", "\r")):
            return f"'{val}"
    return val


class ReportExporter:
    def export_csv(self, findings: List[Dict[str, Any]], output_path: str) -> str:
        """Exports findings to sanitized CSV."""
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        headers = [
            "finding_id",
            "priority",
            "category",
            "title",
            "status",
            "financial_exposure_at_risk",
            "confirmed_financial_loss",
            "event_count",
            "stores",
            "cashiers",
            "registers",
            "evidence_tx_ids",
            "recommended_investigation",
        ]
        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            for item in findings:
                row = [
                    sanitize_formula_injection(item.get("finding_id")),
                    sanitize_formula_injection(item.get("priority")),
                    sanitize_formula_injection(item.get("category")),
                    sanitize_formula_injection(item.get("title")),
                    sanitize_formula_injection(item.get("status")),
                    item.get("financial_exposure_at_risk", 0.0),
                    item.get("confirmed_financial_loss", 0.0),
                    item.get("event_count", 0),
                    sanitize_formula_injection(", ".join(item.get("store_ids", []))),
                    sanitize_formula_injection(", ".join(item.get("cashier_ids", []))),
                    sanitize_formula_injection(", ".join(item.get("register_ids", []))),
                    sanitize_formula_injection(", ".join(item.get("evidence_tx_ids", [])[:5])),
                    sanitize_formula_injection(item.get("recommended_investigation")),
                ]
                writer.writerow(row)
        return output_path

    def export_xlsx(self, findings: List[Dict[str, Any]], output_path: str) -> str:
        """Exports findings to formatted Excel XLSX."""
        import openpyxl
        from openpyxl.styles import Alignment, Font, PatternFill

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Loss Prevention Findings"

        headers = [
            "Finding ID", "Priority", "Category", "Title", "Status",
            "Exposure At Risk ($)", "Confirmed Loss ($)", "Stores",
            "Cashiers", "Registers", "Evidence TX IDs", "Recommended Action"
        ]
        ws.append(headers)

        header_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for f in findings:
            row = [
                sanitize_formula_injection(f.get("finding_id")),
                sanitize_formula_injection(f.get("priority")),
                sanitize_formula_injection(f.get("category")),
                sanitize_formula_injection(f.get("title")),
                sanitize_formula_injection(f.get("status")),
                f.get("financial_exposure_at_risk", 0.0),
                f.get("confirmed_financial_loss", 0.0),
                sanitize_formula_injection(", ".join(f.get("store_ids", []))),
                sanitize_formula_injection(", ".join(f.get("cashier_ids", []))),
                sanitize_formula_injection(", ".join(f.get("register_ids", []))),
                sanitize_formula_injection(", ".join(f.get("evidence_tx_ids", [])[:5])),
                sanitize_formula_injection(f.get("recommended_investigation")),
            ]
            ws.append(row)

        for col in ws.columns:
            max_len = max(len(str(cell.value or "")) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = min(40, max(12, max_len + 3))

        wb.save(output_path)
        return output_path

    def export_pdf(self, kpis: Dict[str, Any], findings: List[Dict[str, Any]], output_path: str) -> str:
        """Generates Executive Loss Prevention Brief in PDF using ReportLab."""
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        doc = SimpleDocTemplate(
            output_path,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "TitleStyle",
            parent=styles["Heading1"],
            fontSize=22,
            leading=26,
            textColor=colors.HexColor("#111827"),
        )
        subtitle_style = ParagraphStyle(
            "SubStyle",
            parent=styles["Normal"],
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#6B7280"),
        )
        body_style = ParagraphStyle(
            "Body",
            parent=styles["Normal"],
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#374151"),
        )
        bold_style = ParagraphStyle(
            "BoldBody",
            parent=body_style,
            fontName="Helvetica-Bold",
        )

        elements = []

        # Header
        elements.append(Paragraph("T-LOG INTELLIGENCE", title_style))
        elements.append(Paragraph("Local Retail Loss Prevention Intelligence Report — Confidential", subtitle_style))
        elements.append(Spacer(1, 10))
        elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#E5E7EB"), spaceAfter=15))

        # KPI Summary Table
        kpi_data = [
            [
                Paragraph("<b>Transactions Analyzed:</b>", body_style),
                Paragraph(f"{kpis.get('total_transactions', 0):,}", bold_style),
                Paragraph("<b>Stores Monitored:</b>", body_style),
                Paragraph(str(kpis.get("store_count", 0)), bold_style),
            ],
            [
                Paragraph("<b>Potential Exposure at Risk:</b>", body_style),
                Paragraph(f"${kpis.get('total_exposure_at_risk', 0.0):,.2f}", bold_style),
                Paragraph("<b>Confirmed Loss:</b>", body_style),
                Paragraph(f"${kpis.get('confirmed_loss', 0.0):,.2f}", bold_style),
            ],
            [
                Paragraph("<b>High-Priority Findings:</b>", body_style),
                Paragraph(str(kpis.get("high_priority_findings", 0)), bold_style),
                Paragraph("<b>Anomalies Discovered:</b>", body_style),
                Paragraph(str(kpis.get("total_anomalies_discovered", 0)), bold_style),
            ],
        ]
        kpi_table = Table(kpi_data, colWidths=[140, 130, 130, 140])
        kpi_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
            ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#E5E7EB")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
            ("PADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(kpi_table)
        elements.append(Spacer(1, 20))

        # Top Findings Section
        elements.append(Paragraph("<b>PRIORITIZED INVESTIGATION FINDINGS</b>", styles["Heading2"]))
        elements.append(Spacer(1, 8))

        top_f = findings[:8]
        for f in top_f:
            prio = f.get("priority", "MEDIUM")
            prio_color = "#DC2626" if prio in ("CRITICAL", "HIGH") else ("#F59E0B" if prio == "MEDIUM" else "#10B981")
            header_text = f"<font color='{prio_color}'><b>[{prio}]</b></font> <b>{f.get('title')}</b> — Exposure: ${f.get('financial_exposure_at_risk', 0.0):.2f}"
            elements.append(Paragraph(header_text, body_style))
            elements.append(Paragraph(f"<b>What Happened:</b> {f.get('what_happened')}", body_style))
            elements.append(Paragraph(f"<b>Why Unusual:</b> {f.get('why_unusual')}", body_style))
            elements.append(Paragraph(f"<b>Recommended Action:</b> {f.get('recommended_investigation')}", body_style))
            elements.append(Paragraph(f"<b>Evidence TX IDs:</b> {', '.join(f.get('evidence_tx_ids', [])[:6])}", subtitle_style))
            elements.append(Spacer(1, 10))
            elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#F3F4F6"), spaceAfter=10))

        doc.build(elements)
        return output_path
