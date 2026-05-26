/**
 * ToggleNode - TipTap Custom Node for Collapsible Sections
 * 
 * Creates toggle/collapsible blocks like Notion.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, memo } from 'react';


interface ToggleNodeAttrs {
  title: string;
  isExpanded: boolean;
}


const ToggleNodeView = memo(function ToggleNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) {
  const attrs = node.attrs as ToggleNodeAttrs;
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(attrs.title);

  const toggleExpand = useCallback(() => {
    updateAttributes({ isExpanded: !attrs.isExpanded });
  }, [attrs.isExpanded, updateAttributes]);

  const handleTitleDoubleClick = useCallback(() => {
    setEditTitle(attrs.title);
    setIsEditing(true);
  }, [attrs.title]);

  const handleTitleBlur = useCallback(() => {
    updateAttributes({ title: editTitle });
    setIsEditing(false);
  }, [editTitle, updateAttributes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditTitle(attrs.title);
    }
  }, [handleTitleBlur, attrs.title]);

  return (
    <NodeViewWrapper className="toggle-block">
      <div className={`tiptap-block-wrapper ${selected ? 'is-selected' : ''}`}>
        {/* Toggle Header */}
        <div className="toggle-header" onClick={toggleExpand}>
          <span className={`toggle-arrow ${attrs.isExpanded ? 'is-expanded' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M4.5 2L9 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className="toggle-title bg-transparent border-none outline-none w-full"
              placeholder="Toggle title..."
            />
          ) : (
            <span 
              className="toggle-title"
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleTitleDoubleClick();
              }}
            >
              {attrs.title || 'Toggle'}
            </span>
          )}
        </div>

        {/* Toggle Content */}
        <div className={`toggle-content ${attrs.isExpanded ? '' : 'is-collapsed'}`}>
          <NodeViewContent className="toggle-content-inner no-placeholder" />
        </div>
      </div>
    </NodeViewWrapper>
  );
});


export const ToggleNode = Node.create({
  name: 'toggle',
  
  group: 'block',
  
  content: 'block+',
  
  draggable: true,

  addAttributes() {
    return {
      title: { default: 'Toggle' },
      isExpanded: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'toggle' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleNodeView);
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-t': () => {
        return this.editor.commands.insertContent({
          type: this.name,
          attrs: { title: 'Toggle', isExpanded: true },
          content: [{ type: 'paragraph' }],
        });
      },
    };
  },
});

export default ToggleNode;
