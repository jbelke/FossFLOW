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
  ChevronRight as CollapsedIcon,
  ExpandMore as ExpandedIcon,
  LockOutlined as LockIcon,
  LockOpenOutlined as LockOpenIcon,
  MoreVert as MoreIcon,
  VisibilityOutlined as VisibleIcon,
  VisibilityOffOutlined as HiddenIcon,
  FolderOutlined as LayerIcon,
  WorkspacesOutlined as GroupIcon,
  CropSquare as RectangleIcon,
  TitleOutlined as TextIcon,
  TimelineOutlined as ConnectorIcon,
  WidgetsOutlined as NodeIcon
} from '@mui/icons-material';
import type { TreeRow as TreeRowData } from 'src/utils';

export const ROW_HEIGHT = 34;
const INDENT = 14;

const KIND_ICONS = {
  LAYER: LayerIcon,
  GROUP: GroupIcon,
  ITEM: NodeIcon,
  CONNECTOR: ConnectorIcon,
  CONNECTOR_ANCHOR: ConnectorIcon,
  RECTANGLE: RectangleIcon,
  TEXTBOX: TextIcon
};

interface Props {
  row: TreeRowData;
  isSelected: boolean;
  isActiveLayer: boolean;
  canRename: boolean;
  onSelect: (event: React.MouseEvent) => void;
  onToggleExpanded: () => void;
  onToggleVisible: () => void;
  onToggleLocked: () => void;
  onRename: (name: string) => void;
  onOpenMenu: (anchor: HTMLElement) => void;
}

export const TreeRow = ({
  row,
  isSelected,
  isActiveLayer,
  canRename,
  onSelect,
  onToggleExpanded,
  onToggleVisible,
  onToggleLocked,
  onRename,
  onOpenMenu
}: Props) => {
  const [editedName, setEditedName] = useState<string | null>(null);
  const KindIcon = KIND_ICONS[row.kind];

  // A row whose own flag is set owns the state; one that only looks hidden
  // because an ancestor is hidden shows a dimmer, non-authoritative icon.
  const isInheritedHide = row.isEffectivelyHidden && row.isVisible;
  const isInheritedLock = row.isEffectivelyLocked && !row.isLocked;

  const commitRename = () => {
    if (editedName !== null) {
      const trimmed = editedName.trim();
      if (trimmed && trimmed !== row.name) onRename(trimmed);
    }
    setEditedName(null);
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.25}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={isSelected}
      aria-expanded={row.hasChildren ? row.isExpanded : undefined}
      sx={{
        height: ROW_HEIGHT,
        pl: `${row.depth * INDENT + 4}px`,
        pr: 0.5,
        borderRadius: 1,
        bgcolor: isSelected ? 'action.selected' : 'transparent',
        outline: isActiveLayer ? '1px solid' : 'none',
        outlineColor: 'primary.main',
        '&:hover': {
          bgcolor: isSelected ? 'action.selected' : 'action.hover'
        },
        '&:hover .tree-row-menu': { opacity: 1 }
      }}
    >
      <Box sx={{ width: 22, flexShrink: 0 }}>
        {row.hasChildren && (
          <MUIIconButton
            aria-label={row.isExpanded ? 'Collapse' : 'Expand'}
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded();
            }}
          >
            {row.isExpanded ? (
              <ExpandedIcon fontSize="small" />
            ) : (
              <CollapsedIcon fontSize="small" />
            )}
          </MUIIconButton>
        )}
      </Box>

      <KindIcon
        fontSize="small"
        sx={{ flexShrink: 0, opacity: 0.6, mr: 0.25 }}
      />

      <Box
        component="button"
        type="button"
        onClick={onSelect}
        onDoubleClick={(e: React.MouseEvent) => {
          if (!canRename) return;
          e.stopPropagation();
          setEditedName(row.name);
        }}
        sx={{
          flexGrow: 1,
          minWidth: 0,
          textAlign: 'left',
          background: 'none',
          border: 'none',
          p: 0,
          font: 'inherit',
          color: 'inherit',
          cursor: 'pointer'
        }}
      >
        {editedName !== null ? (
          <TextField
            value={editedName}
            size="small"
            autoFocus
            fullWidth
            variant="standard"
            inputProps={{ maxLength: 100 }}
            onChange={(e) => {
              setEditedName(e.target.value);
            }}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
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
            variant="body2"
            sx={{
              opacity: row.isEffectivelyHidden ? 0.45 : 1,
              fontStyle: row.isEffectivelyHidden ? 'italic' : 'normal',
              fontWeight: row.isEntity ? 400 : 500
            }}
          >
            {row.name}
          </Typography>
        )}
      </Box>

      {!row.isEntity && row.descendantCount > 0 && (
        <Chip
          label={row.descendantCount}
          size="small"
          variant="outlined"
          sx={{ height: 18, flexShrink: 0, '& .MuiChip-label': { px: 0.75 } }}
        />
      )}

      <Tooltip
        title={
          isInheritedHide
            ? 'Hidden by a parent layer or group'
            : row.isVisible
              ? 'Hide'
              : 'Show'
        }
      >
        <span>
          <MUIIconButton
            aria-label={row.isVisible ? `Hide ${row.name}` : `Show ${row.name}`}
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisible();
            }}
            sx={{ opacity: isInheritedHide ? 0.35 : 1 }}
          >
            {row.isVisible ? (
              <VisibleIcon fontSize="small" />
            ) : (
              <HiddenIcon fontSize="small" />
            )}
          </MUIIconButton>
        </span>
      </Tooltip>

      <Tooltip
        title={
          isInheritedLock
            ? 'Locked by a parent layer or group'
            : row.isLocked
              ? 'Unlock'
              : 'Lock (click-through)'
        }
      >
        <span>
          <MUIIconButton
            aria-label={row.isLocked ? `Unlock ${row.name}` : `Lock ${row.name}`}
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onToggleLocked();
            }}
            sx={{ opacity: isInheritedLock ? 0.35 : 1 }}
          >
            {row.isLocked ? (
              <LockIcon fontSize="small" />
            ) : (
              <LockOpenIcon fontSize="small" />
            )}
          </MUIIconButton>
        </span>
      </Tooltip>

      <MUIIconButton
        className="tree-row-menu"
        aria-label={`Actions for ${row.name}`}
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          onOpenMenu(e.currentTarget);
        }}
        sx={{ opacity: 0, '&:focus-visible': { opacity: 1 } }}
      >
        <MoreIcon fontSize="small" />
      </MUIIconButton>
    </Stack>
  );
};
