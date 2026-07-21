import React, { useState } from 'react';
import {
  Box,
  Chip,
  IconButton as MUIIconButton,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  DeleteOutlined as DeleteIcon,
  LockOutlined as LockIcon,
  LockOpenOutlined as LockOpenIcon,
  VisibilityOutlined as VisibleIcon,
  VisibilityOffOutlined as HiddenIcon
} from '@mui/icons-material';
import { Layer } from 'src/types';
import { isLayerVisible, isLayerLocked } from 'src/utils';

interface Props {
  layer: Layer;
  count: number;
  isActive: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onToggleLocked: () => void;
  // Absent for the base layer, which can't be renamed or deleted.
  onRename?: (name: string) => void;
  onDelete?: () => void;
}

export const LayerRow = ({
  layer,
  count,
  isActive,
  onSelect,
  onToggleVisible,
  onToggleLocked,
  onRename,
  onDelete
}: Props) => {
  const [editedName, setEditedName] = useState<string | null>(null);
  const visible = isLayerVisible(layer);
  const locked = isLayerLocked(layer);

  const commitRename = () => {
    if (editedName !== null && onRename) {
      const trimmed = editedName.trim();
      if (trimmed && trimmed !== layer.name) onRename(trimmed);
    }
    setEditedName(null);
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.5}
      onClick={onSelect}
      sx={{
        px: 1,
        py: 0.5,
        borderRadius: 1,
        cursor: 'pointer',
        bgcolor: isActive ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: isActive ? 'action.selected' : 'action.hover' }
      }}
    >
      <Tooltip title={visible ? 'Hide layer' : 'Show layer'}>
        <MUIIconButton
          aria-label={visible ? 'Hide layer' : 'Show layer'}
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible();
          }}
        >
          {visible ? (
            <VisibleIcon fontSize="small" />
          ) : (
            <HiddenIcon fontSize="small" />
          )}
        </MUIIconButton>
      </Tooltip>
      <Tooltip title={locked ? 'Unlock layer' : 'Lock layer (click-through)'}>
        <MUIIconButton
          aria-label={locked ? 'Unlock layer' : 'Lock layer'}
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onToggleLocked();
          }}
        >
          {locked ? (
            <LockIcon fontSize="small" />
          ) : (
            <LockOpenIcon fontSize="small" />
          )}
        </MUIIconButton>
      </Tooltip>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {editedName !== null ? (
          <TextField
            value={editedName}
            size="small"
            autoFocus
            fullWidth
            inputProps={{ maxLength: 100 }}
            onChange={(e) => {
              setEditedName(e.target.value);
            }}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditedName(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        ) : (
          <Typography
            noWrap
            sx={{
              opacity: visible ? 1 : 0.5,
              fontStyle: visible ? 'normal' : 'italic'
            }}
            onDoubleClick={(e) => {
              if (!onRename) return;
              e.stopPropagation();
              setEditedName(layer.name);
            }}
          >
            {layer.name}
          </Typography>
        )}
      </Box>
      <Chip label={count} size="small" variant="outlined" />
      {onDelete && (
        <Tooltip title="Delete layer (items move to Base)">
          <MUIIconButton
            aria-label="Delete layer"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <DeleteIcon fontSize="small" />
          </MUIIconButton>
        </Tooltip>
      )}
    </Stack>
  );
};
