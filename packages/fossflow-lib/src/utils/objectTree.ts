import type { View, ItemReferenceType } from 'src/types';
import { BASE_LAYER_ID } from 'src/schemas/views';
import {
  isLayerVisible,
  isLayerLocked,
  getEffectiveLayerId,
  type ViewVisibility,
  type OrganizedEntity
} from './layers';

export type TreeRowKind = 'LAYER' | 'GROUP' | ItemReferenceType;

export interface TreeRow {
  /** Unique across kinds — ids are only unique within their own collection. */
  key: string;
  kind: TreeRowKind;
  id: string;
  name: string;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  /** The row's own flags, which is what its eye/lock buttons toggle. */
  isVisible: boolean;
  isLocked: boolean;
  /** Cascaded from ancestors — drives the dimmed/inherited styling. */
  isEffectivelyHidden: boolean;
  isEffectivelyLocked: boolean;
  /** Entities beneath a layer or group, transitively. Zero for entity rows. */
  descendantCount: number;
  /** Whether this row can be selected as a member for grouping. */
  isEntity: boolean;
}

interface BuildParams {
  view: View;
  visibility: ViewVisibility;
  /** viewItem id → display name, resolved from the model. */
  itemNames: Map<string, string>;
}

const entityName = (
  kind: ItemReferenceType,
  entity: any,
  itemNames: Map<string, string>
): string => {
  switch (kind) {
    case 'ITEM':
      return itemNames.get(entity.id) || 'Untitled node';
    case 'TEXTBOX':
      return (entity.content || '').trim() || 'Text';
    case 'CONNECTOR':
      return (entity.description || '').trim() || 'Connector';
    default:
      return 'Rectangle';
  }
};

/**
 * Flattens the layer tree, the group tree and the entities into the single
 * ordered row list the object tree panel renders. Collapsed containers
 * contribute their row but none of their children, so the returned length is
 * exactly what is scrollable — which is what the virtual list windows over.
 *
 * Ordering under a container is folders, then groups, then loose entities.
 *
 * Both parent chains come from user-supplied JSON and may contain cycles or
 * dangling ids. Emission is guarded by a visited set, and anything the walk
 * never reached is swept in at the end as a root: a corrupt parentId must
 * make a layer look misplaced, never make it disappear from the panel.
 */
