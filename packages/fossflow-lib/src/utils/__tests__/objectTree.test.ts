import { produce } from 'immer';
import { model as modelFixture } from 'src/fixtures/model';
import { BASE_LAYER_ID } from 'src/schemas/views';
import { computeVisibility } from 'src/utils/layers';
import { buildTreeRows } from 'src/utils/objectTree';

const build = (mutate?: (view: any) => void) => {
  const model = produce(modelFixture, (draft) => {
    if (mutate) mutate(draft.views[0]);
  });
  const view = model.views[0];

  const itemNames = new Map<string, string>();

  model.items.forEach((modelItem) => {
    itemNames.set(modelItem.id, modelItem.name);
  });

  return buildTreeRows({
    view,
    visibility: computeVisibility(view),
    itemNames
  });
};

const keys = (rows: ReturnType<typeof build>) => {
  return rows.map((row) => {
    return row.key;
  });
};

describe('buildTreeRows', () => {
  test('an unorganized view is one base layer holding everything', () => {
    const rows = build();

    expect(rows[0]).toMatchObject({
      kind: 'LAYER',
      id: BASE_LAYER_ID,
      depth: 0
    });
    expect(rows.slice(1).every((row) => {
      return row.isEntity && row.depth === 1;
    })).toBe(true);
  });

  test('orders folders, then groups, then loose entities', () => {
    const rows = build((view) => {
      view.layers = [
        { id: 'parent', name: 'Parent' },
        { id: 'child', name: 'Child', parentId: 'parent' }
      ];
      view.groups = [{ id: 'g1', name: 'G1', layerId: 'parent' }];
      view.items[0].layerId = 'parent';
      view.items[1].layerId = 'parent';
      view.items[1].groupId = 'g1';
    });

    const parentAt = keys(rows).indexOf('LAYER:parent');
    const order = keys(rows).slice(parentAt + 1, parentAt + 4);

    expect(order[0]).toBe('LAYER:child');
    expect(order[1]).toBe('GROUP:g1');
    expect(order[2]).toBe(`ITEM:${modelFixture.views[0].items[1].id}`);
  });

  test('a collapsed container contributes its row but no children', () => {
    const expanded = build((view) => {
      view.layers = [{ id: 'layer1', name: 'Layer 1' }];
      view.items[0].layerId = 'layer1';
    });
    const collapsed = build((view) => {
      view.layers = [{ id: 'layer1', name: 'Layer 1', isCollapsed: true }];
      view.items[0].layerId = 'layer1';
    });

    expect(keys(expanded)).toContain(`ITEM:${modelFixture.views[0].items[0].id}`);
    expect(keys(collapsed)).toContain('LAYER:layer1');
    expect(keys(collapsed)).not.toContain(
      `ITEM:${modelFixture.views[0].items[0].id}`
    );
  });

  test('counts entities transitively through nested groups and folders', () => {
    const rows = build((view) => {
      view.layers = [
        { id: 'parent', name: 'Parent' },
        { id: 'child', name: 'Child', parentId: 'parent' }
      ];
      view.groups = [
        { id: 'g1', name: 'G1', layerId: 'parent' },
        { id: 'g2', name: 'G2', parentId: 'g1', layerId: 'parent' }
      ];
      view.items[0].layerId = 'parent';
      view.items[1].layerId = 'parent';
      view.items[1].groupId = 'g2';
      view.items[2].layerId = 'child';
    });

    const byKey = new Map(
      rows.map((row) => {
        return [row.key, row];
      })
    );

    expect(byKey.get('GROUP:g2')!.descendantCount).toBe(1);
    expect(byKey.get('GROUP:g1')!.descendantCount).toBe(1);
    // One loose item + one in the nested group + one on the child folder.
    expect(byKey.get('LAYER:parent')!.descendantCount).toBe(3);
  });

  test('marks a row hidden by an ancestor without changing its own flag', () => {
    const rows = build((view) => {
      view.layers = [{ id: 'layer1', name: 'Layer 1', isVisible: false }];
      view.items[0].layerId = 'layer1';
    });

    const item = rows.find((row) => {
      return row.key === `ITEM:${modelFixture.views[0].items[0].id}`;
    })!;

    expect(item.isEffectivelyHidden).toBe(true);
    expect(item.isVisible).toBe(true);
  });

  test('resolves entity display names', () => {
    const rows = build((view) => {
      view.textBoxes = [{ id: 'tb1', tile: { x: 0, y: 0 }, content: 'Hello' }];
    });

    const textBox = rows.find((row) => {
      return row.key === 'TEXTBOX:tb1';
    })!;

    expect(textBox.name).toBe('Hello');
    expect(
      rows.find((row) => {
        return row.kind === 'ITEM';
      })!.name
    ).toBe(modelFixture.items[0].name);
  });
});

