import { produce } from 'immer';
import { model as modelFixture } from 'src/fixtures/model';
import * as reducers from 'src/stores/reducers';

const scene = {
  connectors: {},
  textBoxes: {}
};

const getModel = (mutate?: (view: any) => void) => {
  return produce(modelFixture, (draft) => {
    const view = draft.views[0];

    view.layers = [
      { id: 'layer1', name: 'Layer 1' },
      { id: 'layer2', name: 'Layer 2' }
    ];
    view.textBoxes = [
      { id: 'textbox1', tile: { x: 1, y: 1 }, content: 'Text' }
    ];
    if (mutate) mutate(view);
  });
};

const run = (action: any, payload: any, model: any) => {
  return reducers.view({
    action,
    payload,
    ctx: { viewId: 'view1', state: { model, scene } }
  } as any).model.views[0];
};

const itemRef = (id: string) => {
  return { type: 'ITEM' as const, id };
};

const byId = (records: any[] | undefined, id: string): any => {
  const found = (records ?? []).find((record) => {
    return record.id === id;
  });

  if (!found) throw new Error(`No record "${id}" in the result.`);

  return found;
};

describe('CREATE_GROUP', () => {
  test('appends the group and stamps groupId on its members', () => {
    const model = getModel();
    const [first, second] = model.views[0].items;

    const view = run(
      'CREATE_GROUP',
      {
        group: { id: 'g1', name: 'DMZ' },
        items: [itemRef(first.id), itemRef(second.id)]
      },
      model
    );

    expect(view.groups).toHaveLength(1);
    expect(view.items[0].groupId).toBe('g1');
    expect(view.items[1].groupId).toBe('g1');
    expect(view.lastUpdated).toBeDefined();
  });

  test('groups across kinds — connectors, rectangles and text boxes', () => {
    const model = getModel();
    const view = run(
      'CREATE_GROUP',
      {
        group: { id: 'g1', name: 'Mixed' },
        items: [
          { type: 'CONNECTOR', id: model.views[0].connectors![0].id },
          { type: 'RECTANGLE', id: model.views[0].rectangles![0].id },
          { type: 'TEXTBOX', id: 'textbox1' }
        ]
      },
      model
    );

    expect(view.connectors![0].groupId).toBe('g1');
    expect(view.rectangles![0].groupId).toBe('g1');
    expect(view.textBoxes![0].groupId).toBe('g1');
  });

  // The one place the model rewrites data the user did not directly edit,
  // so it gets its own test: a group must never straddle two layers.
  test("normalizes every member's layer to the group's layer", () => {
    const model = getModel((view) => {
      view.items[0].layerId = 'layer1';
      view.items[1].layerId = 'layer2';
    });

    const view = run(
      'CREATE_GROUP',
      {
        group: { id: 'g1', name: 'DMZ', layerId: 'layer2' },
        items: [itemRef(model.views[0].items[0].id), itemRef(model.views[0].items[1].id)]
      },
      model
    );

    expect(view.items[0].layerId).toBe('layer2');
    expect(view.items[1].layerId).toBe('layer2');
  });

  test('a base-layer group strips layerId rather than writing a sentinel', () => {
    const model = getModel((view) => {
      view.items[0].layerId = 'layer1';
    });

    const view = run(
      'CREATE_GROUP',
      {
        group: { id: 'g1', name: 'DMZ' },
        items: [itemRef(model.views[0].items[0].id)]
      },
      model
    );

    expect(Object.keys(view.items[0])).not.toContain('layerId');
  });

  test('rejects a duplicate group id', () => {
    const model = getModel((view) => {
      view.groups = [{ id: 'g1', name: 'Existing' }];
    });

    expect(() => {
      return run(
        'CREATE_GROUP',
        { group: { id: 'g1', name: 'Dupe' }, items: [] },
        model
      );
    }).toThrow(/already exists/);
  });
});

