/**
 * DividerBlock Component
 * 
 * Simple horizontal divider.
 */

interface DividerBlockProps {
  isSelected?: boolean;
}

export function DividerBlock({ isSelected }: DividerBlockProps) {
  return (
    <div className="py-3">
      <hr className={`${isSelected ? 'border-accent-green' : 'border-gray-200 dark:border-gray-700'}`} />
    </div>
  );
}

export default DividerBlock;
