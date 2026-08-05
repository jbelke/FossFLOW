import { produce } from 'immer';
import { model as modelFixture } from 'src/fixtures/model';
import {
  computeVisibility,
  isEntityHidden,
  isEntityLocked
} from 'src/utils/layers';

const getView = (mutate: (view: any) => void) => {
  const model = produce(modelFixture, (draft) => {
    mutate(draft.views[0]);
  });

  return model.views[0];
};

describe('layer folder cascade', () => {
  test('a layer nested in a hidden folder is hidden', () => {
    const visibility = computeVisibility(
      getView((view) => {
        view.layers = [
          { id: 'root', name: 'Network', isVisible: false },
          { id: 'mid', name: 'Switches', parentId: 'root' },
          { id: 'leaf', name: 'Core', parentId: 'mid' }
        ];
      })
    );

    expect([...visibility.hiddenLayerIds].sort()).toEqual([
      'leaf',
      'mid',
      'root'
    ]);
  });

  test('a visible folder does not un-hide a layer hidden on its own', () => {
    const visibility = computeVisibility(
      getView((view) => {
        view.layers = [
          { id: 'root', name: 'Network' },
          { id: 'leaf', name: 'Core', parentId: 'root', isVisible: false }
        ];
      })
    );

    expect([...visibility.hiddenLayerIds]).toEqual(['leaf']);
  });

  test('lock cascades independently of visibility', () => {
    const visibility = computeVisibility(
      getView((view) => {
        view.layers = [
          { id: 'root', name: 'Network', isLocked: true },
          { id: 'leaf', name: 'Core', parentId: 'root' }
        ];
      })
    );

    expect([...visibility.lockedLayerIds].sort()).toEqual(['leaf', 'root']);
    expect(visibility.hiddenLayerIds.size).toBe(0);
  });

  test('a dangling parentId inherits nothing and does not throw', () => {
    const visibility = computeVisibility(
      getView((view) => {
        view.layers = [{ id: 'orphan', name: 'Orphan', parentId: 'ghost' }];
      })
    );

    expect(visibility.hiddenLayerIds.size).toBe(0);
  });
});

// parentId comes from user-supplied JSON, so a hand-edited document can
// contain loops. These must terminate rather than blow the stack.
describe('cycle tolerance', () => {
  test('a self-parenting layer terminates', () => {
    const visibility = computeVisibility(
      getView((view) => {
        view.layers = [
          { id: 'loop', name: 'Loop', parentId: 'loop', isVisible: false }
        ];
      })
    );

    expect([...visibility.hiddenLayerIds]).toEqual(['loop']);
  });

  test('a two-node cycle terminates and shares the flag', () => {
    const visibility = computeVisibility(
      getView((view) => {
        view.layers = [
          { id: 'a', name: 'A', parentId: 'b', isVisible: false },
          { id: 'b', name: 'B', parentId: 'a' }
        ];
      })
    );

    expect([...visibility.hiddenLayerIds].sort()).toEqual(['a', 'b']);
  });

  test('a clean cycle with no flags set hides nothing', () => {
    const visibility = computeVisibility(
      getView((view) => {
        view.layers = [
          { id: 'a', name: 'A', parentId: 'b' },
          { id: 'b', name: 'B', parentId: 'c' },
          { id: 'c', name: 'C', parentId: 'a' }
        ];
      })
    );

    expect(visibility.hiddenLayerIds.size).toBe(0);
    expect(visibility.hasHidden).toBe(false);
  });

  test('a group cycle terminates', () => {
    const visibility = computeVisibility(
      getView((view) => {
        view.groups = [
          { id: 'g1', name: 'G1', parentId: 'g2', isLocked: true },
          { id: 'g2', name: 'G2', parentId: 'g1' }
        ];
      })
    );

    expect([...visibility.lockedGroupIds].sort()).toEqual(['g1', 'g2']);
  });
});

describe('group cascade', () => {
  test('a group inside a hidden layer is hidden, and so are its children', () => {
    const visibility = computeVisibility(
      getView((view) => {
        view.layers = [{ id: 'layer1', name: 'Layer 1', isVisible: false }];
        view.groups = [
          { id: 'parent', name: 'Parent', layerId: 'layer1' },
          { id: 'child', name: 'Child', parentId: 'parent' }
        ];
      })
    );

    expect([...visibility.hiddenGroupIds].sort()).toEqual(['child', 'parent']);
  });

  test('a hidden group does not hide the layer it sits on', () => {
    const visibility = computeVisibility(
      getView((view) => {
        view.layers = [{ id: 'layer1', name: 'Layer 1' }];
        view.groups = [
          { id: 'g1', name: 'G1', layerId: 'layer1', isVisible: false }
        ];
      })
    );

    expect(visibility.hiddenLayerIds.size).toBe(0);
    expect([...visibility.hiddenGroupIds]).toEqual(['g1']);
  });
});

describe('entity resolution', () => {
  const visibility = {
    hiddenLayerIds: new Set(['hiddenLayer']),
    lockedLayerIds: new Set(['lockedLayer']),
    hiddenGroupIds: new Set(['hiddenGroup']),
    lockedGroupIds: new Set(['lockedGroup'])
  };

  test.each([
    ['nothing set', {}, false],
    ['own flag', { isVisible: false }, true],
    ['hidden layer', { layerId: 'hiddenLayer' }, true],
    ['hidden group', { groupId: 'hiddenGroup' }, true],
    ['visible layer and group', { layerId: 'ok', groupId: 'ok' }, false]
  ])('isEntityHidden — %s', (_label, entity, expected) => {
    expect(isEntityHidden(entity, visibility)).toBe(expected);
  });

  test.each([
    ['nothing set', {}, false],
    ['own flag', { isLocked: true }, true],
    ['locked layer', { layerId: 'lockedLayer' }, true],
    ['locked group', { groupId: 'lockedGroup' }, true]
  ])('isEntityLocked — %s', (_label, entity, expected) => {
    expect(isEntityLocked(entity, visibility)).toBe(expected);
  });
});

describe('connector hiding follows group and per-entity flags', () => {
  test('a connector anchored to a group-hidden item is hidden', () => {
    const view = getView((draft) => {
      draft.groups = [{ id: 'g1', name: 'G1', isVisible: false }];
      draft.items[0].groupId = 'g1';
      // Anchor the first connector onto that now-hidden item.
      draft.connectors[0].anchors[0].ref = { item: draft.items[0].id };
    });

    const visibility = computeVisibility(view);

    expect(visibility.hiddenConnectorIds.has(view.connectors![0].id)).toBe(
      true
    );
  });

  test('a connector hidden in its own right is hidden', () => {
    const view = getView((draft) => {
      draft.connectors[0].isVisible = false;
    });

    const visibility = computeVisibility(view);

    expect(visibility.hasHidden).toBe(true);
    expect(visibility.hiddenConnectorIds.has(view.connectors![0].id)).toBe(
      true
    );
  });
});
