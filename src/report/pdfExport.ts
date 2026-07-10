/**
 * Key insight: html2canvas doesn't resolve CSS variables properly,
 * so we must convert all table styles to explicit inline styles.
 */

import html2pdf from 'html2pdf.js';

interface ExportOptions {
  reportName: string;
  appName?: string;
}

// CRITICAL: Preserves overflow/wrapping fixes while minimizing cosmetic changes.
function prepareTablesForPDF(container: HTMLElement): void {
  const borderColor = '#e5e7eb';
  const headerBg = '#f9fafb';
  const textColor = '#111827';
  const headerTextColor = '#6b7280';
  
  // CRITICAL: Remove overflow:auto/hidden that creates scroll containers and clips content
  container.querySelectorAll('.embedded-table-window, .editable-table-outer, .editable-table-wrapper, .editable-table-container, .embedded-table-scroll, .editable-table-block').forEach(el => {
    const element = el as HTMLElement;
    element.style.overflow = 'visible';
    element.style.maxHeight = 'none';
    element.style.height = 'auto';
  });

  // Style tables - CRITICAL: table-layout fixed prevents overflow
  container.querySelectorAll('table').forEach(table => {
    const tbl = table as HTMLTableElement;
    tbl.style.width = '100%';
    tbl.style.maxWidth = '100%';
    tbl.style.tableLayout = 'fixed';
    tbl.style.borderCollapse = 'collapse';
    tbl.style.border = `1px solid ${borderColor}`;
    tbl.style.borderRadius = '8px';
  });

  // Style th elements - CRITICAL: allow wrapping
  container.querySelectorAll('th, .editable-table-header').forEach(el => {
    const th = el as HTMLElement;
    th.style.padding = '10px 12px';
    th.style.textAlign = 'left';
    th.style.fontWeight = '500';
    th.style.fontSize = '12px';
    th.style.backgroundColor = headerBg;
    th.style.borderBottom = `1px solid ${borderColor}`;
    th.style.color = headerTextColor;
    // CRITICAL: These prevent text clipping
    th.style.whiteSpace = 'normal';
    th.style.wordWrap = 'break-word';
    th.style.overflow = 'visible';
  });

  // CRITICAL: Style inner spans that contain text (these have clipping!)
  container.querySelectorAll('.editable-table-header-text, .editable-table-cell-text').forEach(el => {
    const span = el as HTMLElement;
    span.style.display = 'block';
    span.style.whiteSpace = 'normal';
    span.style.wordWrap = 'break-word';
    span.style.overflow = 'visible';
    span.style.textOverflow = 'clip';
  });

  // Style td elements - CRITICAL: allow text to wrap
  container.querySelectorAll('td, .editable-table-cell').forEach(el => {
    const td = el as HTMLElement;
    td.style.padding = '10px 12px';
    td.style.textAlign = 'left';
    td.style.fontSize = '13px';
    td.style.borderBottom = `1px solid ${borderColor}`;
    td.style.color = textColor;
    // CRITICAL: These prevent text clipping
    td.style.whiteSpace = 'normal';
    td.style.wordWrap = 'break-word';
    td.style.overflow = 'visible';
  });

  // Make thead display as table-header-group for page breaks
  container.querySelectorAll('thead').forEach(el => {
    (el as HTMLElement).style.display = 'table-header-group';
  });

  container.querySelectorAll('.embedded-table-config-btn').forEach(el => {
    (el as HTMLElement).style.display = 'none';
  });
}

