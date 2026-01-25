/**
 * ConfigPanel - Reusable configuration panel component
 * 
 * Used for chart and table configuration.
 */

import { memo, ReactNode } from 'react';

interface ConfigPanelProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}

export const ConfigPanel = memo(function ConfigPanel({
  title,
  children,
  onClose,
  className = '',
}: ConfigPanelProps) {
  return (
    <div className={`block-config-panel ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100">
          {title}
        </h4>
        <button 
          onClick={onClose} 
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
});

interface ConfigSectionProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export const ConfigSection = memo(function ConfigSection({
  label,
  children,
  className = '',
}: ConfigSectionProps) {
  return (
    <div className={`block-config-section ${className}`}>
      <label className="block-config-label">{label}</label>
      {children}
    </div>
  );
});

export default ConfigPanel;
