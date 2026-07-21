import type { View } from 'src/types';
import { BASE_LAYER_ID } from 'src/schemas/views';

export interface ViewVisibility {
  hiddenLayerIds: Set<string>;
  lockedLayerIds: Set<string>;
  hiddenConnectorIds: Set<string>;
}

// Entities with no layerId belong to the implicit base layer.
export const getEffectiveLayerId = (entity: { layerId?: string }): string => {
  return entity.layerId ?? BASE_LAYER_ID;
};

// A layer record with isVisible/isLocked undefined is visible and unlocked
// (defaults live here, not in zod — the loader discards the parse output).
export const isLayerVisible = (layer: {
  isVisible?: boolean | undefined;
}): boolean => {
  return layer.isVisible !== false;
};

export const isLayerLocked = (layer: {
  isLocked?: boolean | undefined;
}): boolean => {
  return layer.isLocked === true;
};

/**
 * Derives, purely from the view, which layers are hidden/locked and which
 * connectors are hidden. A connector hides when its own layer is hidden, when
 * any anchored view item's layer is hidden (no dangling lines), or — one
 * extra pass — when it anchors onto an anchor of a connector hidden by the
 * previous rules. Longer anchor→anchor chains are not chased.
 *
 * Visibility is derived state only: nothing here touches connector paths or
 * the scene store, so toggling a layer never re-runs pathfinding.
 */
export const computeVisibility = (view: View): ViewVisibility => {
  const hiddenLayerIds = new Set<string>();
  const lockedLayerIds = new Set<string>();
  const hiddenConnectorIds = new Set<string>();

  (view.layers ?? []).forEach((layer) => {
    if (!isLayerVisible(layer)) hiddenLayerIds.add(layer.id);
    if (isLayerLocked(layer)) lockedLayerIds.add(layer.id);
  });

  if (hiddenLayerIds.size === 0) {
    return { hiddenLayerIds, lockedLayerIds, hiddenConnectorIds };
  }

  const hiddenItemIds = new Set<string>();

  view.items.forEach((viewItem) => {
    if (hiddenLayerIds.has(getEffectiveLayerId(viewItem))) {
      hiddenItemIds.add(viewItem.id);
    }
  });

  const connectors = view.connectors ?? [];

  connectors.forEach((connector) => {
    if (hiddenLayerIds.has(getEffectiveLayerId(connector))) {
      hiddenConnectorIds.add(connector.id);
      return;
    }

    const anchoredToHiddenItem = connector.anchors.some((anchor) => {
      return anchor.ref.item !== undefined && hiddenItemIds.has(anchor.ref.item);
    });

    if (anchoredToHiddenItem) {
      hiddenConnectorIds.add(connector.id);
    }
  });

  const anchorOwner = new Map<string, string>();

  connectors.forEach((connector) => {
    connector.anchors.forEach((anchor) => {
      anchorOwner.set(anchor.id, connector.id);
    });
  });

  connectors.forEach((connector) => {
    if (hiddenConnectorIds.has(connector.id)) return;

    const anchoredToHiddenConnector = connector.anchors.some((anchor) => {
      if (!anchor.ref.anchor) return false;

      const ownerId = anchorOwner.get(anchor.ref.anchor);
      return ownerId !== undefined && hiddenConnectorIds.has(ownerId);
    });

    if (anchoredToHiddenConnector) {
      hiddenConnectorIds.add(connector.id);
    }
  });

  return { hiddenLayerIds, lockedLayerIds, hiddenConnectorIds };
};

/**
 * Resolves the uiState activeLayerId into a layerId to stamp onto a new
 * entity. Returns undefined for the base layer or when the layer no longer
 * exists (uiState is outside undo history, so the active layer can have been
 * removed by an undo).
 */
export const resolveLayerId = (
  view: View,
  activeLayerId: string | null
): string | undefined => {
  if (!activeLayerId || activeLayerId === BASE_LAYER_ID) return undefined;

  const exists = (view.layers ?? []).some((layer) => {
    return layer.id === activeLayerId;
  });

  return exists ? activeLayerId : undefined;
};
