import { produce } from 'immer';
import { Layer, ItemReference } from 'src/types';
import { getItemByIdOrThrow, wouldCreateCycle } from 'src/utils';
import { BASE_LAYER_ID } from 'src/schemas/views';
import { LAYER_DEFAULTS } from 'src/config';
import { State, ViewReducerContext } from './types';

export const createLayer = (
  newLayer: Layer,
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId).value;

    if (!view.layers) view.layers = [];
    view.layers.push(newLayer);
  });
};

export const updateLayer = (
  { id, ...updates }: { id: string } & Partial<Layer>,
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId).value;

    if (!view.layers) view.layers = [];

    const existing = view.layers.find((layer) => {
      return layer.id === id;
    });

    if (existing) {
      Object.assign(existing, updates);
    } else if (id === BASE_LAYER_ID) {
      // The base layer record is created lazily the first time its
      // visibility or lock is toggled; until then it exists only implicitly.
      view.layers.push({ ...LAYER_DEFAULTS, name: 'Base', id, ...updates });
    } else {
      throw new Error(`Layer "${id}" not found in view.`);
    }
  });
};

export const deleteLayer = (id: string, ctx: ViewReducerContext): State => {
  if (id === BASE_LAYER_ID) {
    throw new Error('The base layer cannot be deleted.');
  }

  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId).value;
    const layers = view.layers ?? [];
    const index = layers.findIndex((layer) => {
      return layer.id === id;
    });

    if (index === -1) {
      throw new Error(`Layer "${id}" not found in view.`);
    }

    // Everything the layer held moves up one level: to the parent folder, or
    // to the base layer when the deleted layer was top-level. Doing it inside
    // the same produce means no dangling layerId or parentId ever exists
    // (updateViewItem re-validates the view and throws on dangling refs).
    // Entities are never deleted along with a layer.
    const { parentId } = layers[index];

    layers.splice(index, 1);

    const reassign = (entity: { layerId?: string }) => {
      if (entity.layerId !== id) return;

      if (parentId === undefined) {
        delete entity.layerId;
      } else {
        const target = entity;
        target.layerId = parentId;
      }
    };

    layers.forEach((layer) => {
      if (layer.parentId !== id) return;

      if (parentId === undefined) {
        delete layer.parentId;
      } else {
        const target = layer;
        target.parentId = parentId;
      }
    });

    view.items.forEach(reassign);
    (view.connectors ?? []).forEach(reassign);
    (view.rectangles ?? []).forEach(reassign);
    (view.textBoxes ?? []).forEach(reassign);
    (view.groups ?? []).forEach(reassign);
  });
};

/**
 * Moves a layer to a new parent and/or a new position among its siblings.
 *
 * Sibling order IS array order — layers[] is flat and nesting is by parentId,
 * so reordering means splicing the record to sit immediately before `beforeId`
 * (or last among its siblings when null). Doing both in one reducer keeps a
 * drag that reparents *and* repositions as a single undo step.
 */
export const moveLayer = (
  {
    id,
    parentId,
    beforeId
  }: { id: string; parentId: string | null; beforeId: string | null },
  ctx: ViewReducerContext
): State => {
  if (id === BASE_LAYER_ID) {
    throw new Error('The base layer cannot be moved.');
  }

  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId).value;
    const layers = view.layers ?? [];
    const index = layers.findIndex((layer) => {
      return layer.id === id;
    });

    if (index === -1) throw new Error(`Layer "${id}" not found in view.`);

    const target =
      parentId === null || parentId === BASE_LAYER_ID ? undefined : parentId;

    if (target !== undefined) {
      const exists = layers.some((layer) => {
        return layer.id === target;
      });

      if (!exists) throw new Error(`Layer "${target}" not found in view.`);

      if (wouldCreateCycle(layers, id, target)) {
        throw new Error('A layer cannot be moved inside its own subtree.');
      }
    }

    const [record] = layers.splice(index, 1);

    if (target === undefined) {
      delete record.parentId;
    } else {
      record.parentId = target;
    }

    const insertAt =
      beforeId === null
        ? layers.length
        : layers.findIndex((layer) => {
            return layer.id === beforeId;
          });

    layers.splice(insertAt === -1 ? layers.length : insertAt, 0, record);
  });
};

export const setLayerParent = (
  { id, parentId }: { id: string; parentId: string | null },
  ctx: ViewReducerContext
): State => {
  if (id === BASE_LAYER_ID) {
    throw new Error('The base layer cannot be nested.');
  }

  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId).value;
    const layers = view.layers ?? [];
    const layer = layers.find((candidate) => {
      return candidate.id === id;
    });

    if (!layer) throw new Error(`Layer "${id}" not found in view.`);

    const target =
      parentId === null || parentId === BASE_LAYER_ID ? undefined : parentId;

    if (target !== undefined) {
      const exists = layers.some((candidate) => {
        return candidate.id === target;
      });

      if (!exists) throw new Error(`Layer "${target}" not found in view.`);

      if (wouldCreateCycle(layers, id, target)) {
        throw new Error('A layer cannot be moved inside its own subtree.');
      }
    }

    if (target === undefined) {
      delete layer.parentId;
    } else {
      layer.parentId = target;
    }
  });
};

export const setItemsLayer = (
  {
    items,
    layerId
  }: {
    items: ItemReference[];
    layerId: string | null;
  },
  ctx: ViewReducerContext
): State => {
  return produce(ctx.state, (draft) => {
    const view = getItemByIdOrThrow(draft.model.views, ctx.viewId).value;

    // Base-layer membership is canonically "no layerId": assigning to base
    // deletes the key, so untouched documents keep their pre-layers shape.
    const targetLayerId =
      layerId === null || layerId === BASE_LAYER_ID ? undefined : layerId;

    if (targetLayerId) {
      const exists = (view.layers ?? []).some((layer) => {
        return layer.id === targetLayerId;
      });

      if (!exists) {
        throw new Error(`Layer "${targetLayerId}" not found in view.`);
      }
    }

    const collections: Partial<
      Record<ItemReference['type'], { id: string; layerId?: string }[]>
    > = {
      ITEM: view.items,
      CONNECTOR: view.connectors ?? [],
      RECTANGLE: view.rectangles ?? [],
      TEXTBOX: view.textBoxes ?? []
    };

    items.forEach((ref) => {
      const collection = collections[ref.type];

      // References without a layer notion (eg. CONNECTOR_ANCHOR) are skipped.
      if (!collection) return;

      const entity = getItemByIdOrThrow(collection, ref.id).value;

      if (targetLayerId) {
        entity.layerId = targetLayerId;
      } else {
        delete entity.layerId;
      }
    });
  });
};
