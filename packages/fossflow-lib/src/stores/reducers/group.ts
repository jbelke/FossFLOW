import { produce } from 'immer';
import type { Draft } from 'immer';
import { Group, ItemReference, View } from 'src/types';
import { getItemByIdOrThrow, wouldCreateCycle, collectSubtree } from 'src/utils';
import { BASE_LAYER_ID } from 'src/schemas/views';
import { State, ViewReducerContext } from './types';

interface Organized {
  id: string;
  layerId?: string;
  groupId?: string;
}

/**
 * Base-layer and ungrouped membership are canonically "no key at all", so
 * clearing means deleting rather than writing undefined — that is what keeps
 * a document that never used layers or groups byte-identical after a save.
 */
type MembershipField = 'layerId' | 'groupId' | 'parentId';

const setMembership = (
  entity: Partial<Record<MembershipField, string>>,
  field: MembershipField,
  value: string | undefined
) => {
  const target = entity;

  if (value === undefined || value === BASE_LAYER_ID) {
    delete target[field];
  } else {
    target[field] = value;
  }
};

const allEntities = (view: Draft<View>): Organized[] => {
  return [
    ...view.items,
    ...(view.connectors ?? []),
    ...(view.rectangles ?? []),
    ...(view.textBoxes ?? [])
  ];
};

const getGroupOrThrow = (view: Draft<View>, id: string) => {
  const group = (view.groups ?? []).find((candidate) => {
    return candidate.id === id;
  });

  if (!group) throw new Error(`Group "${id}" not found in view.`);

  return group;
};

/**
 * group.layerId is authoritative. Whenever it changes, push it down to every
 * descendant group and every member entity so a group never straddles two
 * layers — the invariant the object tree relies on to know where to draw a
 * group, and what a "hide this layer" toggle should sweep up.
 */
const applyGroupLayer = (view: Draft<View>, rootGroupId: string) => {
  const groups = view.groups ?? [];
  const root = groups.find((group) => {
    return group.id === rootGroupId;
  });

  if (!root) return;

  const subtree = collectSubtree(groups, rootGroupId);

  groups.forEach((group) => {
    if (subtree.has(group.id)) setMembership(group, 'layerId', root.layerId);
  });

  allEntities(view).forEach((entity) => {
    if (entity.groupId !== undefined && subtree.has(entity.groupId)) {
      setMembership(entity, 'layerId', root.layerId);
    }
  });
};

const collectionsOf = (view: Draft<View>) => {
  return {
    ITEM: view.items,
    CONNECTOR: view.connectors ?? [],
    RECTANGLE: view.rectangles ?? [],
    TEXTBOX: view.textBoxes ?? []
  } as Partial<Record<ItemReference['type'], Organized[]>>;
};

export const createGroup = (
  { group, items }: { group: Group; items: ItemReference[] },
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId).value;

    if (!view.groups) view.groups = [];

    const clash = view.groups.some((existing) => {
      return existing.id === group.id;
    });

    if (clash) throw new Error(`Group "${group.id}" already exists in view.`);

    view.groups.push(group);

    const collections = collectionsOf(view);

    items.forEach((ref) => {
      const collection = collections[ref.type];

      // References with no membership notion (eg. CONNECTOR_ANCHOR) skip.
      if (!collection) return;

      const entity = getItemByIdOrThrow(collection, ref.id).value;
      setMembership(entity, 'groupId', group.id);
    });

    applyGroupLayer(view, group.id);
  });
};

export const updateGroup = (
  { id, ...updates }: { id: string } & Partial<Group>,
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId).value;
    const group = getGroupOrThrow(view, id);

    // parentId moves are their own reducer precisely because they need a
    // cycle check; refuse to smuggle one through the generic update path.
    if ('parentId' in updates && updates.parentId !== group.parentId) {
      throw new Error('Use SET_GROUP_PARENT to reparent a group.');
    }

    Object.assign(group, updates);

    if ('layerId' in updates) applyGroupLayer(view, id);
  });
};

export const deleteGroup = (id: string, ctx: ViewReducerContext): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId).value;
    const groups = view.groups ?? [];
    const index = groups.findIndex((group) => {
      return group.id === id;
    });

    if (index === -1) throw new Error(`Group "${id}" not found in view.`);

    // Everything the group held moves up one level rather than being
    // destroyed: nested groups and member entities land in the parent group,
    // or become ungrouped when the deleted group was top-level. Entities are
    // never deleted along with a group.
    const { parentId } = groups[index];

    groups.forEach((group) => {
      if (group.parentId === id) setMembership(group, 'parentId', parentId);
    });

    allEntities(view).forEach((entity) => {
      if (entity.groupId === id) setMembership(entity, 'groupId', parentId);
    });

    groups.splice(index, 1);
  });
};

export const setGroupParent = (
  { id, parentId }: { id: string; parentId: string | null },
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId).value;
    const groups = view.groups ?? [];
    const group = getGroupOrThrow(view, id);
    const target = parentId ?? undefined;

    if (target !== undefined) {
      getGroupOrThrow(view, target);

      if (wouldCreateCycle(groups, id, target)) {
        throw new Error('A group cannot be moved inside its own subtree.');
      }
    }

    setMembership(group, 'parentId', target);

    // Joining a group means joining its layer.
    if (target !== undefined) {
      const parent = getGroupOrThrow(view, target);
      setMembership(group, 'layerId', parent.layerId);
    }

    applyGroupLayer(view, id);
  });
};

export const setItemsGroup = (
  {
    items,
    groupId
  }: {
    items: ItemReference[];
    groupId: string | null;
  },
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId).value;

    if (groupId !== null) getGroupOrThrow(view, groupId);

    const collections = collectionsOf(view);

    items.forEach((ref) => {
      const collection = collections[ref.type];

      if (!collection) return;

      const entity = getItemByIdOrThrow(collection, ref.id).value;
      setMembership(entity, 'groupId', groupId ?? undefined);
    });

    // Joining a group means joining its layer; leaving one leaves the entity
    // on whatever layer it was already on.
    if (groupId !== null) applyGroupLayer(view, groupId);
  });
};
