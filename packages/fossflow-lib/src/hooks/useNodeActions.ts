import { useCallback } from 'react';
import { Coords, ModelItem, ViewItem, NodeClipboardEntry } from 'src/types';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { generateId, getItemById, findNearestUnoccupiedTile } from 'src/utils';
import { VIEW_ITEM_DEFAULTS } from 'src/config';
import { useScene } from './useScene';

interface NodeParts {
  modelItem: ModelItem;
  viewItem: ViewItem;
}

/**
 * Splits a node into the identity-free data needed to recreate it elsewhere.
 * Fields are copied explicitly so a new schema field has to be considered
 * here rather than silently carried over (or silently dropped).
 */
const detachNode = (parts: NodeParts): NodeClipboardEntry => {
  return {
    modelItem: {
      name: parts.modelItem.name,
      description: parts.modelItem.description,
      icon: parts.modelItem.icon
    },
    viewItem: {
      labelHeight: parts.viewItem.labelHeight
    }
  };
};

/**
 * Actions that operate on a single existing node, shared by the keyboard
 * shortcuts, the context menu and the node settings panel.
 *
 * Every action that touches more than one store is wrapped in a scene
 * transaction so it costs exactly one undo step.
 */
export const useNodeActions = () => {
  const scene = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const views = useModelStore((state) => {
    return state.views;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const clipboard = useUiStateStore((state) => {
    return state.clipboard;
  });

  const getNodeParts = useCallback(
    (id: string): NodeParts | null => {
      const modelItem = getItemById(modelItems, id);
      const viewItem = getItemById(scene.items, id);

      if (!modelItem || !viewItem) return null;

      return { modelItem: modelItem.value, viewItem: viewItem.value };
    },
    [modelItems, scene.items]
  );

  /**
   * Places a node at (or near) a tile. Returns the new node's id, or null if
   * no free tile was found within the search radius.
   */
  const placeNodeNear = useCallback(
    (
      tile: Coords,
      modelItem: Omit<ModelItem, 'id'>,
      viewItem: Omit<ViewItem, 'id' | 'tile'>
    ): string | null => {
      const targetTile = findNearestUnoccupiedTile(tile, scene);

      if (!targetTile) return null;

      const id = generateId();

      scene.placeIcon({
        modelItem: { ...modelItem, id },
        viewItem: { ...VIEW_ITEM_DEFAULTS, ...viewItem, id, tile: targetTile }
      });

      return id;
    },
    [scene]
  );

  const createNode = useCallback(
    (tile: Coords, icon?: string) => {
      return placeNodeNear(tile, { name: 'Untitled', icon }, {});
    },
    [placeNodeNear]
  );

  const duplicateNode = useCallback(
    (id: string): string | null => {
      const parts = getNodeParts(id);

      if (!parts) return null;

      const detached = detachNode(parts);

      return placeNodeNear(
        parts.viewItem.tile,
        detached.modelItem,
        detached.viewItem
      );
    },
    [getNodeParts, placeNodeNear]
  );

  /**
   * Removes the node from the current view, and drops the underlying model
   * item only once no other view still references it. A model item can be
   * shared across views, so an unconditional delete would leave dangling
   * view item references elsewhere.
   */
  const deleteNode = useCallback(
    (id: string) => {
      scene.transaction(() => {
        scene.deleteViewItem(id);

        const isReferencedElsewhere = views.some((view) => {
          if (view.id === scene.currentView.id) return false;

          return (view.items ?? []).some((item) => {
            return item.id === id;
          });
        });

        if (!isReferencedElsewhere) {
          scene.deleteModelItem(id);
        }
      });

      uiStateActions.setItemControls(null);
      uiStateActions.setRenamingItemId(null);
    },
    [scene, views, uiStateActions]
  );

  const renameNode = useCallback(
    (id: string, name: string) => {
      scene.updateModelItem(id, { name });
    },
    [scene]
  );

  const nudgeNode = useCallback(
    (id: string, delta: Coords) => {
      const parts = getNodeParts(id);

      if (!parts) return;

      scene.updateViewItem(id, {
        tile: {
          x: parts.viewItem.tile.x + delta.x,
          y: parts.viewItem.tile.y + delta.y
        }
      });
    },
    [getNodeParts, scene]
  );

  const copyNode = useCallback(
    (id: string) => {
      const parts = getNodeParts(id);

      if (!parts) return;

      uiStateActions.setClipboard(detachNode(parts));
    },
    [getNodeParts, uiStateActions]
  );

  const cutNode = useCallback(
    (id: string) => {
      copyNode(id);
      deleteNode(id);
    },
    [copyNode, deleteNode]
  );

  const pasteNode = useCallback(
    (tile: Coords): string | null => {
      if (!clipboard) return null;

      return placeNodeNear(tile, clipboard.modelItem, clipboard.viewItem);
    },
    [clipboard, placeNodeNear]
  );

  return {
    createNode,
    duplicateNode,
    deleteNode,
    renameNode,
    nudgeNode,
    copyNode,
    cutNode,
    pasteNode,
    hasClipboard: clipboard !== null
  };
};
