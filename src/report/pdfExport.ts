/**
 * Report PDF export.
 *
 * The stored TipTap document is translated into a pdfmake document definition and
 * rendered straight to a PDF file, which downloads without any print or save
 * dialog. Text, tables and charts stay vector — selectable and searchable — and
 * page breaks, repeated table headers and page numbers are decided by pdfmake's
 * layout engine.
 *
 * Two earlier approaches are deliberately not used: rasterising the live editor
 * DOM, which inherited the whole application stylesheet and failed on any CSS
 * feature the screenshotter could not parse, and handing a print-ready HTML
 * document to the browser's print dialog, which cannot produce a file directly.
 */

import { buildReportEmbeddedData } from '@/persistence/reportExportData';
import type { EmbeddedDataMap } from '@/persistence/reportHtmlGenerator';
import type { ProjectNode } from '@/types';
import type { Report } from './types';
import { buildReportDocDefinition, reportPdfFilename } from './pdf/document';
import { createReportPdf } from './pdf/pdfmakeClient';

export interface ExportOptions {
  report: Report;
  nodes: Record<string, ProjectNode>;
  appName?: string;
  /**
   * Already-resolved embedded rows. Callers that render more than one format from
   * the same report pass this so the query engine is only asked for the rows once.
   */
  dataMap?: EmbeddedDataMap;
}

async function renderPdf({ report, nodes, appName, dataMap }: ExportOptions) {
  let data: EmbeddedDataMap = dataMap ?? {};
  if (!dataMap && report.tiptapContent) {
    data = await buildReportEmbeddedData(report, nodes);
  }

  return createReportPdf(buildReportDocDefinition({ report, dataMap: data, appName }));
}

export async function exportReportToPDF(options: ExportOptions): Promise<void> {
  const pdf = await renderPdf(options);
  await pdf.download(reportPdfFilename(options.report));
}

/** Same document as a Blob — used to embed report PDFs in the project ZIP. */
export async function renderReportPdfBlob(options: ExportOptions): Promise<Blob> {
  const pdf = await renderPdf(options);
  return pdf.getBlob();
}
