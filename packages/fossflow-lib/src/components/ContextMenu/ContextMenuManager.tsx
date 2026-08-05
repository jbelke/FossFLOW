import React, { useCallback } from 'react';
import type { ItemReference } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { getTilePosition, CoordsUtils, generateId } from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { useNodeActions } from 'src/hooks/useNodeActions';
import { useEntityActions } from 'src/hooks/useEntityActions';
import { useDiagramUtils } from 'src/hooks/useDiagramUtils';
import { useModelStore } from 'src/stores/modelStore';
import { TEXTBOX_DEFAULTS } from 'src/config';
import { ContextMenu, type MenuItemI } from './ContextMenu';

interface Props {
  anchorEl?: HTMLElement;
}

const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl';

// Only nodes carry a name, a clipboard representation and an icon, so the
// items backed by useNodeActions are gated on this. Everything else in the
// entity menu works for rectangles, text boxes and connectors too — which is
// the point: the old menu was ITEM-only and unreachable.
const isNode = (ref: ItemReference | undefined) => {
  return ref?.type === 'ITEM';
};

export const ContextMenuManager = ({ anchorEl }: Props) => {
  const scene = useScene();
  const { createNode, duplicateNode, copyNode, pasteNode, hasClipboard } =
    useNodeActions();
  const { deleteEntities, setFlags, allHaveFlag, allEntityRefs } =
    useEntityActions();
  const { fitToView } = useDiagramUtils();
  const model = useModelStore((state) => {
    return state;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
  const contextMenu = useUiStateStore((state) => {
    return state.contextMenu;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });

  const onClose = useCallback(() => {
    uiStateActions.setContextMenu(null);
  }, [uiStateActions]);

  if (!contextMenu) return null;

  const position = CoordsUtils.multiply(
    getTilePosition({ tile: contextMenu.tile }),
    zoom
  );

  if (contextMenu.type === 'EMPTY') {
    const canvasItems: MenuItemI[] = [
      {
        label: 'Add node',
        onClick: () => {
          if (model.icons.length > 0) {
            const newId = createNode(contextMenu.tile, model.icons[0].id);

            // Drop straight into renaming so the node can be named without a
            // trip to the settings panel.
            if (newId) {
              uiStateActions.setItemControls({ type: 'ITEM', id: newId });
              uiStateActions.setRenamingItemId(newId);
            }
          }
          onClose();
        }
      },
      {
        label: 'Add rectangle',
        onClick: () => {
          if (model.colors.length > 0) {
            scene.createRectangle({
              id: generateId(),
              color: model.colors[0].id,
              from: contextMenu.tile,
              to: contextMenu.tile
            });
          }
          onClose();
        }
      },
      {
        label: 'Add text',
        onClick: () => {
          scene.createTextBox({
            ...TEXTBOX_DEFAULTS,
            id: generateId(),
            tile: contextMenu.tile
          });
          onClose();
        }
      },
      {
        label: 'Paste',
        shortcut: `${MOD}+V`,
        disabled: !hasClipboard,
        dividerBefore: true,
        onClick: () => {
          const pastedId = pasteNode(contextMenu.tile);

          if (pastedId) {
            uiStateActions.setItemControls({ type: 'ITEM', id: pastedId });
          }
          onClose();
        }
      },
      {
        label: 'Select all',
        shortcut: `${MOD}+A`,
        onClick: () => {
          uiStateActions.setSelection(
            allEntityRefs().map((ref) => {
              return { kind: ref.type, id: ref.id };
            })
          );
          onClose();
        }
      },
      {
        label: 'Unlock all',
        dividerBefore: true,
        onClick: () => {
          // Sweeps the whole view rather than the selection: a locked entity
          // cannot be selected, so a selection-scoped unlock could never
          // reach the things that need unlocking.
          scene.transaction(() => {
            scene.layers.forEach((layer) => {
              if (layer.isLocked) {
                scene.updateLayer(layer.id, { isLocked: false });
              }
            });
            scene.groups.forEach((group) => {
              if (group.isLocked) {
                scene.updateGroup(group.id, { isLocked: false });
              }
            });
            scene.items.forEach((entity) => {
              if (entity.isLocked) {
                scene.updateViewItem(entity.id, { isLocked: false });
              }
            });
            scene.rectangles.forEach((entity) => {
              if (entity.isLocked) {
                scene.updateRectangle(entity.id, { isLocked: false });
              }
            });
            scene.textBoxes.forEach((entity) => {
              if (entity.isLocked) {
                scene.updateTextBox(entity.id, { isLocked: false });
              }
            });
            scene.connectors.forEach((entity) => {
              if (entity.isLocked) {
                scene.updateConnector(entity.id, { isLocked: false });
              }
            });
          });
          onClose();
        }
      },
      {
        label: 'Layers',
        onClick: () => {
          uiStateActions.setItemControls({ type: 'LAYERS' });
          onClose();
        }
      },
      {
        label: 'Fit to screen',
        shortcut: `${MOD}+0`,
        onClick: () => {
          fitToView();
          onClose();
        }
      }
    ];

    return (
      <ContextMenu
        anchorEl={anchorEl}
        onClose={onClose}
        position={position}
        menuItems={canvasItems}
      />
    );
  }

  const target = contextMenu.item;

  if (!target) return null;

  const isLocked = allHaveFlag('isLocked', true);
  const isHidden = allHaveFlag('isVisible', false);

  const entityItems: MenuItemI[] = [
    ...(isNode(target)
      ? [
          {
            label: 'Rename',
            shortcut: 'F2',
            onClick: () => {
              uiStateActions.setItemControls({ type: 'ITEM', id: target.id });
              uiStateActions.setRenamingItemId(target.id);
              onClose();
            }
          },
          {
            label: 'Duplicate',
            shortcut: `${MOD}+D`,
            onClick: () => {
              const newId = duplicateNode(target.id);

              if (newId) {
                uiStateActions.setItemControls({ type: 'ITEM', id: newId });
              }
              onClose();
            }
          },
          {
            label: 'Copy',
            shortcut: `${MOD}+C`,
            onClick: () => {
              copyNode(target.id);
              onClose();
            }
          }
        ]
      : []),
    {
      label: 'Edit',
      dividerBefore: isNode(target),
      onClick: () => {
        uiStateActions.setItemControls(target);
        onClose();
      }
    },
    {
      label: isLocked ? 'Unlock' : 'Lock',
      shortcut: `${MOD}+⇧+L`,
      onClick: () => {
        uiStateActions.setSelection([{ kind: target.type, id: target.id }]);
        setFlags({ isLocked: !isLocked });
        onClose();
      }
    },
    {
      label: isHidden ? 'Show' : 'Hide',
      shortcut: `${MOD}+⇧+H`,
      onClick: () => {
        uiStateActions.setSelection([{ kind: target.type, id: target.id }]);
        setFlags({ isVisible: isHidden });
        onClose();
      }
    },
    {
      label: 'Delete',
      shortcut: 'Del',
      dividerBefore: true,
      onClick: () => {
        deleteEntities([target]);
        uiStateActions.setItemControls(null);
        onClose();
      }
    },
    // Only rectangles have a stacking order to change.
    ...(target.type === 'RECTANGLE'
      ? [
          {
            label: 'Bring forward',
            shortcut: `${MOD}+]`,
            dividerBefore: true,
            onClick: () => {
              scene.changeLayerOrder('BRING_FORWARD', target);
              onClose();
            }
          },
          {
            label: 'Bring to front',
            shortcut: `${MOD}+⇧+]`,
            onClick: () => {
              scene.changeLayerOrder('BRING_TO_FRONT', target);
              onClose();
            }
          },
          {
            label: 'Send backward',
            shortcut: `${MOD}+[`,
            onClick: () => {
              scene.changeLayerOrder('SEND_BACKWARD', target);
              onClose();
            }
          },
          {
            label: 'Send to back',
            shortcut: `${MOD}+⇧+[`,
            onClick: () => {
              scene.changeLayerOrder('SEND_TO_BACK', target);
              onClose();
            }
          }
        ]
      : [])
  ];

  return (
    <ContextMenu
      anchorEl={anchorEl}
      onClose={onClose}
      position={position}
      menuItems={entityItems}
    />
  );
};
