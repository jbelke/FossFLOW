import { produce } from 'immer';
import { model as modelFixture } from 'src/fixtures/model';
import { viewSchema, groupSchema } from 'src/schemas/views';
import { validateView } from 'src/schemas/validation';

describe('group schema', () => {
  test('a view with groups and groupId refs parses', () => {
    const view = produce(modelFixture.views[0], (draft) => {
      draft.layers = [{ id: 'layer1', name: 'Layer 1' }];
      draft.groups = [
        {
          id: 'group1',
          name: 'DMZ cluster',
          layerId: 'layer1',
          isVisible: false,
          isLocked: true,
          isCollapsed: true
        },
        { id: 'group2', name: 'Firewalls', parentId: 'group1' }
      ];
      draft.items[0].layerId = 'layer1';
      draft.items[0].groupId = 'group1';
      draft.connectors![0].groupId = 'group2';
      draft.rectangles![0].groupId = 'group1';
    });

    expect(viewSchema.safeParse(view).success).toBe(true);
  });

  test('a nested layer parses', () => {
    const view = produce(modelFixture.views[0], (draft) => {
      draft.layers = [
        { id: 'folder', name: 'Network', isCollapsed: true },
        { id: 'child', name: 'Core switches', parentId: 'folder' }
      ];
    });

    expect(viewSchema.safeParse(view).success).toBe(true);
  });

  test('a group with invalid fields fails to parse', () => {
    expect(groupSchema.safeParse({ id: 'group1' }).success).toBe(false);
    expect(
      groupSchema.safeParse({ id: 'group1', name: 'x', isLocked: 'yes' })
        .success
    ).toBe(false);
  });

  // The whole point of making every new field optional: a document written
  // before groups existed must survive a parse without growing keys.
  test('a pre-groups view round-trips without gaining group keys', () => {
    const original = modelFixture.views[0];
    const parsed = viewSchema.parse(original);

    expect(parsed).toEqual(original);
    expect(Object.keys(parsed)).not.toContain('groups');
    expect(Object.keys(parsed.items[0])).not.toContain('groupId');
    expect(Object.keys(parsed.items[0])).not.toContain('isVisible');
  });
});

describe('group reference validation', () => {
  const getModelWith = (mutate: (view: any) => void) => {
    return produce(modelFixture, (draft) => {
      draft.views[0].layers = [{ id: 'layer1', name: 'Layer 1' }];
      draft.views[0].groups = [{ id: 'group1', name: 'Group 1' }];
      mutate(draft.views[0]);
    });
  };

  test.each([
    ['ITEM', (view: any) => (view.items[0].groupId = 'ghost')],
    ['CONNECTOR', (view: any) => (view.connectors[0].groupId = 'ghost')],
    ['RECTANGLE', (view: any) => (view.rectangles[0].groupId = 'ghost')],
    [
      'TEXTBOX',
      (view: any) =>
        (view.textBoxes = [
          { id: 'tb1', tile: { x: 0, y: 0 }, content: 'x', groupId: 'ghost' }
        ])
    ]
  ])('flags a dangling groupId on a %s', (entityType, mutate) => {
    const model = getModelWith(mutate);
    const issues = validateView(model.views[0], { model });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'INVALID_GROUP_REF',
      params: { entityType, group: 'ghost' }
    });
  });

  test('flags a dangling parent group', () => {
    const model = getModelWith((view) => {
      view.groups.push({ id: 'group2', name: 'Group 2', parentId: 'ghost' });
    });
    const issues = validateView(model.views[0], { model });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'INVALID_GROUP_REF',
      params: { entityType: 'GROUP', entity: 'group2', group: 'ghost' }
    });
  });

  test('flags a dangling parent layer', () => {
    const model = getModelWith((view) => {
      view.layers.push({ id: 'layer2', name: 'Layer 2', parentId: 'ghost' });
    });
    const issues = validateView(model.views[0], { model });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'INVALID_LAYER_REF',
      params: { entityType: 'LAYER', entity: 'layer2', layer: 'ghost' }
    });
  });

  test("flags a group pointing at a layer that doesn't exist", () => {
    const model = getModelWith((view) => {
      view.groups[0].layerId = 'ghost';
    });
    const issues = validateView(model.views[0], { model });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'INVALID_LAYER_REF',
      params: { entityType: 'GROUP', entity: 'group1', layer: 'ghost' }
    });
  });

  test('valid group and parent refs produce no issues', () => {
    const model = getModelWith((view) => {
      view.groups[0].layerId = 'layer1';
      view.groups.push({ id: 'group2', name: 'Group 2', parentId: 'group1' });
      view.layers.push({ id: 'layer2', name: 'Layer 2', parentId: 'layer1' });
      view.items[0].groupId = 'group2';
    });

    expect(validateView(model.views[0], { model })).toHaveLength(0);
  });
});
