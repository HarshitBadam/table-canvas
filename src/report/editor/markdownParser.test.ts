import { describe, expect, it } from 'vitest';

import { isTabularData, parseTabularData } from './markdownParser';

describe('parseTabularData', () => {
  it('returns normalized pasted rows without assigning a header row', () => {
    expect(parseTabularData('Name\tScore\nAda\t10\nGrace')).toEqual({
      rows: [
        ['Name', 'Score'],
        ['Ada', '10'],
        ['Grace', ''],
      ],
    });
  });

  it('recognizes a single tab-separated row as tabular data', () => {
    expect(isTabularData('Ada\t10')).toBe(true);
  });

  it('preserves trailing empty cells from copied grid rows', () => {
    expect(parseTabularData('Ada\t10\t\nGrace\t20\t')).toEqual({
      rows: [
        ['Ada', '10', ''],
        ['Grace', '20', ''],
      ],
    });
  });
});