// A corrupt parentId must make a container look misplaced, never make it (and
// everything inside it) vanish from the only UI that can repair it.
describe('corrupt parent ids', () => {
  test('a layer with a dangling parent is still shown, at the root', () => {
    const rows = build((view) => {
      view.layers = [{ id: 'orphan', name: 'Orphan', parentId: 'ghost' }];
    });

    const orphan = rows.find((row) => {
      return row.key === 'LAYER:orphan';
    });

    expect(orphan).toBeDefined();
    expect(orphan!.depth).toBe(0);
  });

  test('layers in a parent cycle are all still shown exactly once', () => {
    const rows = build((view) => {
      view.layers = [
        { id: 'a', name: 'A', parentId: 'b' },
        { id: 'b', name: 'B', parentId: 'a' }
      ];
    });

    expect(keys(rows).filter((key) => {
      return key === 'LAYER:a';
    })).toHaveLength(1);
    expect(keys(rows)).toContain('LAYER:b');
  });

  // Regression: the sweep used to fire on "was not emitted", which is also
  // true of everything inside a COLLAPSED container — so collapsing a layer
  // teleported its groups up to the root.
  test('collapsing a layer does not promote its groups to the root', () => {
    const rows = build((view) => {
      view.layers = [{ id: 'layer1', name: 'Layer 1', isCollapsed: true }];
      view.groups = [{ id: 'g1', name: 'G1', layerId: 'layer1' }];
    });

    expect(keys(rows)).not.toContain('GROUP:g1');
  });

  test('expanding that same layer shows the group nested inside it', () => {
    const rows = build((view) => {
      view.layers = [{ id: 'layer1', name: 'Layer 1' }];
      view.groups = [{ id: 'g1', name: 'G1', layerId: 'layer1' }];
    });

    const group = rows.find((row) => {
      return row.key === 'GROUP:g1';
    })!;

    expect(group.depth).toBe(1);
  });

  test('a group whose layer does not exist is still shown at the root', () => {
    const rows = build((view) => {
      view.groups = [{ id: 'g1', name: 'G1', layerId: 'ghost' }];
    });

    expect(keys(rows)).toContain('GROUP:g1');
  });

  test('a group in a parent cycle is still shown', () => {
    const rows = build((view) => {
      view.groups = [
        { id: 'g1', name: 'G1', parentId: 'g2' },
        { id: 'g2', name: 'G2', parentId: 'g1' }
      ];
    });

    expect(keys(rows)).toContain('GROUP:g1');
    expect(keys(rows)).toContain('GROUP:g2');
  });
});

describe('scale', () => {
  test('a 200-entity layer flattens to 201 rows and no duplicates', () => {
    const rows = build((view) => {
      view.layers = [{ id: 'big', name: 'Big' }];
      view.items = Array.from({ length: 200 }, (_, index) => {
        return {
          id: `node${index}`,
          tile: { x: index, y: 0 },
          layerId: 'big'
        };
      });
      view.connectors = [];
      view.rectangles = [];
      view.textBoxes = [];
    });

    // Base (empty) + Big + 200 items.
    expect(rows).toHaveLength(202);
    expect(new Set(keys(rows)).size).toBe(rows.length);
  });
});
