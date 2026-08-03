import { memo, useMemo } from 'react';
import { useDialogFocus } from '@/components/useDialogFocus';

interface PasteTableHeadersModalProps {
  headers: string[];
  rows: string[][];
  onChoose: (showHeaders: boolean) => void;
  onClose: () => void;
}

export const PasteTableHeadersModal = memo(function PasteTableHeadersModal({
  headers,
  rows,
  onChoose,
  onClose,
}: PasteTableHeadersModalProps) {
  const dialogRef = useDialogFocus<HTMLDivElement>(true, onClose);
  const dimensions = useMemo(() => `${rows.length} rows × ${headers.length} columns`, [headers.length, rows.length]);
  const headingSummary = useMemo(() => {
    const namedHeaders = headers.map((header, index) => header.trim() || `Column ${index + 1}`);
    const visibleHeaders = namedHeaders.slice(0, 3).join(', ');
    const remainingCount = namedHeaders.length - 3;

    return remainingCount > 0 ? `${visibleHeaders}, +${remainingCount} more` : visibleHeaders;
  }, [headers]);

  return (
    <div className="paste-table-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="paste-table-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-table-title"
        aria-describedby="paste-table-description"
        tabIndex={-1}
      >
        <div className="paste-table-modal-header">
          <div className="paste-table-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.75A1.75 1.75 0 015.75 4h12.5A1.75 1.75 0 0120 5.75v12.5A1.75 1.75 0 0118.25 20H5.75A1.75 1.75 0 014 18.25V5.75zM4 10h16M9 4v16" />
            </svg>
          </div>
          <div>
            <h3 id="paste-table-title">Paste table</h3>
            <p id="paste-table-description">Should the first row be column headings?</p>
          </div>
        </div>

        <div className="paste-table-modal-body">
          <span className="paste-table-summary">{dimensions}</span>
          <div className="paste-table-options">
            <button
              type="button"
              className="paste-table-option"
              onClick={() => onChoose(true)}
              data-dialog-initial-focus
            >
              <span className="paste-table-option-content">
                <span className="paste-table-option-title">Use as headings</span>
                <span className="paste-table-option-description">Includes: {headingSummary}</span>
              </span>
            </button>
            <button
              type="button"
              className="paste-table-option"
              onClick={() => onChoose(false)}
            >
              <span className="paste-table-option-content">
                <span className="paste-table-option-title">Keep as data</span>
                <span className="paste-table-option-description">Include every row in the table body.</span>
              </span>
            </button>
          </div>
        </div>

        <div className="paste-table-modal-footer">
          <button type="button" className="paste-table-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
});
