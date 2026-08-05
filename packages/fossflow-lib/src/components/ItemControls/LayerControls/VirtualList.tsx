import React, { useCallback, useRef, useState } from 'react';
import { Box } from '@mui/material';

interface Props<T> {
  rows: T[];
  rowHeight: number;
  height: number;
  /** Rows rendered beyond the viewport on each side, to hide scroll tearing. */
  overscan?: number;
  keyOf: (row: T) => string;
  renderRow: (row: T) => React.ReactNode;
}

/**
 * Fixed-row-height windowing. Every row in this tree is exactly one line, so
 * offsets are pure arithmetic and no measurement pass is needed — which is
 * what makes hand-rolling this cheaper than taking on a windowing dependency
 * in a library package.
 *
 * Expanding a layer with 163 items renders the ~20 rows on screen rather than
 * all 163.
 */
export const VirtualList = <T,>({
  rows,
  rowHeight,
  height,
  overscan = 6,
  keyOf,
  renderRow
}: Props<T>) => {
  const [scrollTop, setScrollTop] = useState(0);
  const frame = useRef<number | null>(null);

  // Scroll fires far more often than a frame can paint; coalescing to one
  // rAF keeps a fast flick from queueing a setState per event.
  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const next = event.currentTarget.scrollTop;

    if (frame.current !== null) return;

    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setScrollTop(next);
    });
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(
    rows.length,
    start + Math.ceil(height / rowHeight) + overscan * 2
  );
  const visible = rows.slice(start, end);

  return (
    <Box
      onScroll={onScroll}
      sx={{
        height,
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative'
      }}
    >
      <Box sx={{ height: rows.length * rowHeight, position: 'relative' }}>
        <Box
          sx={{
            position: 'absolute',
            top: start * rowHeight,
            left: 0,
            right: 0
          }}
        >
          {visible.map((row) => {
            return <Box key={keyOf(row)}>{renderRow(row)}</Box>;
          })}
        </Box>
      </Box>
    </Box>
  );
};
