/**
 * CalloutNode - TipTap Custom Node for Callouts/Highlights
 * 
 * Creates callout blocks with different variants (info, success, warning, error, note).
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, memo } from 'react';


type CalloutVariant = 'info' | 'success' | 'warning' | 'error' | 'note';

interface CalloutNodeAttrs {
  variant: CalloutVariant;
}

const CALLOUT_LABELS: Record<CalloutVariant, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  note: 'Note',
};


function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="callout-icon-svg callout-icon-info">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  );
}

function SuccessIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="callout-icon-svg callout-icon-success">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="callout-icon-svg callout-icon-warning">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="callout-icon-svg callout-icon-error">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="callout-icon-svg callout-icon-note">
      <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
    </svg>
  );
}

const CALLOUT_ICONS: Record<CalloutVariant, () => JSX.Element> = {
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarningIcon,
  error: ErrorIcon,
  note: NoteIcon,
};


const CalloutNodeView = memo(function CalloutNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const attrs = node.attrs as CalloutNodeAttrs;
  const [showVariantPicker, setShowVariantPicker] = useState(false);

  const handleVariantChange = useCallback((variant: CalloutVariant) => {
    updateAttributes({ variant });
    setShowVariantPicker(false);
  }, [updateAttributes]);

  const IconComponent = CALLOUT_ICONS[attrs.variant];

  return (
    <NodeViewWrapper>
      <div 
        className={`callout-block callout-${attrs.variant} ${selected ? 'is-selected' : ''}`}
        style={{ position: 'relative' }}
      >
        {/* Icon */}
        <span 
          className="callout-icon cursor-pointer"
          onClick={() => setShowVariantPicker(!showVariantPicker)}
          title="Change callout type"
        >
          <IconComponent />
        </span>

        {/* Content */}
        <div className="callout-content no-placeholder">
          <NodeViewContent className="no-placeholder" />
        </div>

        {/* Variant Picker */}
        {showVariantPicker && selected && (
          <div 
            className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 p-1"
            style={{ minWidth: '120px' }}
          >
            {(Object.keys(CALLOUT_ICONS) as CalloutVariant[]).map(variant => {
              const Icon = CALLOUT_ICONS[variant];
              return (
                <button
                  key={variant}
                  onClick={() => handleVariantChange(variant)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    attrs.variant === variant ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                >
                  <span className="w-4 h-4"><Icon /></span>
                  <span>{CALLOUT_LABELS[variant]}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
});


export const CalloutNode = Node.create({
  name: 'callout',
  
  group: 'block',
  
  content: 'block+',
  
  draggable: true,

  addAttributes() {
    return {
      variant: { default: 'info' as CalloutVariant },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-c': () => {
        return this.editor.commands.insertContent({
          type: this.name,
          attrs: { variant: 'info' },
          content: [{ type: 'paragraph' }],
        });
      },
    };
  },
});

export default CalloutNode;
