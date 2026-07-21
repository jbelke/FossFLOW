import { produce } from 'immer';
import { Layer, ItemReference } from 'src/types';
import { getItemByIdOrThrow } from 'src/utils';
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

    layers.splice(index, 1);

    // Reassign the layer's entities to the base layer in the same produce, so
    // no dangling layerId ever exists (updateViewItem re-validates the view
    // and throws on dangling refs). Entities are never deleted with a layer.
    const strip = (entity: { layerId?: string }) => {
      if (entity.layerId === id) delete entity.layerId;
    };

    view.items.forEach(strip);
    (view.connectors ?? []).forEach(strip);
    (view.rectangles ?? []).forEach(strip);
    (view.textBoxes ?? []).forEach(strip);
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
