import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

/**
 * Export a report table to PDF and trigger download.
 * @param title Report title for the PDF header
 * @param headers Column headers (first row)
 * @param rows Data rows (array of string arrays, one per row)
 */
export function exportReportToPdf(
  title: string,
  headers: string[],
  rows: string[][]
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 10

  doc.setFontSize(14)
  doc.text(title, margin, 12)
  doc.setFontSize(10)
  doc.text(`Generated ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`, margin, 18)

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 24,
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - margin * 2,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0] },
    alternateRowStyles: { fillColor: [252, 252, 252] },
  })

  doc.save(`${title.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_").slice(0, 60)}.pdf`)
}
