import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { useProjectStore } from '@/state/projectStore';
import { getTableData } from '@/engine/materializationService';
import type { TableRow } from '@/state/dataStore';
import { useNavigation } from '@/layout/NavigationContext';
import { ChartRenderer } from '@/charts/ChartRenderer';
import { TableSelector } from './ChartNodeTablePicker';
import { ChartConfigPanel } from './ChartNodeConfigPanel';
import type { EnhancedChartConfig } from '@/report/types';
import type { ChartType, TableNode as TableNodeType, ColumnSchema } from '@/types';


interface ChartNodeAttrs {
  sourceTableId: string;
  chartType: ChartType;
  config: EnhancedChartConfig;
}


const CHART_ROW_LIMIT = 1000;

const ChartNodeView = memo(function ChartNodeView({ 
  node, 
  updateAttributes,
  selected,
  deleteNode,
}: NodeViewProps) {
  const attrs = node.attrs as ChartNodeAttrs;
  const { openTable } = useNavigation();
  
  const tableNode = useProjectStore((state) => state.nodes[attrs.sourceTableId]) as TableNodeType | undefined;
  
  const [showConfig, setShowConfig] = useState(false);
  const hasAutoConfigured = useRef(false);
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>();
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!attrs.sourceTableId) return;

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setLoadError(undefined);

    getTableData(attrs.sourceTableId, 0, CHART_ROW_LIMIT)
      .then((result) => {
        if (fetchId !== fetchIdRef.current) return;
        if (result.error) {
          setLoadError(result.error);
          setTableData([]);
        } else {
          setTableData(result.rows);
          setLoadError(undefined);
        }
      })
      .catch((err) => {
        if (fetchId !== fetchIdRef.current) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setTableData([]);
      })
      .finally(() => {
        if (fetchId !== fetchIdRef.current) return;
        setIsLoading(false);
      });
  }, [attrs.sourceTableId]);

  const columns: ColumnSchema[] = useMemo(() => {
    return tableNode?.schema?.columns || [];
  }, [tableNode]);

  const columnNames = useMemo(() => {
    const map: Record<string, string> = {};
    columns.forEach(c => {
      map[c.id] = c.name;
    });
    return map;
  }, [columns]);

  useEffect(() => {
    if (hasAutoConfigured.current) return;
    if (columns.length === 0 || tableData.length === 0) return;
    
    const needsUpdate = !attrs.config.xAxis || !attrs.config.yAxis;
    if (!needsUpdate) {
      hasAutoConfigured.current = true;
      return;
    }
    
    const stringCol = columns.find(c => c.type === 'string' || c.type === 'date');
    const numberCol = columns.find(c => c.type === 'number');
    
    if (stringCol || numberCol) {
      const updates: Partial<EnhancedChartConfig> = {};
      if (!attrs.config.xAxis && stringCol) {
        updates.xAxis = stringCol.id;
      } else if (!attrs.config.xAxis && columns[0]) {
        updates.xAxis = columns[0].id;
      }
      if (!attrs.config.yAxis && numberCol) {
        updates.yAxis = numberCol.id;
      } else if (!attrs.config.yAxis && columns[1]) {
        updates.yAxis = columns[1].id;
      }
      
      if (Object.keys(updates).length > 0) {
        updateAttributes({
          config: { ...attrs.config, ...updates },
        });
      }
    }
    
    hasAutoConfigured.current = true;
  }, [columns, tableData.length, attrs.config, updateAttributes]);

  const handleConfigChange = useCallback((updates: Partial<EnhancedChartConfig>) => {
    updateAttributes({
      config: { ...attrs.config, ...updates },
    });
  }, [attrs.config, updateAttributes]);

  const handleChartTypeChange = useCallback((chartType: ChartType) => {
    updateAttributes({ chartType });
  }, [updateAttributes]);

  const canRender = tableData.length > 0 && attrs.config.xAxis && attrs.config.yAxis;

  if (!attrs.sourceTableId) {
    return (
      <NodeViewWrapper className="chart-block">
        <div 
          className={`
            flex flex-col items-center justify-center text-center transition-all
            p-10 rounded-xl border border-dashed
            ${selected 
              ? 'border-accent-green bg-accent-green/5 ring-2 ring-accent-green ring-offset-2' 
              : 'border-gray-200 dark:border-gray-700 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-900/50'
            }
          `}
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-green/15 to-accent-green/5 flex items-center justify-center mb-3 text-accent-green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Add Chart
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Visualize data from your tables
          </div>
          <TableSelector 
            onSelect={(tableId) => updateAttributes({ sourceTableId: tableId })}
          />
        </div>
      </NodeViewWrapper>
    );
  }

  if (isLoading) {
    return (
      <NodeViewWrapper className="chart-block">
        <div className={`block-empty-state ${selected ? 'is-selected' : ''}`}>
          <div className="animate-pulse flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-accent-green border-t-transparent animate-spin" />
            <div className="block-empty-state-title">Loading Data…</div>
            <div className="block-empty-state-description">
              Materializing "{tableNode?.name || 'table'}"
            </div>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  if (loadError) {
    return (
      <NodeViewWrapper className="chart-block">
        <div className={`block-empty-state ${selected ? 'is-selected' : ''}`}>
          <svg className="w-8 h-8 mx-auto mb-2 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="block-empty-state-title">Error Loading Data</div>
          <div className="block-empty-state-description">{loadError}</div>
        </div>
      </NodeViewWrapper>
    );
  }

  if (!tableData.length) {
    return (
      <NodeViewWrapper className="chart-block">
        <div className={`block-empty-state ${selected ? 'is-selected' : ''}`}>
          <div className="block-empty-state-icon">📊</div>
          <div className="block-empty-state-title">No Data</div>
          <div className="block-empty-state-description">
            {tableNode ? `No data in "${tableNode.name}"` : 'Table not found'}
          </div>
          {tableNode && (
            <button
              onClick={() => openTable(attrs.sourceTableId)}
              className="text-sm text-accent-green hover:underline mt-2"
            >
              Open table
            </button>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  if (!canRender) {
    return (
      <NodeViewWrapper className="chart-block">
        <div className={`tiptap-block-wrapper ${selected ? 'is-selected' : ''}`}>
          <div className="chart-block-container">
            <div className="chart-block-body" style={{ padding: '2rem', textAlign: 'center' }}>
              <div className="text-3xl mb-2 opacity-60">📊</div>
              <p className="text-sm text-gray-500 mb-3">
                Configure chart axes to display data
              </p>
              <button
                onClick={() => setShowConfig(true)}
                className="btn btn-primary btn-sm"
              >
                Configure Chart
              </button>
            </div>
          </div>
          
          {showConfig && (
            <ChartConfigPanel
              config={attrs.config}
              chartType={attrs.chartType}
              columns={columns}
              onConfigChange={handleConfigChange}
              onChartTypeChange={handleChartTypeChange}
              onClose={() => setShowConfig(false)}
            />
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="chart-block" data-drag-handle>
      <div className={`tiptap-block-wrapper ${selected ? 'is-selected' : ''}`}>
        <div className="chart-block-container relative group overflow-hidden">
          {attrs.config.showGrid !== false && (
            <div 
              className="absolute inset-0 pointer-events-none z-0"
              style={{
                backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
          )}
          
          <div className={`
            absolute -top-10 left-1/2 -translate-x-1/2 z-20
            flex items-center gap-1 px-2 py-1.5 rounded-lg
            bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700
            transition-all duration-150
            ${selected ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto'}
          `}>
            <button
              onClick={() => setShowConfig(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-accent-green dark:hover:text-accent-green hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Configure chart"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configure
            </button>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />
            <button
              onClick={() => deleteNode()}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              title="Delete chart (Backspace)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          
          {(attrs.config.title || attrs.config.subtitle) && (
            <div className="chart-block-header relative z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
              {attrs.config.title && (
                <div className="chart-block-title">{attrs.config.title}</div>
              )}
              {attrs.config.subtitle && (
                <div className="chart-block-subtitle">{attrs.config.subtitle}</div>
              )}
            </div>
          )}

          <div className="chart-block-body relative z-10">
            <ChartRenderer
              type={attrs.chartType}
              config={{
                xAxis: attrs.config.xAxis,
                yAxis: attrs.config.yAxis,
                series: attrs.config.series,
                aggregation: attrs.config.aggregation,
                groupBy: attrs.config.groupBy,
              }}
              data={tableData}
              colorScheme={attrs.config.colorScheme}
              showGrid={false}
              showLegend={attrs.config.showLegend}
              columnNames={columnNames}
            />
          </div>

          <div className="chart-block-footer relative z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
            <span>Source: {tableNode?.name || 'Unknown table'}</span>
            <button
              onClick={() => setShowConfig(true)}
              className="text-xs text-accent-green hover:text-accent-green-hover flex items-center gap-1 font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configure
            </button>
          </div>
        </div>

        {showConfig && (
          <ChartConfigPanel
            config={attrs.config}
            chartType={attrs.chartType}
            columns={columns}
            onConfigChange={handleConfigChange}
            onChartTypeChange={handleChartTypeChange}
            onClose={() => setShowConfig(false)}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
});


export const ChartNode = Node.create({
  name: 'chartBlock',
  
  group: 'block',
  
  atom: true,
  
  draggable: true,

  addAttributes() {
    return {
      sourceTableId: {
        default: '',
      },
      chartType: {
        default: 'bar',
      },
      config: {
        default: {
          showLegend: true,
          showGrid: true,
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="chart-block"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'chart-block' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartNodeView);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { selection } = this.editor.state;
        const node = selection.$anchor.parent;
        if (node.type.name === this.name || selection.$anchor.nodeAfter?.type.name === this.name) {
          return this.editor.commands.deleteSelection();
        }
        return false;
      },
      Delete: () => {
        const { selection } = this.editor.state;
        const node = selection.$anchor.parent;
        if (node.type.name === this.name || selection.$anchor.nodeAfter?.type.name === this.name) {
          return this.editor.commands.deleteSelection();
        }
        return false;
      },
    };
  },
});
