import React, { useCallback } from 'react';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { getTilePosition, CoordsUtils, generateId } from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { useNodeActions } from 'src/hooks/useNodeActions';
import { useModelStore } from 'src/stores/modelStore';
import { ContextMenu } from './ContextMenu';

interface Props {
  anchorEl?: HTMLElement;
}

export const ContextMenuManager = ({ anchorEl }: Props) => {
  const scene = useScene();
  const {
    createNode,
    duplicateNode,
    deleteNode,
    copyNode,
    pasteNode,
    hasClipboard
  } = useNodeActions();
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

  if (!contextMenu) {
    return null;
  }

  if (contextMenu.type === 'EMPTY') {
    return (
      <ContextMenu
        anchorEl={anchorEl}
        onClose={onClose}
        position={CoordsUtils.multiply(
          getTilePosition({ tile: contextMenu.tile }),
          zoom
        )}
        menuItems={[
          {
            label: 'Add Node',
            onClick: () => {
              if (model.icons.length > 0) {
                const newId = createNode(contextMenu.tile, model.icons[0].id);

                // Drop straight into renaming so the node can be named
                // without a trip to the settings panel.
                if (newId) {
                  uiStateActions.setItemControls({ type: 'ITEM', id: newId });
                  uiStateActions.setRenamingItemId(newId);
                }
              }
              onClose();
            }
          },
          ...(hasClipboard
            ? [
                {
                  label: 'Paste',
                  onClick: () => {
                    const pastedId = pasteNode(contextMenu.tile);
                    if (pastedId) {
                      uiStateActions.setItemControls({
                        type: 'ITEM',
                        id: pastedId
                      });
                    }
                    onClose();
                  }
                }
              ]
            : []),
          {
            label: 'Add Rectangle',
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
          }
        ]}
      />
    );
  }

  if (contextMenu.type === 'ITEM' && contextMenu.item) {
    return (
      <ContextMenu
        anchorEl={anchorEl}
        onClose={onClose}
        position={CoordsUtils.multiply(
          getTilePosition({ tile: contextMenu.tile }),
          zoom
        )}
        menuItems={[
          {
            label: 'Rename',
            onClick: () => {
              uiStateActions.setItemControls({
                type: 'ITEM',
                id: contextMenu.item!.id
              });
              uiStateActions.setRenamingItemId(contextMenu.item!.id);
              onClose();
            }
          },
          {
            label: 'Duplicate',
            onClick: () => {
              const newId = duplicateNode(contextMenu.item!.id);
              if (newId) {
                uiStateActions.setItemControls({ type: 'ITEM', id: newId });
              }
              onClose();
            }
          },
          {
            label: 'Copy',
            onClick: () => {
              copyNode(contextMenu.item!.id);
              onClose();
            }
          },
          {
            label: 'Delete',
            onClick: () => {
              deleteNode(contextMenu.item!.id);
              onClose();
            }
          },
          {
            label: 'Send backward',
            onClick: () => {
              scene.changeLayerOrder('SEND_BACKWARD', contextMenu.item!);
              onClose();
            }
          },
          {
            label: 'Bring forward',
            onClick: () => {
              scene.changeLayerOrder('BRING_FORWARD', contextMenu.item!);
              onClose();
            }
          },
          {
            label: 'Send to back',
            onClick: () => {
              scene.changeLayerOrder('SEND_TO_BACK', contextMenu.item!);
              onClose();
            }
          },
          {
            label: 'Bring to front',
            onClick: () => {
              scene.changeLayerOrder('BRING_TO_FRONT', contextMenu.item!);
              onClose();
            }
          }
        ]}
      />
    );
  }

  return null;
};