export const buildTreeRows = ({
  view,
  visibility,
  itemNames
}: BuildParams): TreeRow[] => {
  const layers = view.layers ?? [];
  const groups = view.groups ?? [];
  const rows: TreeRow[] = [];
  const emitted = new Set<string>();

  const entityBuckets: { kind: ItemReferenceType; entities: any[] }[] = [
    { kind: 'ITEM', entities: view.items },
    { kind: 'RECTANGLE', entities: view.rectangles ?? [] },
    { kind: 'TEXTBOX', entities: view.textBoxes ?? [] },
    { kind: 'CONNECTOR', entities: view.connectors ?? [] }
  ];

  // Entities indexed by their container, so emission is a lookup rather than
  // a full scan per layer and per group.
  const byLayer = new Map<string, { kind: ItemReferenceType; entity: any }[]>();
  const byGroup = new Map<string, { kind: ItemReferenceType; entity: any }[]>();

  entityBuckets.forEach(({ kind, entities }) => {
    entities.forEach((entity) => {
      const record = { kind, entity };

      if (entity.groupId !== undefined) {
        const bucket = byGroup.get(entity.groupId) ?? [];
        bucket.push(record);
        byGroup.set(entity.groupId, bucket);
        return;
      }

      const layerId = getEffectiveLayerId(entity);
      const bucket = byLayer.get(layerId) ?? [];
      bucket.push(record);
      byLayer.set(layerId, bucket);
    });
  });

  const childLayers = (parentId: string | undefined) => {
    return layers.filter((layer) => {
      return layer.parentId === parentId;
    });
  };

  const childGroups = (parentId: string | undefined, layerId?: string) => {
    return groups.filter((group) => {
      if (group.parentId !== parentId) return false;
      if (layerId === undefined) return true;

      return getEffectiveLayerId(group) === layerId;
    });
  };

  const countEntitiesUnderGroup = (groupId: string, seen: Set<string>): number => {
    if (seen.has(groupId)) return 0;
    seen.add(groupId);

    const own = (byGroup.get(groupId) ?? []).length;

    return childGroups(groupId).reduce((total, group) => {
      return total + countEntitiesUnderGroup(group.id, seen);
    }, own);
  };

  const countEntitiesUnderLayer = (layerId: string, seen: Set<string>): number => {
    if (seen.has(layerId)) return 0;
    seen.add(layerId);

    const own = (byLayer.get(layerId) ?? []).length;
    const inGroups = childGroups(undefined, layerId).reduce((total, group) => {
      return total + countEntitiesUnderGroup(group.id, new Set());
    }, 0);

    return childLayers(layerId).reduce((total, layer) => {
      return total + countEntitiesUnderLayer(layer.id, seen);
    }, own + inGroups);
  };

  const emitEntities = (
    records: { kind: ItemReferenceType; entity: any }[],
    depth: number,
    parentHidden: boolean,
    parentLocked: boolean
  ) => {
    records.forEach(({ kind, entity }) => {
      const organized = entity as OrganizedEntity;

      rows.push({
        key: `${kind}:${entity.id}`,
        kind,
        id: entity.id,
        name: entityName(kind, entity, itemNames),
        depth,
        hasChildren: false,
        isExpanded: false,
        isVisible: organized.isVisible !== false,
        isLocked: organized.isLocked === true,
        isEffectivelyHidden: parentHidden || organized.isVisible === false,
        isEffectivelyLocked: parentLocked || organized.isLocked === true,
        descendantCount: 0,
        isEntity: true
      });
    });
  };

  const emitGroup = (
    group: (typeof groups)[number],
    depth: number,
    parentHidden: boolean,
    parentLocked: boolean
  ) => {
    if (emitted.has(`GROUP:${group.id}`)) return;
    emitted.add(`GROUP:${group.id}`);

    const kids = childGroups(group.id);
    const members = byGroup.get(group.id) ?? [];
    const hidden = parentHidden || !isLayerVisible(group);
    const locked = parentLocked || isLayerLocked(group);
    const isExpanded = group.isCollapsed !== true;

    rows.push({
      key: `GROUP:${group.id}`,
      kind: 'GROUP',
      id: group.id,
      name: group.name,
      depth,
      hasChildren: kids.length > 0 || members.length > 0,
      isExpanded,
      isVisible: isLayerVisible(group),
      isLocked: isLayerLocked(group),
      isEffectivelyHidden: hidden,
      isEffectivelyLocked: locked,
      descendantCount: countEntitiesUnderGroup(group.id, new Set()),
      isEntity: false
    });

    if (!isExpanded) return;

    kids.forEach((child) => {
      emitGroup(child, depth + 1, hidden, locked);
    });
    emitEntities(members, depth + 1, hidden, locked);
  };

  const emitLayer = (
    layer: { id: string; name: string; isVisible?: boolean; isLocked?: boolean; isCollapsed?: boolean },
    depth: number,
    parentHidden: boolean,
    parentLocked: boolean
  ) => {
    if (emitted.has(`LAYER:${layer.id}`)) return;
    emitted.add(`LAYER:${layer.id}`);

    const folders = childLayers(layer.id);
    const rootGroups = childGroups(undefined, layer.id);
    const loose = byLayer.get(layer.id) ?? [];
    const hidden = parentHidden || !isLayerVisible(layer);
    const locked = parentLocked || isLayerLocked(layer);
    const isExpanded = layer.isCollapsed !== true;

    rows.push({
      key: `LAYER:${layer.id}`,
      kind: 'LAYER',
      id: layer.id,
      name: layer.name,
      depth,
      hasChildren:
        folders.length > 0 || rootGroups.length > 0 || loose.length > 0,
      isExpanded,
      isVisible: isLayerVisible(layer),
      isLocked: isLayerLocked(layer),
      isEffectivelyHidden: hidden,
      isEffectivelyLocked: locked,
      descendantCount: countEntitiesUnderLayer(layer.id, new Set()),
      isEntity: false
    });

    if (!isExpanded) return;

    folders.forEach((child) => {
      emitLayer(child, depth + 1, hidden, locked);
    });
    rootGroups.forEach((group) => {
      emitGroup(group, depth + 1, hidden, locked);
    });
    emitEntities(loose, depth + 1, hidden, locked);
  };

  // The base layer's record exists only once its visibility or lock has been
  // toggled, so synthesize the row from whatever is (or isn't) there.
  const baseRecord = layers.find((layer) => {
    return layer.id === BASE_LAYER_ID;
  });

  emitLayer(
    { name: 'Base', ...baseRecord, id: BASE_LAYER_ID },
    0,
    false,
    false
  );

  layers.forEach((layer) => {
    if (layer.id === BASE_LAYER_ID || layer.parentId !== undefined) return;

    emitLayer(layer, 0, false, false);
  });

  // Sweep: anything a dangling or cyclic parentId kept out of the walk above
  // is shown at the root rather than silently dropped.
  layers.forEach((layer) => {
    if (layer.id === BASE_LAYER_ID) return;

    emitLayer(layer, 0, false, false);
  });
  groups.forEach((group) => {
    emitGroup(group, 0, false, false);
  });

  return rows;
};

/**
 * The rows a container owns, for shift-click range selection and for
 * "select everything in here" actions.
 */
export const rowsInRange = (
  rows: TreeRow[],
  fromKey: string,
  toKey: string
): TreeRow[] => {
  const a = rows.findIndex((row) => {
    return row.key === fromKey;
  });
  const b = rows.findIndex((row) => {
    return row.key === toKey;
  });

  if (a === -1 || b === -1) return [];

  return rows.slice(Math.min(a, b), Math.max(a, b) + 1);
};

export const isVisibilityInherited = (
  row: TreeRow,
  visibility: ViewVisibility
): boolean => {
  return row.isEffectivelyHidden && row.isVisible && visibility.hasHidden;
};
