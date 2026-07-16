import React, { useState, useCallback, useRef, useEffect } from 'react';
import { TextField } from '@mui/material';

interface Props {
  initialValue: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/**
 * The inline rename field that sits over a node's label. Enter commits,
 * Escape and blur-away cancel.
 */
export const NodeRenameInput = ({
  initialValue,
  onCommit,
  onCancel
}: Props) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Select the whole name so typing replaces it, matching the rename
    // behaviour of file managers and other canvas tools.
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = useCallback(() => {
    const trimmed = value.trim();

    if (trimmed && trimmed !== initialValue) {
      onCommit(trimmed);
    } else {
      onCancel();
    }
  }, [value, initialValue, onCommit, onCancel]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // The canvas listens for keys on `window`; keep our editing keys local.
      e.stopPropagation();

      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    },
    [commit, onCancel]
  );

  return (
    <TextField
      inputRef={inputRef}
      size="small"
      variant="outlined"
      value={value}
      autoComplete="off"
      inputProps={{ 'aria-label': 'Node name' }}
      onChange={(e) => {
        setValue(e.target.value);
      }}
      onKeyDown={onKeyDown}
      onBlur={commit}
      // Stop clicks/drags in the field from reaching the canvas interaction
      // manager, which would deselect the node mid-rename.
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
      }}
      sx={{
        minWidth: 120,
        bgcolor: 'background.paper',
        borderRadius: 1,
        pointerEvents: 'all'
      }}
    />
  );
};
