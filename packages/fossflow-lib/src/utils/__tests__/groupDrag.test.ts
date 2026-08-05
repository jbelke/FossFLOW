import { produce } from 'immer';
import { model as modelFixture } from 'src/fixtures/model';
import {
  expandToGroup,
  getGroupMemberRefs,
  getEntityGroupId,
  getEntityLayerId
} from 'src/utils/objectTree';

const getView = (mutate: (view: any) => void) => {
  return produce(modelFixture, (draft) => {
    mutate(draft.views[0]);
  }).views[0];
};

describe('expandToGroup', () => {
  test('an ungrouped entity drags alone', () => {
    const view = getView(() => {});
    const ref = { type: 'ITEM' as const, id: view.items[0].id };

    expect(expandToGroup(view, ref)).toEqual([ref]);
  });

  test('a grouped entity drags every member of its group', () => {
    const view = getView((draft) => {
      draft.groups = [{ id: 'g1', name: 'G1' }];
      draft.items[0].groupId = 'g1';
      draft.items[1].groupId = 'g1';
    });

    const expanded = expandToGroup(view, {
      type: 'ITEM',
      id: view.items[0].id
    });

    expect(expanded).toHaveLength(2);
    expect(
      expanded.map((ref) => {
        return ref.id;
      })
    ).toEqual([view.items[0].id, view.items[1].id]);
  });

  test('drags members of nested subgroups too', () => {
    const view = getView((draft) => {
      draft.groups = [
        { id: 'parent', name: 'Parent' },
        { id: 'child', name: 'Child', parentId: 'parent' }
      ];
      draft.items[0].groupId = 'parent';
      draft.items[1].groupId = 'child';
    });

    expect(
      expandToGroup(view, { type: 'ITEM', id: view.items[0].id })
    ).toHaveLength(2);
  });

  test('a connector anchor is never expanded', () => {
    const view = getView((draft) => {
      draft.groups = [{ id: 'g1', name: 'G1' }];
      draft.items[0].groupId = 'g1';
      draft.items[1].groupId = 'g1';
    });

    const ref = { type: 'CONNECTOR_ANCHOR' as const, id: 'anchor1' };

    expect(expandToGroup(view, ref)).toEqual([ref]);
  });

  test('a cyclic group parent does not hang the expansion', () => {
    const view = getView((draft) => {
      draft.groups = [
        { id: 'a', name: 'A', parentId: 'b' },
        { id: 'b', name: 'B', parentId: 'a' }
      ];
      draft.items[0].groupId = 'a';
      draft.items[1].groupId = 'b';
    });

    expect(
      expandToGroup(view, { type: 'ITEM', id: view.items[0].id })
    ).toHaveLength(2);
  });
});

describe('getGroupMemberRefs', () => {
  test('includes rectangles and text boxes but not connectors', () => {
    const view = getView((draft) => {
      draft.groups = [{ id: 'g1', name: 'G1' }];
      draft.items[0].groupId = 'g1';
      draft.rectangles[0].groupId = 'g1';
      draft.connectors[0].groupId = 'g1';
      draft.textBoxes = [
        { id: 'tb1', tile: { x: 0, y: 0 }, content: 'T', groupId: 'g1' }
      ];
    });

    const kinds = getGroupMemberRefs(view, 'g1').map((ref) => {
      return ref.type;
    });

    expect(kinds).toContain('ITEM');
    expect(kinds).toContain('RECTANGLE');
    expect(kinds).toContain('TEXTBOX');
    // Connectors follow the items they anchor to; dragging them as well
    // would double-move them.
    expect(kinds).not.toContain('CONNECTOR');
  });
});

describe('entity membership lookups', () => {
  test('reads groupId and layerId, undefined when unset', () => {
    const view = getView((draft) => {
      draft.layers = [{ id: 'layer1', name: 'Layer 1' }];
      draft.groups = [{ id: 'g1', name: 'G1', layerId: 'layer1' }];
      draft.items[0].groupId = 'g1';
      draft.items[0].layerId = 'layer1';
    });

    const first = { type: 'ITEM' as const, id: view.items[0].id };
    const second = { type: 'ITEM' as const, id: view.items[1].id };

    expect(getEntityGroupId(view, first)).toBe('g1');
    expect(getEntityLayerId(view, first)).toBe('layer1');
    expect(getEntityGroupId(view, second)).toBeUndefined();
    expect(getEntityLayerId(view, second)).toBeUndefined();
  });
});
