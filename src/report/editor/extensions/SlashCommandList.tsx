import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { CommandListRef, SlashCommandItem } from './slashCommandTypes';

interface CommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export const SlashCommandList = memo(forwardRef<CommandListRef, CommandListProps>(
  function SlashCommandList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const groupedItems = useMemo(() => {
      const groups: Record<string, SlashCommandItem[]> = {};
      for (const item of items) {
        (groups[item.category] ??= []).push(item);
      }
      return groups;
    }, [items]);

    useEffect(() => setSelectedIndex(0), [items]);
    useEffect(() => {
      scrollRef.current
        ?.querySelector(`[data-index="${selectedIndex}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    const selectItem = useCallback((index: number) => {
      const item = items[index];
      if (item) command(item);
    }, [items, command]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex(previous => (previous - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex(previous => (previous + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }), [items.length, selectItem, selectedIndex]);

    if (items.length === 0) {
      return (
        <div className="slash-command-menu">
          <div className="p-3 text-sm text-gray-400">No results</div>
        </div>
      );
    }

    let globalIndex = 0;
    return (
      <div className="slash-command-menu" ref={scrollRef}>
        {Object.entries(groupedItems).map(([category, categoryItems]) => (
          <div key={category} className="slash-command-group">
            <div className="slash-command-group-title">{category}</div>
            {categoryItems.map(item => {
              const index = globalIndex++;
              return (
                <div
                  key={item.title}
                  data-index={index}
                  className={`slash-command-item ${selectedIndex === index ? 'is-active' : ''}`}
                  onClick={() => selectItem(index)}
                >
                  <div className="slash-command-icon">{item.icon}</div>
                  <div className="slash-command-text">
                    <div className="slash-command-title">{item.title}</div>
                    <div className="slash-command-description">{item.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }
));