function prepareChartsForPDF(container: HTMLElement): void {
  const textColor = '#111827';
  const gridColor = '#e5e5ea'; // Light mode grid color
  
  container.querySelectorAll('.chart-block-container > div[class*="absolute"]').forEach(el => {
    const element = el as HTMLElement;
    if (element.className.includes('-top-10') || element.className.includes('absolute')) {
      const hasButtons = element.querySelectorAll('button').length > 0;
      if (hasButtons) {
        element.remove();
      }
    }
  });
  
  container.querySelectorAll('.chart-block-footer button').forEach(el => {
    el.remove();
  });
  
  // FIX: Style grid background overlays for pie charts instead of removing them
  // These use CSS variables that don't resolve in html2canvas
  container.querySelectorAll('.chart-block-container > div[class*="pointer-events-none"]').forEach(el => {
    const element = el as HTMLElement;
    const bgImage = getComputedStyle(element).backgroundImage;
    if (bgImage && bgImage !== 'none') {
      element.style.backgroundImage = `linear-gradient(${gridColor} 1px, transparent 1px), linear-gradient(90deg, ${gridColor} 1px, transparent 1px)`;
      element.style.backgroundSize = '40px 40px';
      element.style.opacity = '0.5';
      element.style.setProperty('-webkit-print-color-adjust', 'exact');
      element.style.setProperty('print-color-adjust', 'exact');
    }
  });
  
  container.querySelectorAll('.recharts-cartesian-grid line, .recharts-cartesian-grid-horizontal line, .recharts-cartesian-grid-vertical line').forEach(el => {
    const line = el as SVGLineElement;
    const stroke = line.getAttribute('stroke');
    if (!stroke || stroke.startsWith('var(') || stroke === 'currentColor') {
      line.setAttribute('stroke', gridColor);
    }
    line.style.setProperty('-webkit-print-color-adjust', 'exact');
  });
  
  container.querySelectorAll('.recharts-cartesian-grid path').forEach(el => {
    const path = el as SVGPathElement;
    const stroke = path.getAttribute('stroke');
    if (!stroke || stroke.startsWith('var(') || stroke === 'currentColor') {
      path.setAttribute('stroke', gridColor);
    }
  });
  
  // Only fix SVG elements that have CSS variables or currentColor (which html2canvas can't resolve)
  container.querySelectorAll('svg text').forEach(el => {
    const text = el as SVGTextElement;
    const fill = text.getAttribute('fill');
    if (!fill || fill === 'currentColor' || fill.startsWith('var(')) {
      text.setAttribute('fill', textColor);
    }
  });
  
  container.querySelectorAll('.recharts-cartesian-axis-tick-value').forEach(el => {
    const text = el as SVGTextElement;
    if (!text.getAttribute('fill') || text.getAttribute('fill')?.startsWith('var(')) {
      text.setAttribute('fill', textColor);
    }
  });
  
  container.querySelectorAll('.recharts-cartesian-axis-line, .recharts-xAxis line, .recharts-yAxis line').forEach(el => {
    const line = el as SVGLineElement;
    const stroke = line.getAttribute('stroke');
    if (!stroke || stroke.startsWith('var(') || stroke === 'currentColor') {
      line.setAttribute('stroke', '#d2d2d7'); // axisColor from ChartRenderer
    }
  });
  
  container.querySelectorAll('.recharts-wrapper').forEach(el => {
    (el as HTMLElement).style.overflow = 'visible';
  });
  
  container.querySelectorAll('.recharts-surface').forEach(el => {
    (el as SVGElement).style.overflow = 'visible';
  });
}

