import type { View } from 'src/types';
import { BASE_LAYER_ID } from 'src/schemas/views';

export interface ViewVisibility {
  // All four sets are *cascaded*: a layer nested inside a hidden folder is in
  // hiddenLayerIds even if its own isVisible is true.
  hiddenLayerIds: Set<string>;
  lockedLayerIds: Set<string>;
  hiddenGroupIds: Set<string>;
  lockedGroupIds: Set<string>;
  hiddenConnectorIds: Set<string>;
  // Cheap short-circuits so callers can hand back the same array reference
  // when the view hides/locks nothing at all — see useScene's visible*
  // selectors, which rely on referential stability to avoid re-renders.
  hasHidden: boolean;
  hasLocked: boolean;
}

/** Membership fields shared by items, connectors, rectangles and text boxes. */
export interface OrganizedEntity {
  layerId?: string;
  groupId?: string;
  isVisible?: boolean;
  isLocked?: boolean;
}

interface TreeNode {
  id: string;
  parentId?: string;
}

// Entities with no layerId belong to the implicit base layer.
export const getEffectiveLayerId = (entity: { layerId?: string }): string => {
  return entity.layerId ?? BASE_LAYER_ID;
};

// A record with isVisible/isLocked undefined is visible and unlocked (defaults
// live here, not in zod — the loader discards the parse output). Applies to
// layers, groups and entities alike, all of which share the two fields.
export const isLayerVisible = (record: {
  isVisible?: boolean | undefined;
}): boolean => {
  return record.isVisible !== false;
};

export const isLayerLocked = (record: {
  isLocked?: boolean | undefined;
}): boolean => {
  return record.isLocked === true;
};

/**
 * Collects every node whose flag is set on itself or on any ancestor along its
 * parentId chain.
 *
 * parentId arrives from user-supplied document JSON, so the chain cannot be
 * assumed acyclic — a hand-edited file can contain a self-parent or an A→B→A
 * loop. Re-entering a node that is already on the current path stops the walk
 * and contributes only that node's own flag, which terminates and gives the
 * sane answer for a cycle: every node in the loop inherits the flag if any
 * member of the loop sets it. A dangling parentId simply contributes nothing.
 */
const resolveInherited = <T extends TreeNode>(
  nodes: T[],
  isSet: (node: T) => boolean
): Set<string> => {
  const result = new Set<string>();

  if (nodes.length === 0) return result;

  const byId = new Map<string, T>();

  nodes.forEach((node) => {
    byId.set(node.id, node);
  });

  const memo = new Map<string, boolean>();

  const resolve = (node: T, onPath: Set<string>): boolean => {
    const cached = memo.get(node.id);

    if (cached !== undefined) return cached;
    if (onPath.has(node.id)) return isSet(node);

    onPath.add(node.id);

    const parent =
      node.parentId !== undefined ? byId.get(node.parentId) : undefined;
    const value = isSet(node) || (parent ? resolve(parent, onPath) : false);

    onPath.delete(node.id);
    memo.set(node.id, value);

    return value;
  };

  nodes.forEach((node) => {
    if (resolve(node, new Set())) result.add(node.id);
  });

  return result;
};

/** An entity is hidden by its own flag, by its layer, or by its group. */
export const isEntityHidden = (
  entity: OrganizedEntity,
  visibility: Pick<ViewVisibility, 'hiddenLayerIds' | 'hiddenGroupIds'>
): boolean => {
  if (entity.isVisible === false) return true;
  if (visibility.hiddenLayerIds.has(getEffectiveLayerId(entity))) return true;

  return (
    entity.groupId !== undefined && visibility.hiddenGroupIds.has(entity.groupId)
  );
};

/** Same inheritance as isEntityHidden, for the lock flag. */
export const isEntityLocked = (
  entity: OrganizedEntity,
  visibility: Pick<ViewVisibility, 'lockedLayerIds' | 'lockedGroupIds'>
): boolean => {
  if (entity.isLocked === true) return true;
  if (visibility.lockedLayerIds.has(getEffectiveLayerId(entity))) return true;

  return (
    entity.groupId !== undefined && visibility.lockedGroupIds.has(entity.groupId)
  );
};

/**
 * Derives, purely from the view, which layers and groups are hidden/locked and
 * which connectors are hidden. Both trees cascade: a group inside a hidden
 * layer is hidden, a layer inside a hidden folder is hidden.
 *
 * A connector hides when it is hidden in its own right, when any anchored view
 * item is hidden (no dangling lines), or — one extra pass — when it anchors
 * onto an anchor of a connector hidden by the previous rules. Longer
 * anchor→anchor chains are not chased.
 *
 * Visibility is derived state only: nothing here touches connector paths or
 * the scene store, so toggling a layer never re-runs pathfinding.
 */
export const computeVisibility = (view: View): ViewVisibility => {
  const layers = view.layers ?? [];
  const groups = view.groups ?? [];

  const hiddenLayerIds = resolveInherited(layers, (layer) => {
    return !isLayerVisible(layer);
  });
  const lockedLayerIds = resolveInherited(layers, (layer) => {
    return isLayerLocked(layer);
  });

  // A group inherits from its parent group *and* from the layer it sits on,
  // so folding the layer check into the predicate makes it cascade correctly
  // through nested groups too.
  const hiddenGroupIds = resolveInherited(groups, (group) => {
    return (
      !isLayerVisible(group) ||
      hiddenLayerIds.has(getEffectiveLayerId(group))
    );
  });
  const lockedGroupIds = resolveInherited(groups, (group) => {
    return (
      isLayerLocked(group) || lockedLayerIds.has(getEffectiveLayerId(group))
    );
  });

  const hiddenConnectorIds = new Set<string>();
  const connectors = view.connectors ?? [];

  const anyOwnFlag = (
    pick: (entity: OrganizedEntity) => boolean | undefined,
    match: boolean
  ) => {
    const has = (entities: OrganizedEntity[]) => {
      return entities.some((entity) => {
        return pick(entity) === match;
      });
    };

    return (
      has(view.items) ||
      has(connectors) ||
      has(view.rectangles ?? []) ||
      has(view.textBoxes ?? [])
    );
  };

  const hasHidden =
    hiddenLayerIds.size > 0 ||
    hiddenGroupIds.size > 0 ||
    anyOwnFlag((entity) => {
      return entity.isVisible;
    }, false);

  const hasLocked =
    lockedLayerIds.size > 0 ||
    lockedGroupIds.size > 0 ||
    anyOwnFlag((entity) => {
      return entity.isLocked;
    }, true);

  const result: ViewVisibility = {
    hiddenLayerIds,
    lockedLayerIds,
    hiddenGroupIds,
    lockedGroupIds,
    hiddenConnectorIds,
    hasHidden,
    hasLocked
  };

  if (!hasHidden) return result;

  const hiddenItemIds = new Set<string>();

  view.items.forEach((viewItem) => {
    if (isEntityHidden(viewItem, result)) hiddenItemIds.add(viewItem.id);
  });

  connectors.forEach((connector) => {
    if (isEntityHidden(connector, result)) {
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

  return result;
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
