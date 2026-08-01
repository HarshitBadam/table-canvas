/**
 * Downloads a single report as a standalone HTML file.
 *
 * Shares its renderer with the report files written into the project ZIP, so a
 * report exported on its own is byte-identical to the same report inside a
 * project archive.
 */

import { buildReportEmbeddedData } from '@/persistence/reportExportData';
import { type EmbeddedDataMap } from '@/persistence/reportHtmlGenerator';
import { generateReportHtml } from '@/persistence/reportHtmlDocument';
import { downloadBlob } from '@/persistence/exportService';
import type { ProjectNode } from '@/types';
import type { Report } from './types';

export interface HtmlExportOptions {
  report: Report;
  nodes: Record<string, ProjectNode>;
}

/** Matches the naming used for reports inside the project ZIP. */
function toFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9-_ ]/g, '_').trim().slice(0, 50);
  return `${base || 'Untitled Report'}.html`;
}

export async function exportReportToHtml({
  report,
  nodes,
}: HtmlExportOptions): Promise<void> {
  let dataMap: EmbeddedDataMap = {};
  if (report.tiptapContent) {
    dataMap = await buildReportEmbeddedData(report, nodes);
  }

  const html = generateReportHtml(report, dataMap);
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), toFileName(report.name));
}
