import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton as MUIIconButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography
} from '@mui/material';
import {
  AddOutlined as AddIcon,
  Close as CloseIcon,
  WorkspacesOutlined as GroupIcon
} from '@mui/icons-material';
import type {
  ItemReference,
  ItemReferenceType,
  SelectionKind
} from 'src/types';
import { BASE_LAYER_ID } from 'src/schemas/views';
import { generateId, buildTreeRows, rowsInRange, type TreeRow as TreeRowData } from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { ControlsContainer } from '../components/ControlsContainer';
import { Section } from '../components/Section';
import { TreeRow, ROW_HEIGHT, type DropZone } from './TreeRow';
import { VirtualList } from './VirtualList';

const TREE_HEIGHT = 380;

const DISABLED_CONTRAST = {
  '&.Mui-disabled': {
    color: 'text.disabled',
    borderColor: 'divider'
  }
};

const parseKey = (key: string) => {
  const separator = key.indexOf(':');

  return {
    kind: key.slice(0, separator),
    id: key.slice(separator + 1)
  };
};

export const LayersPanel = () => {
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const activeLayerId = useUiStateStore((state) => {
    return state.activeLayerId;
  });
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const scene = useScene();
  const {
    layers,
    groups,
    currentView,
    visibility,
    createLayer,
    updateLayer,
    deleteLayer,
    setItemsLayer,
    createGroup,
    updateGroup,
    deleteGroup,
    setItemsGroup
  } = scene;

  // The selection lives in uiState, not in this component, so the canvas and
  // the Cmd+G shortcut act on exactly what the tree shows as selected.
  const selectionRefs = useUiStateStore((state) => {
    return state.selection;
  });
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    key: string;
    zone: DropZone;
  } | null>(null);

  const selection = useMemo(() => {
    return new Set(
      selectionRefs.map((ref) => {
        return `${ref.kind}:${ref.id}`;
      })
    );
  }, [selectionRefs]);

  const setSelection = useCallback(
    (keys: Iterable<string>) => {
      uiStateActions.setSelection(
        [...keys].map((key) => {
          const { kind, id } = parseKey(key);

          return { kind: kind as SelectionKind, id };
        })
      );
    },
    [uiStateActions]
  );
  const [menu, setMenu] = useState<{
    anchorEl: HTMLElement;
    row: TreeRowData;
  } | null>(null);

  const itemNames = useMemo(() => {
    const names = new Map<string, string>();

    (modelItems ?? []).forEach((modelItem) => {
      names.set(modelItem.id, modelItem.name);
    });

    return names;
  }, [modelItems]);

  const rows = useMemo(() => {
    return buildTreeRows({ view: currentView, visibility, itemNames });
  }, [currentView, visibility, itemNames]);

  // Where an entity currently lives, so a new group can adopt its layer
  // rather than dragging everything to the base layer.
  const layerOfEntity = useCallback(
    (ref: ItemReference): string | undefined => {
      const collections: Partial<Record<ItemReferenceType, any[]>> = {
        ITEM: currentView.items,
        CONNECTOR: currentView.connectors ?? [],
        RECTANGLE: currentView.rectangles ?? [],
        TEXTBOX: currentView.textBoxes ?? []
      };

      return (collections[ref.type] ?? []).find((entity) => {
        return entity.id === ref.id;
      })?.layerId;
    },
    [currentView]
  );

  const selectedRefs = useMemo(() => {
    const refs: ItemReference[] = [];

    selection.forEach((key) => {
      const { kind, id } = parseKey(key);

      if (kind === 'LAYER' || kind === 'GROUP') return;

      refs.push({ type: kind as ItemReferenceType, id });
    });

    return refs;
  }, [selection]);

  const selectedGroupIds = useMemo(() => {
    return [...selection]
      .filter((key) => {
        return parseKey(key).kind === 'GROUP';
      })
      .map((key) => {
        return parseKey(key).id;
      });
  }, [selection]);

  const onSelectRow = (row: TreeRowData, event: React.MouseEvent) => {
    const isToggle = event.metaKey || event.ctrlKey;
    const isRange = event.shiftKey && anchorKey !== null;

    if (isRange) {
      const next = new Set(selection);

      rowsInRange(rows, anchorKey as string, row.key).forEach((rangeRow) => {
        next.add(rangeRow.key);
      });
      setSelection(next);

      return;
    }

    if (isToggle) {
      const next = new Set(selection);

      if (next.has(row.key)) {
        next.delete(row.key);
      } else {
        next.add(row.key);
      }

      setSelection(next);
      setAnchorKey(row.key);

      return;
    }

    setSelection(new Set([row.key]));
    setAnchorKey(row.key);

    // Clicking a layer also points new items at it. Clicking an entity does
    // NOT open that entity's controls: this panel *is* an ItemControls panel,
    // so setItemControls would swap the tree away the moment you touched a
    // row. Opening an entity's editor is the double-click (onOpenDetails).
    if (row.kind === 'LAYER') {
      uiStateActions.setActiveLayerId(
        row.id === BASE_LAYER_ID ? null : row.id
      );
    }
  };

  /**
   * Resolves a drop into the right move. Dropping INSIDE a container reparents
   * into it; BEFORE/AFTER makes the dragged row a sibling of the target,
   * inserted at that position. Entities have no children, so they only ever
   * accept sibling drops — which for an entity means "join that container".
   *
   * Reparenting into a row's own descendant is refused by the reducers; this
   * catches the common case up front so the pointer never suggests it.
   */
  const onDropRow = (
    target: TreeRowData,
    zone: 'BEFORE' | 'INSIDE' | 'AFTER',
    sourceKey: string
  ) => {
    const source =
      rows.find((row) => {
        return row.key === sourceKey;
      }) ?? null;

    setDraggedKey(null);
    setDropTarget(null);

    if (!source || source.key === target.key) return;

    // The row that follows the drop point, whose id anchors the insert.
    const targetIndex = rows.findIndex((row) => {
      return row.key === target.key;
    });
    const following = zone === 'BEFORE' ? target : rows[targetIndex + 1];

    const containerOf = (row: TreeRowData | undefined) => {
      if (!row) return null;
      if (zone === 'INSIDE') return row;

      // A sibling drop lands in whatever contains the target row.
      for (let i = rows.indexOf(row) - 1; i >= 0; i -= 1) {
        if (rows[i].depth < row.depth && !rows[i].isEntity) return rows[i];
      }

      return null;
    };

    const container = containerOf(target);

    if (source.kind === 'LAYER') {
      // Layers nest only in layers.
      if (container && container.kind !== 'LAYER') return;

      const siblingBefore =
        following && following.kind === 'LAYER' && following.key !== source.key
          ? following.id
          : null;

      scene.moveLayer(
        source.id,
        container ? container.id : null,
        siblingBefore
      );
      return;
    }

    if (source.kind === 'GROUP') {
      if (container?.kind === 'GROUP') {
        const siblingBefore =
          following && following.kind === 'GROUP' ? following.id : null;

        scene.moveGroup(source.id, container.id, siblingBefore);
        return;
      }

      // Dropped onto a layer (or the root): detach from any parent group and
      // relocate the group to that layer.
      scene.moveGroup(source.id, null, null);
      updateGroup(source.id, {
        layerId:
          container && container.id !== BASE_LAYER_ID ? container.id : undefined
      });
      return;
    }

    // An entity joins whatever container it was dropped on or beside.
    const ref: ItemReference = {
      type: source.kind as ItemReferenceType,
      id: source.id
    };

    if (container?.kind === 'GROUP') {
      setItemsGroup([ref], container.id);
      return;
    }

    setItemsGroup([ref], null);
    setItemsLayer(
      [ref],
      container && container.id !== BASE_LAYER_ID ? container.id : null
    );
  };

  const onOpenDetails = (row: TreeRowData) => {
    if (!row.isEntity || row.kind === 'CONNECTOR_ANCHOR') return;

    uiStateActions.setItemControls({
      type: row.kind as ItemReferenceType,
      id: row.id
    });
  };

  const updateEntity = (
    ref: ItemReference,
    updates: { isVisible?: boolean; isLocked?: boolean }
  ) => {
    switch (ref.type) {
      case 'ITEM':
        scene.updateViewItem(ref.id, updates);
        break;
      case 'CONNECTOR':
        scene.updateConnector(ref.id, updates);
        break;
      case 'RECTANGLE':
        scene.updateRectangle(ref.id, updates);
        break;
      case 'TEXTBOX':
        scene.updateTextBox(ref.id, updates);
        break;
      default:
        break;
    }
  };

  const patchRow = (
    row: TreeRowData,
    updates: { isVisible?: boolean; isLocked?: boolean; isCollapsed?: boolean }
  ) => {
    if (row.kind === 'LAYER') {
      updateLayer(row.id, updates);
    } else if (row.kind === 'GROUP') {
      updateGroup(row.id, updates);
    } else {
      updateEntity({ type: row.kind as ItemReferenceType, id: row.id }, updates);
    }
  };

  const onAddLayer = () => {
    const id = generateId();
    const named = layers.filter((layer) => {
      return layer.id !== BASE_LAYER_ID;
    });

    createLayer({ id, name: `Layer ${named.length + 1}` });
    uiStateActions.setActiveLayerId(id);
  };

  const onGroup = () => {
    if (selectedRefs.length === 0) return;

    const id = generateId();

    createGroup(
      {
        id,
        name: `Group ${groups.length + 1}`,
        layerId: layerOfEntity(selectedRefs[0])
      },
      selectedRefs
    );
    setSelection(new Set([`GROUP:${id}`]));
  };

  const onUngroup = () => {
    // Selecting the group itself dissolves it; selecting members just pulls
    // those members out and leaves the group standing.
    if (selectedGroupIds.length > 0) {
      selectedGroupIds.forEach((id) => {
        deleteGroup(id);
      });
    } else if (selectedRefs.length > 0) {
      setItemsGroup(selectedRefs, null);
    }

    setSelection(new Set());
  };

  const canUngroup =
    selectedGroupIds.length > 0 ||
    selectedRefs.some((ref) => {
      const collections: Partial<Record<ItemReferenceType, any[]>> = {
        ITEM: currentView.items,
        CONNECTOR: currentView.connectors ?? [],
        RECTANGLE: currentView.rectangles ?? [],
        TEXTBOX: currentView.textBoxes ?? []
      };

      return (collections[ref.type] ?? []).some((entity) => {
        return entity.id === ref.id && entity.groupId !== undefined;
      });
    });

  const closeMenu = () => {
    return setMenu(null);
  };

  const menuRow = menu?.row;

  return (
    <ControlsContainer>
      <Box sx={{ position: 'relative' }}>
        <MUIIconButton
          aria-label="Close"
          onClick={() => {
            return uiStateActions.setItemControls(null);
          }}
          sx={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}
          size="small"
        >
          <CloseIcon />
        </MUIIconButton>

        <Section>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ pr: 4 }}
          >
            <Typography fontWeight={600}>Layers</Typography>
            <Button startIcon={<AddIcon />} size="small" onClick={onAddLayer}>
              Add layer
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            {/* MUI's default disabled outlined button is action.disabled on
                paper, which is well under AA in light mode. Pin both the
                label and the border to the contrast-checked tokens. */}
            <Button
              size="small"
              variant="outlined"
              startIcon={<GroupIcon />}
              disabled={selectedRefs.length === 0}
              onClick={onGroup}
              sx={DISABLED_CONTRAST}
            >
              Group
            </Button>
            <Button
              size="small"
              variant="outlined"
              disabled={!canUngroup}
              onClick={onUngroup}
              sx={DISABLED_CONTRAST}
            >
              Ungroup
            </Button>
          </Stack>
        </Section>

        <Section sx={{ pt: 0 }}>
          <Box role="tree" aria-label="Diagram objects">
            <VirtualList
              rows={rows}
              rowHeight={ROW_HEIGHT}
              height={Math.min(TREE_HEIGHT, rows.length * ROW_HEIGHT)}
              keyOf={(row) => {
                return row.key;
              }}
              renderRow={(row) => {
                return (
                  <TreeRow
                    row={row}
                    isSelected={selection.has(row.key)}
                    isActiveLayer={
                      row.kind === 'LAYER' &&
                      (row.id === BASE_LAYER_ID
                        ? activeLayerId === null
                        : activeLayerId === row.id)
                    }
                    canRename={
                      (row.kind === 'LAYER' && row.id !== BASE_LAYER_ID) ||
                      row.kind === 'GROUP'
                    }
                    onSelect={(event) => {
                      return onSelectRow(row, event);
                    }}
                    onOpenDetails={() => {
                      return onOpenDetails(row);
                    }}
                    isDragging={draggedKey === row.key}
                    dropZone={
                      dropTarget?.key === row.key && draggedKey !== row.key
                        ? dropTarget.zone
                        : null
                    }
                    onDragStart={() => {
                      return setDraggedKey(row.key);
                    }}
                    onDragEnd={() => {
                      setDraggedKey(null);
                      setDropTarget(null);
                    }}
                    onDragOverZone={(zone) => {
                      return setDropTarget({ key: row.key, zone });
                    }}
                    onDrop={(zone, sourceKey) => {
                      return onDropRow(row, zone, sourceKey);
                    }}
                    onToggleExpanded={() => {
                      return patchRow(row, { isCollapsed: row.isExpanded });
                    }}
                    onToggleVisible={() => {
                      return patchRow(row, { isVisible: !row.isVisible });
                    }}
                    onToggleLocked={() => {
                      return patchRow(row, { isLocked: !row.isLocked });
                    }}
                    onRename={(name) => {
                      if (row.kind === 'LAYER') updateLayer(row.id, { name });
                      if (row.kind === 'GROUP') updateGroup(row.id, { name });
                    }}
                    onOpenMenu={(anchorEl) => {
                      return setMenu({ anchorEl, row });
                    }}
                  />
                );
              }}
            />
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1.5 }}
          >
            New items are added to the highlighted layer. Double-click a layer
            or group name to rename it. Ctrl/Cmd-click and Shift-click select
            several rows, then Group them.
          </Typography>
        </Section>
      </Box>

      <Menu
        open={menu !== null}
        anchorEl={menu?.anchorEl}
        onClose={closeMenu}
      >
        {menuRow && menuRow.kind === 'GROUP' && (
          <MenuItem
            onClick={() => {
              deleteGroup(menuRow.id);
              closeMenu();
            }}
          >
            <ListItemText>Ungroup</ListItemText>
          </MenuItem>
        )}
        {menuRow &&
          menuRow.kind === 'LAYER' &&
          menuRow.id !== BASE_LAYER_ID && (
            <MenuItem
              onClick={() => {
                deleteLayer(menuRow.id);
                if (activeLayerId === menuRow.id) {
                  uiStateActions.setActiveLayerId(null);
                }
                closeMenu();
              }}
            >
              <ListItemText>
                Delete layer (contents move up one level)
              </ListItemText>
            </MenuItem>
          )}
        {menuRow && menuRow.isEntity && [
          <Divider key="divider" />,
          <MenuItem disabled key="caption">
            <Typography variant="caption">Move to layer</Typography>
          </MenuItem>,
          ...[
            { id: BASE_LAYER_ID, name: 'Base' },
            ...layers.filter((layer) => {
              return layer.id !== BASE_LAYER_ID;
            })
          ].map((layer) => {
            return (
              <MenuItem
                key={layer.id}
                onClick={() => {
                  setItemsLayer(
                    [
                      {
                        type: menuRow.kind as ItemReferenceType,
                        id: menuRow.id
                      }
                    ],
                    layer.id === BASE_LAYER_ID ? null : layer.id
                  );
                  closeMenu();
                }}
              >
                <ListItemText>{layer.name}</ListItemText>
              </MenuItem>
            );
          })
        ]}
      </Menu>
    </ControlsContainer>
  );
};