export async function exportReportToPDF(
  contentElement: HTMLElement,
  options: ExportOptions
): Promise<void> {
  const { reportName, appName = 'Table Canvas' } = options;
  
  const now = new Date();
  const timestamp = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const contentClone = contentElement.cloneNode(true) as HTMLElement;
  
  const selectorsToRemove = [
    '.report-toolbar-v2',
    '.block-toolbar',
    '.slash-command-menu',
    '.ProseMirror-gapcursor',
    '.block-config-panel',
    '.embedded-table-config-btn',
    '.chart-block-footer button',
  ];
  selectorsToRemove.forEach(sel => {
    contentClone.querySelectorAll(sel).forEach(el => el.remove());
  });

  contentClone.querySelectorAll('[contenteditable]').forEach(el => {
    el.removeAttribute('contenteditable');
  });
  
  // CRITICAL: Remove placeholder attributes to prevent "Type '/' for commands..." from appearing
  // The placeholder is rendered via CSS ::before pseudo-element with content: attr(data-placeholder)
  contentClone.querySelectorAll('[data-placeholder]').forEach(el => {
    el.removeAttribute('data-placeholder');
  });
  
  contentClone.querySelectorAll('.is-empty, .is-editor-empty').forEach(el => {
    el.classList.remove('is-empty', 'is-editor-empty');
  });

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    position: fixed;
    left: -100000px;
    top: 0;
    width: 8.5in;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1a1a1a;
    line-height: 1.6;
    font-size: 11pt;
    background: white;
  `;

  contentClone.style.cssText = `
    overflow: visible;
    max-height: none;
    height: auto;
    padding: 0;
  `;

  wrapper.appendChild(contentClone);
  document.body.appendChild(wrapper);

  prepareTablesForPDF(contentClone);
  
  prepareChartsForPDF(contentClone);

  contentClone.querySelectorAll('h1, h2, h3').forEach(el => {
    const heading = el as HTMLElement;
    heading.style.color = '#111827';
  });

  contentClone.querySelectorAll('p, li, span').forEach(el => {
    const element = el as HTMLElement;
    const color = getComputedStyle(element).color;
    if (!color || color === 'currentColor' || color.includes('var(')) {
      element.style.color = '#111827';
    }
  });

  contentClone.querySelectorAll('*').forEach(el => {
    const element = el as HTMLElement;
    const bgImage = element.style.backgroundImage;
    if (bgImage && bgImage.includes('url(') && !bgImage.includes('linear-gradient')) {
      element.style.backgroundImage = 'none';
    }
  });

  const opt = {
    margin: [0.8, 0.6, 0.9, 0.6] as [number, number, number, number], // top, left, bottom, right
    filename: `${reportName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { 
      scale: 2, 
      useCORS: true, 
      scrollY: 0,
      logging: false,
      backgroundColor: '#ffffff',
    },
    jsPDF: { 
      unit: 'in', 
      format: 'letter', 
      orientation: 'portrait' as const,
    },
    pagebreak: { 
      mode: ['avoid-all', 'css', 'legacy'],
      avoid: ['h1', 'h2', 'h3', 'h4', 'tr', 'thead'],
    },
  };

  try {
    const pdf = html2pdf().set(opt).from(wrapper);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await pdf.toPdf().get('pdf').then((pdfDoc: any) => {
      const totalPages = pdfDoc.internal.getNumberOfPages();
      const pageWidth = pdfDoc.internal.pageSize.getWidth();
      const pageHeight = pdfDoc.internal.pageSize.getHeight();

      for (let i = 1; i <= totalPages; i++) {
        pdfDoc.setPage(i);

        pdfDoc.setDrawColor(33, 115, 70);
        pdfDoc.setLineWidth(0.015);
        pdfDoc.line(0.5, 0.55, pageWidth - 0.5, 0.55);

        pdfDoc.setFontSize(10);
        pdfDoc.setTextColor(33, 115, 70);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text(appName, 0.5, 0.4);

        pdfDoc.setFontSize(9);
        pdfDoc.setTextColor(100, 100, 100);
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.text(`Page ${i} of ${totalPages}`, pageWidth - 0.5, 0.4, { align: 'right' });

        pdfDoc.setDrawColor(33, 115, 70);
        pdfDoc.setLineWidth(0.015);
        pdfDoc.line(0.5, pageHeight - 0.6, pageWidth - 0.5, pageHeight - 0.6);

        pdfDoc.setFontSize(8);
        pdfDoc.setTextColor(33, 115, 70);
        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.text(appName, 0.5, pageHeight - 0.4);

        pdfDoc.setTextColor(80, 80, 80);
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.text(`${i} / ${totalPages}`, pageWidth / 2, pageHeight - 0.4, { align: 'center' });

        pdfDoc.setTextColor(100, 100, 100);
        pdfDoc.setFontSize(7);
        pdfDoc.text(timestamp, pageWidth - 0.5, pageHeight - 0.4, { align: 'right' });
      }
    });

    await pdf.save();
  } finally {
    wrapper.remove();
  }
}

