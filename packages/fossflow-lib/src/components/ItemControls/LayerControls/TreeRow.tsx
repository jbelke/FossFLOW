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

/**
 * Standard tree drag zones: the outer quarters insert between siblings, the
 * middle half drops into the row. Entity rows hold nothing, so their middle
 * band collapses — dropping on a node means "next to it", never "into it".
 */
const zoneFromEvent = (
  event: React.DragEvent,
  row: TreeRowData
): DropZone => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const offset = (event.clientY - bounds.top) / (bounds.height || 1);

  if (row.isEntity) return offset < 0.5 ? 'BEFORE' : 'AFTER';
  if (offset < 0.25) return 'BEFORE';
  if (offset > 0.75) return 'AFTER';

  return 'INSIDE';
};

const KIND_ICONS = {
  LAYER: LayerIcon,
  GROUP: GroupIcon,
  ITEM: NodeIcon,
  CONNECTOR: ConnectorIcon,
  CONNECTOR_ANCHOR: ConnectorIcon,
  RECTANGLE: RectangleIcon,
  TEXTBOX: TextIcon
};

/** Where a drop would land relative to the hovered row. */
export type DropZone = 'BEFORE' | 'INSIDE' | 'AFTER';

interface Props {
  row: TreeRowData;
  isSelected: boolean;
  isActiveLayer: boolean;
  canRename: boolean;
  /** Non-null while a drag is hovering this row. */
  dropZone: DropZone | null;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverZone: (zone: DropZone) => void;
  /** sourceKey comes off the dataTransfer, not React state — see onDrop. */
  onDrop: (zone: DropZone, sourceKey: string) => void;
  onSelect: (event: React.MouseEvent) => void;
  /** Double-click on an entity row — opens that entity's own controls. */
  onOpenDetails: () => void;
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
  dropZone,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOverZone,
  onDrop,
  onSelect,
  onOpenDetails,
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
      draggable
      onDragStart={(e: React.DragEvent) => {
        // Needed for Firefox to start a drag at all.
        e.dataTransfer.setData('text/plain', row.key);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOverZone(zoneFromEvent(e, row));
      }}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault();
        // The drag source is carried on the dataTransfer rather than read
        // back out of React state: the state set in onDragStart has not
        // necessarily re-rendered by the time the drop handler's closure was
        // created, so reading it here can see a stale null.
        onDrop(zoneFromEvent(e, row), e.dataTransfer.getData('text/plain'));
      }}
      sx={{
        height: ROW_HEIGHT,
        pl: `${row.depth * INDENT + 4}px`,
        pr: 0.5,
        borderRadius: 1,
        opacity: isDragging ? 0.4 : 1,
        bgcolor:
          dropZone === 'INSIDE'
            ? 'action.selected'
            : isSelected
              ? 'action.selected'
              : 'transparent',
        // The insert line and the "drop inside" fill are mutually exclusive,
        // so one box-shadow slot carries whichever applies.
        boxShadow:
          dropZone === 'BEFORE'
            ? (theme) => {
                return `inset 0 2px 0 0 ${theme.palette.primary.main}`;
              }
            : dropZone === 'AFTER'
              ? (theme) => {
                  return `inset 0 -2px 0 0 ${theme.palette.primary.main}`;
                }
              : dropZone === 'INSIDE'
                ? (theme) => {
                    return `inset 0 0 0 2px ${theme.palette.primary.main}`;
                  }
                : 'none',
        outline: isActiveLayer && !dropZone ? '1px solid' : 'none',
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
            sx={{
              color: 'text.secondary',
              '&:hover': { color: 'text.primary' }
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

      {/* Semantic palette colours throughout rather than opacity: the theme's
          text.secondary/text.disabled are the values checked against AA in
          both modes, and stacked opacity silently undercuts them. */}
      <KindIcon
        fontSize="small"
        sx={{ flexShrink: 0, color: 'text.secondary', mr: 0.25 }}
      />

      <Box
        component="button"
        type="button"
        onClick={onSelect}
        onDoubleClick={(e: React.MouseEvent) => {
          e.stopPropagation();

          // Containers rename in place; entities have no name of their own
          // here, so their double-click opens their editor instead.
          if (canRename) {
            setEditedName(row.name);
          } else {
            onOpenDetails();
          }
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
              color: row.isEffectivelyHidden ? 'text.disabled' : 'text.primary',
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
            sx={{
              color: isInheritedHide ? 'text.disabled' : 'text.secondary',
              '&:hover': { color: 'text.primary' }
            }}
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
            sx={{
              color: isInheritedLock ? 'text.disabled' : 'text.secondary',
              '&:hover': { color: 'text.primary' }
            }}
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
