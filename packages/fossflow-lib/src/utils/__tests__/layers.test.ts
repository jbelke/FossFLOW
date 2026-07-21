import { produce } from 'immer';
import { model as modelFixture } from 'src/fixtures/model';
import { BASE_LAYER_ID } from 'src/schemas/views';
import {
  computeVisibility,
  getEffectiveLayerId,
  isLayerVisible,
  isLayerLocked,
  resolveLayerId
} from 'src/utils/layers';

const getView = (mutate?: (view: any) => void) => {
  const model = produce(modelFixture, (draft) => {
    if (mutate) mutate(draft.views[0]);
  });

  return model.views[0];
};

describe('layer helpers', () => {
  test('missing flags mean visible and unlocked', () => {
    expect(isLayerVisible({ isVisible: undefined })).toBe(true);
    expect(isLayerVisible({ isVisible: false })).toBe(false);
    expect(isLayerLocked({ isLocked: undefined })).toBe(false);
    expect(isLayerLocked({ isLocked: true })).toBe(true);
  });

  test('missing layerId resolves to the base layer', () => {
    expect(getEffectiveLayerId({})).toBe(BASE_LAYER_ID);
    expect(getEffectiveLayerId({ layerId: 'layer1' })).toBe('layer1');
  });
});

describe('computeVisibility', () => {
  test('view without layers hides nothing', () => {
    const visibility = computeVisibility(getView());

    expect(visibility.hiddenLayerIds.size).toBe(0);
    expect(visibility.lockedLayerIds.size).toBe(0);
    expect(visibility.hiddenConnectorIds.size).toBe(0);
  });

  test('collects hidden and locked layer ids', () => {
    const view = getView((draft) => {
      draft.layers = [
        { id: 'layer1', name: 'L1', isVisible: false },
        { id: 'layer2', name: 'L2', isLocked: true },
        { id: 'layer3', name: 'L3' }
      ];
    });

    const visibility = computeVisibility(view);

    expect([...visibility.hiddenLayerIds]).toEqual(['layer1']);
    expect([...visibility.lockedLayerIds]).toEqual(['layer2']);
  });

  test('hides a connector whose own layer is hidden', () => {
    const view = getView((draft) => {
      draft.layers = [{ id: 'layer1', name: 'L1', isVisible: false }];
      draft.connectors[0].layerId = 'layer1';
    });

    const visibility = computeVisibility(view);

    expect(visibility.hiddenConnectorIds.has('connector1')).toBe(true);
    expect(visibility.hiddenConnectorIds.has('connector2')).toBe(false);
  });

  test('hides a connector anchored to an item on a hidden layer', () => {
    const view = getView((draft) => {
      draft.layers = [{ id: 'layer1', name: 'L1', isVisible: false }];
      // node1 anchors connector1 only.
      draft.items[0].layerId = 'layer1';
    });

    const visibility = computeVisibility(view);

    expect(visibility.hiddenConnectorIds.has('connector1')).toBe(true);
    expect(visibility.hiddenConnectorIds.has('connector2')).toBe(false);
  });

  test('hides the whole mesh when a shared item is hidden', () => {
    const view = getView((draft) => {
      draft.layers = [{ id: 'layer1', name: 'L1', isVisible: false }];
      // node2 anchors both connectors.
      draft.items[1].layerId = 'layer1';
    });

    const visibility = computeVisibility(view);

    expect(visibility.hiddenConnectorIds.has('connector1')).toBe(true);
    expect(visibility.hiddenConnectorIds.has('connector2')).toBe(true);
  });

  test('second pass hides connectors anchored onto hidden connectors', () => {
    const view = getView((draft) => {
      draft.layers = [{ id: 'layer1', name: 'L1', isVisible: false }];
      draft.connectors[0].layerId = 'layer1';
      // connector3 hangs off an anchor of (hidden) connector1.
      draft.connectors.push({
        id: 'connector3',
        anchors: [
          { id: 'anch3-1', ref: { anchor: 'anch1-1' } },
          { id: 'anch3-2', ref: { item: 'node3' } }
        ]
      });
    });

    const visibility = computeVisibility(view);

    expect(visibility.hiddenConnectorIds.has('connector1')).toBe(true);
    expect(visibility.hiddenConnectorIds.has('connector3')).toBe(true);
  });
});

describe('resolveLayerId', () => {
  test('returns undefined for null, base, and unknown layers', () => {
    const view = getView((draft) => {
      draft.layers = [{ id: 'layer1', name: 'L1' }];
    });

    expect(resolveLayerId(view, null)).toBeUndefined();
    expect(resolveLayerId(view, BASE_LAYER_ID)).toBeUndefined();
    expect(resolveLayerId(view, 'undone-layer')).toBeUndefined();
    expect(resolveLayerId(view, 'layer1')).toBe('layer1');
  });
});
