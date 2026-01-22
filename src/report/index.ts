/**
 * Report Module
 * 
 * Exports for the Notion-like report editor feature.
 */

// Types
export * from './types';

// Store
export { 
  useReportStore, 
  useSelectedReport,
  useReportsList,
  useHasReports,
  createTextBlock,
  createHeadingBlock,
  createChartBlock,
  createTableSnippetBlock,
  createDividerBlock,
  initializeReportStore,
} from './reportStore';

// Components (renamed to avoid conflicts with type names)
export { ReportView } from './ReportView';
export { BlockEditor } from './components/BlockEditor';
export { BlockRenderer } from './components/BlockRenderer';
export { AddBlockMenu } from './components/AddBlockMenu';
export { ChartConfigPanel } from './components/ChartConfigPanel';

// Block components (with Component suffix to avoid type conflicts)
export { TextBlock as TextBlockComponent } from './components/blocks/TextBlock';
export { HeadingBlock as HeadingBlockComponent } from './components/blocks/HeadingBlock';
export { ChartBlock as ChartBlockComponent } from './components/blocks/ChartBlock';
export { TableSnippetBlock as TableSnippetBlockComponent } from './components/blocks/TableSnippetBlock';
export { DividerBlock as DividerBlockComponent } from './components/blocks/DividerBlock';