describe('DELETE_GROUP', () => {
  test('members survive and become ungrouped', () => {
    const model = getModel((view) => {
      view.groups = [{ id: 'g1', name: 'DMZ' }];
      view.items[0].groupId = 'g1';
    });

    const itemCount = model.views[0].items.length;
    const view = run('DELETE_GROUP', 'g1', model);

    expect(view.groups).toHaveLength(0);
    expect(view.items).toHaveLength(itemCount);
    expect(Object.keys(view.items[0])).not.toContain('groupId');
  });

  test('members and child groups move up to the parent group', () => {
    const model = getModel((view) => {
      view.groups = [
        { id: 'parent', name: 'Parent' },
        { id: 'child', name: 'Child', parentId: 'parent' },
        { id: 'grandchild', name: 'Grandchild', parentId: 'child' }
      ];
      view.items[0].groupId = 'child';
    });

    const view = run('DELETE_GROUP', 'child', model);

    expect(view.items[0].groupId).toBe('parent');
    expect(byId(view.groups, 'grandchild').parentId).toBe('parent');
  });

  test('leaves no dangling groupId behind', () => {
    const model = getModel((view) => {
      view.groups = [{ id: 'g1', name: 'DMZ' }];
      view.items[0].groupId = 'g1';
      view.connectors[0].groupId = 'g1';
    });

    const view = run('DELETE_GROUP', 'g1', model);
    const liveIds = new Set(
      (view.groups ?? []).map((g: any) => {
        return g.id;
      })
    );

    [...view.items, ...view.connectors!].forEach((entity: any) => {
      if (entity.groupId !== undefined) {
        expect(liveIds.has(entity.groupId)).toBe(true);
      }
    });
  });

  test('throws for an unknown group', () => {
    expect(() => {
      return run('DELETE_GROUP', 'ghost', getModel());
    }).toThrow(/not found/);
  });
});

describe('SET_GROUP_PARENT', () => {
  test('nests a group and pulls it onto the parent layer', () => {
    const model = getModel((view) => {
      view.groups = [
        { id: 'parent', name: 'Parent', layerId: 'layer2' },
        { id: 'child', name: 'Child', layerId: 'layer1' }
      ];
      view.items[0].groupId = 'child';
      view.items[0].layerId = 'layer1';
    });

    const view = run(
      'SET_GROUP_PARENT',
      { id: 'child', parentId: 'parent' },
      model
    );

    const child = byId(view.groups, 'child');

    expect(child.parentId).toBe('parent');
    expect(child.layerId).toBe('layer2');
    expect(view.items[0].layerId).toBe('layer2');
  });

  test('refuses to move a group inside its own subtree', () => {
    const model = getModel((view) => {
      view.groups = [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', parentId: 'a' },
        { id: 'c', name: 'C', parentId: 'b' }
      ];
    });

    expect(() => {
      return run('SET_GROUP_PARENT', { id: 'a', parentId: 'c' }, model);
    }).toThrow(/own subtree/);
  });

  test('refuses to make a group its own parent', () => {
    const model = getModel((view) => {
      view.groups = [{ id: 'a', name: 'A' }];
    });

    expect(() => {
      return run('SET_GROUP_PARENT', { id: 'a', parentId: 'a' }, model);
    }).toThrow(/own subtree/);
  });

  test('unnesting to null drops the parentId key', () => {
    const model = getModel((view) => {
      view.groups = [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B', parentId: 'a' }
      ];
    });

    const view = run('SET_GROUP_PARENT', { id: 'b', parentId: null }, model);

    expect(Object.keys(byId(view.groups, 'b'))).not.toContain('parentId');
  });
});

