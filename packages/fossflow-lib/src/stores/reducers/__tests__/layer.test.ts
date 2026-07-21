import { produce } from 'immer';
import { model as modelFixture } from 'src/fixtures/model';
import { BASE_LAYER_ID } from 'src/schemas/views';
import * as reducers from 'src/stores/reducers';

const getModel = () => {
  return produce(modelFixture, (draft) => {
    draft.views[0].layers = [
      { id: 'layer1', name: 'Layer 1' },
      { id: 'layer2', name: 'Layer 2', isVisible: false, isLocked: true }
    ];
    draft.views[0].items[0].layerId = 'layer1';
    draft.views[0].connectors![0].layerId = 'layer1';
    draft.views[0].rectangles![0].layerId = 'layer1';
    draft.views[0].textBoxes = [
      { id: 'textbox1', tile: { x: 1, y: 1 }, content: 'Text', layerId: 'layer1' }
    ];
  });
};

const scene = {
  connectors: {},
  textBoxes: {}
};

describe('layer reducers', () => {
  test('CREATE_LAYER appends a layer and bumps lastUpdated', () => {
    const model = getModel();

    const result = reducers.view({
      action: 'CREATE_LAYER',
      payload: { id: 'layer3', name: 'Layer 3' },
      ctx: { viewId: 'view1', state: { model, scene } }
    });

    expect(result.model.views[0].layers).toHaveLength(3);
    expect(result.model.views[0].layers?.[2]).toEqual({
      id: 'layer3',
      name: 'Layer 3'
    });
    expect(result.model.views[0].lastUpdated).toBeDefined();
  });

  test('CREATE_LAYER initialises the layers array when absent', () => {
    const result = reducers.view({
      action: 'CREATE_LAYER',
      payload: { id: 'layer1', name: 'Layer 1' },
      ctx: { viewId: 'view1', state: { model: modelFixture, scene } }
    });

    expect(result.model.views[0].layers).toEqual([
      { id: 'layer1', name: 'Layer 1' }
    ]);
  });

  test('UPDATE_LAYER renames and toggles visibility/lock', () => {
    const model = getModel();

    const result = reducers.view({
      action: 'UPDATE_LAYER',
      payload: { id: 'layer1', name: 'Renamed', isVisible: false },
      ctx: { viewId: 'view1', state: { model, scene } }
    });

    expect(result.model.views[0].layers?.[0]).toEqual({
      id: 'layer1',
      name: 'Renamed',
      isVisible: false
    });
  });

  test('UPDATE_LAYER lazily upserts the base layer record', () => {
    const model = getModel();

    const result = reducers.view({
      action: 'UPDATE_LAYER',
      payload: { id: BASE_LAYER_ID, isVisible: false },
      ctx: { viewId: 'view1', state: { model, scene } }
    });

    const base = result.model.views[0].layers?.find((layer) => {
      return layer.id === BASE_LAYER_ID;
    });

    expect(base).toEqual({
      id: BASE_LAYER_ID,
      name: 'Base',
      isVisible: false,
      isLocked: false
    });
  });

  test('UPDATE_LAYER throws for an unknown layer', () => {
    const model = getModel();

    expect(() => {
      return reducers.view({
        action: 'UPDATE_LAYER',
        payload: { id: 'nope', isVisible: false },
        ctx: { viewId: 'view1', state: { model, scene } }
      });
    }).toThrow();
  });

  test('visibility toggle does not touch the scene state', () => {
    const model = getModel();

    const result = reducers.view({
      action: 'UPDATE_LAYER',
      payload: { id: 'layer1', isVisible: false },
      ctx: { viewId: 'view1', state: { model, scene } }
    });

    expect(result.scene).toBe(scene);
  });

  test('DELETE_LAYER removes the record and reassigns entities to base atomically', () => {
    const model = getModel();

    const result = reducers.view({
      action: 'DELETE_LAYER',
      payload: 'layer1',
      ctx: { viewId: 'view1', state: { model, scene } }
    });

    const view = result.model.views[0];

    expect(view.layers?.map((layer) => layer.id)).toEqual(['layer2']);
    expect(view.items[0].layerId).toBeUndefined();
    expect(view.connectors?.[0].layerId).toBeUndefined();
    expect(view.rectangles?.[0].layerId).toBeUndefined();
    expect(view.textBoxes?.[0].layerId).toBeUndefined();
    // The canonical form deletes the key entirely, not sets it undefined.
    expect('layerId' in view.items[0]).toBe(false);
  });

  test('DELETE_LAYER throws for the base layer', () => {
    const model = getModel();

    expect(() => {
      return reducers.view({
        action: 'DELETE_LAYER',
        payload: BASE_LAYER_ID,
        ctx: { viewId: 'view1', state: { model, scene } }
      });
    }).toThrow('The base layer cannot be deleted.');
  });

  test('SET_ITEMS_LAYER assigns every referenced entity type', () => {
    const model = getModel();

    const result = reducers.view({
      action: 'SET_ITEMS_LAYER',
      payload: {
        items: [
          { type: 'ITEM', id: 'node2' },
          { type: 'CONNECTOR', id: 'connector2' },
          { type: 'RECTANGLE', id: 'rectangle2' },
          { type: 'TEXTBOX', id: 'textbox1' }
        ],
        layerId: 'layer2'
      },
      ctx: { viewId: 'view1', state: { model, scene } }
    });

    const view = result.model.views[0];

    expect(view.items[1].layerId).toBe('layer2');
    expect(view.connectors?.[1].layerId).toBe('layer2');
    expect(view.rectangles?.[1].layerId).toBe('layer2');
    expect(view.textBoxes?.[0].layerId).toBe('layer2');
  });

  test('SET_ITEMS_LAYER with null or BASE_LAYER_ID deletes the key', () => {
    const model = getModel();

    const toNull = reducers.view({
      action: 'SET_ITEMS_LAYER',
      payload: { items: [{ type: 'ITEM', id: 'node1' }], layerId: null },
      ctx: { viewId: 'view1', state: { model, scene } }
    });

    expect('layerId' in toNull.model.views[0].items[0]).toBe(false);

    const toBase = reducers.view({
      action: 'SET_ITEMS_LAYER',
      payload: {
        items: [{ type: 'ITEM', id: 'node1' }],
        layerId: BASE_LAYER_ID
      },
      ctx: { viewId: 'view1', state: { model, scene } }
    });

    expect('layerId' in toBase.model.views[0].items[0]).toBe(false);
  });

  test('SET_ITEMS_LAYER throws for an unknown target layer', () => {
    const model = getModel();

    expect(() => {
      return reducers.view({
        action: 'SET_ITEMS_LAYER',
        payload: { items: [{ type: 'ITEM', id: 'node1' }], layerId: 'nope' },
        ctx: { viewId: 'view1', state: { model, scene } }
      });
    }).toThrow();
  });
});
