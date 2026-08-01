import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { TipTapEditor, type TipTapEditorHandle } from './TipTapEditor';

const initialContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 100,
  } as DOMRect);
});

afterAll(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  delete window.__gridClipboard;
});

function renderEditor() {
  const ref = createRef<TipTapEditorHandle>();
  const onChange = vi.fn();
  const result = render(
    <TipTapEditor
      ref={ref}
      content={initialContent}
      onChange={onChange}
      reportId="report-1"
    />,
  );

  return { ...result, ref, onChange };
}

function pasteTable(target: HTMLElement, text: string) {
  fireEvent.paste(target, {
    clipboardData: {
      getData: (type: string) => (type === 'text/plain' ? text : ''),
    },
  });
}

describe('TipTapEditor tabular paste', () => {
  it('uses validated grid metadata when headers are included', async () => {
    const { container, ref } = renderEditor();
    const editorContent = await waitFor(() => {
      const content = container.querySelector<HTMLElement>('[contenteditable="true"]');
      expect(content).toBeTruthy();
      return content!;
    });

    window.__gridClipboard = {
      headers: ['Employee', 'Points'],
      columnIds: ['employee', 'points'],
      rows: [['Ada', 10], ['Grace', 20]],
      sourceTableId: 'table-1',
      sourceTableName: 'Scores',
      timestamp: Date.now(),
    };
    pasteTable(editorContent, 'Ada\t10\nGrace\t20');

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /include headers/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /exclude headers/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /include headers/i }));

    await waitFor(() => {
      expect(ref.current?.getJSON().content?.[0]).toMatchObject({
        type: 'inlineTable',
        attrs: {
          headers: ['Employee', 'Points'],
          showHeaders: true,
          sourceInfo: {
            tableId: 'table-1',
            tableName: 'Scores',
            columnIds: ['employee', 'points'],
          },
          rows: [
            ['Ada', '10'],
            ['Grace', '20'],
          ],
        },
      });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container.querySelector('thead')).toBeInTheDocument();
  });

  it('renders external TSV without a header row when headers are excluded', async () => {
    const { container, ref } = renderEditor();
    const editorContent = await waitFor(() => {
      const content = container.querySelector<HTMLElement>('[contenteditable="true"]');
      expect(content).toBeTruthy();
      return content!;
    });

    pasteTable(editorContent, 'Name\tScore\nAda\t10');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /exclude headers/i }));

    await waitFor(() => {
      expect(ref.current?.getJSON().content?.[0]).toMatchObject({
        type: 'inlineTable',
        attrs: {
          headers: ['Column 1', 'Column 2'],
          showHeaders: false,
          rows: [
            ['Name', 'Score'],
            ['Ada', '10'],
          ],
        },
      });
    });
    expect(container.querySelector('thead')).not.toBeInTheDocument();
    expect(container.querySelector('tbody td')?.textContent).toBe('Name');
  });

  it('cancels a pending paste with Cancel or Escape', async () => {
    const { container, ref } = renderEditor();
    const editorContent = await waitFor(() => {
      const content = container.querySelector<HTMLElement>('[contenteditable="true"]');
      expect(content).toBeTruthy();
      return content!;
    });

    pasteTable(editorContent, 'Name\tScore\nAda\t10');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(ref.current?.getJSON().content).toEqual(initialContent.content);

    pasteTable(editorContent, 'Name\tScore\nAda\t10');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(ref.current?.getJSON().content).toEqual(initialContent.content);
  });

  it('rejects stale grid metadata and uses generated external headers', async () => {
    const { container, ref } = renderEditor();
    const editorContent = await waitFor(() => {
      const content = container.querySelector<HTMLElement>('[contenteditable="true"]');
      expect(content).toBeTruthy();
      return content!;
    });

    window.__gridClipboard = {
      headers: ['Stale name', 'Stale score'],
      columnIds: ['name', 'score'],
      rows: [['Ada', 10]],
      sourceTableId: 'table-1',
      sourceTableName: 'Scores',
      timestamp: Date.now() - (3 * 60 * 1000),
    };
    pasteTable(editorContent, 'Ada\t10');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /include headers/i }));

    await waitFor(() => {
      expect(ref.current?.getJSON().content?.[0]).toMatchObject({
        attrs: {
          headers: ['Column 1', 'Column 2'],
          showHeaders: true,
          rows: [['Ada', '10']],
        },
      });
    });
  });

  it('rejects grid metadata whose rows do not match the paste', async () => {
    const { container, ref } = renderEditor();
    const editorContent = await waitFor(() => {
      const content = container.querySelector<HTMLElement>('[contenteditable="true"]');
      expect(content).toBeTruthy();
      return content!;
    });

    window.__gridClipboard = {
      headers: ['Wrong name', 'Wrong score'],
      columnIds: ['name', 'score'],
      rows: [['Ada', 11]],
      sourceTableId: 'table-1',
      sourceTableName: 'Scores',
      timestamp: Date.now(),
    };
    pasteTable(editorContent, 'Ada\t10');
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /include headers/i }));

    await waitFor(() => {
      expect(ref.current?.getJSON().content?.[0]).toMatchObject({
        attrs: {
          headers: ['Column 1', 'Column 2'],
          rows: [['Ada', '10']],
        },
      });
    });
  });
});