describe('SET_ITEMS_GROUP', () => {
  test('joining a group also joins its layer', () => {
    const model = getModel((view) => {
      view.groups = [{ id: 'g1', name: 'DMZ', layerId: 'layer2' }];
      view.items[0].layerId = 'layer1';
    });

    const view = run(
      'SET_ITEMS_GROUP',
      { items: [itemRef(model.views[0].items[0].id)], groupId: 'g1' },
      model
    );

    expect(view.items[0].groupId).toBe('g1');
    expect(view.items[0].layerId).toBe('layer2');
  });

  test('leaving a group keeps the entity on its layer', () => {
    const model = getModel((view) => {
      view.groups = [{ id: 'g1', name: 'DMZ', layerId: 'layer2' }];
      view.items[0].groupId = 'g1';
      view.items[0].layerId = 'layer2';
    });

    const view = run(
      'SET_ITEMS_GROUP',
      { items: [itemRef(model.views[0].items[0].id)], groupId: null },
      model
    );

    expect(Object.keys(view.items[0])).not.toContain('groupId');
    expect(view.items[0].layerId).toBe('layer2');
  });

  test('throws for an unknown group', () => {
    const model = getModel();

    expect(() => {
      return run(
        'SET_ITEMS_GROUP',
        { items: [itemRef(model.views[0].items[0].id)], groupId: 'ghost' },
        model
      );
    }).toThrow(/not found/);
  });
});

describe('UPDATE_GROUP', () => {
  test('renames and toggles flags', () => {
    const model = getModel((view) => {
      view.groups = [{ id: 'g1', name: 'DMZ' }];
    });

    const view = run(
      'UPDATE_GROUP',
      { id: 'g1', name: 'Renamed', isVisible: false },
      model
    );

    expect(view.groups![0]).toMatchObject({
      name: 'Renamed',
      isVisible: false
    });
  });

  test('moving the group to another layer takes its members along', () => {
    const model = getModel((view) => {
      view.groups = [{ id: 'g1', name: 'DMZ', layerId: 'layer1' }];
      view.items[0].groupId = 'g1';
      view.items[0].layerId = 'layer1';
    });

    const view = run('UPDATE_GROUP', { id: 'g1', layerId: 'layer2' }, model);

    expect(view.items[0].layerId).toBe('layer2');
  });

  test('refuses to smuggle a reparent through the generic update', () => {
    const model = getModel((view) => {
      view.groups = [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' }
      ];
    });

    expect(() => {
      return run('UPDATE_GROUP', { id: 'a', parentId: 'b' }, model);
    }).toThrow(/SET_GROUP_PARENT/);
  });
});

describe('layer nesting', () => {
  test('SET_LAYER_PARENT nests a layer', () => {
    const view = run(
      'SET_LAYER_PARENT',
      { id: 'layer2', parentId: 'layer1' },
      getModel()
    );

    expect(view.layers![1].parentId).toBe('layer1');
  });

  test('SET_LAYER_PARENT refuses a cycle', () => {
    const model = getModel((view) => {
      view.layers[1].parentId = 'layer1';
    });

    expect(() => {
      return run('SET_LAYER_PARENT', { id: 'layer1', parentId: 'layer2' }, model);
    }).toThrow(/own subtree/);
  });

  test('deleting a nested layer moves its contents to the parent folder', () => {
    const model = getModel((view) => {
      view.layers.push({ id: 'layer3', name: 'Layer 3', parentId: 'layer2' });
      view.layers[1].parentId = 'layer1';
      view.items[0].layerId = 'layer2';
      view.groups = [{ id: 'g1', name: 'G1', layerId: 'layer2' }];
    });

    const view = run('DELETE_LAYER', 'layer2', model);

    expect(view.items[0].layerId).toBe('layer1');
    expect(view.groups![0].layerId).toBe('layer1');
    expect(byId(view.layers, 'layer3').parentId).toBe('layer1');
  });

  test('deleting a top-level layer still drops contents to the base layer', () => {
    const model = getModel((view) => {
      view.items[0].layerId = 'layer1';
    });

    const view = run('DELETE_LAYER', 'layer1', model);

    expect(Object.keys(view.items[0])).not.toContain('layerId');
  });
});
