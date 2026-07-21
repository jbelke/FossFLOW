import { produce } from 'immer';
import { model as modelFixture } from 'src/fixtures/model';
import { viewSchema, layerSchema, BASE_LAYER_ID } from 'src/schemas/views';
import { validateView } from 'src/schemas/validation';

describe('layer schema', () => {
  test('a pre-layers view still parses', () => {
    const result = viewSchema.safeParse(modelFixture.views[0]);

    expect(result.success).toBe(true);
  });

  test('a view with layers and layerId refs parses', () => {
    const view = produce(modelFixture.views[0], (draft) => {
      draft.layers = [
        { id: 'layer1', name: 'Layer 1', isVisible: false, isLocked: true }
      ];
      draft.items[0].layerId = 'layer1';
      draft.connectors![0].layerId = 'layer1';
      draft.rectangles![0].layerId = 'layer1';
    });

    const result = viewSchema.safeParse(view);

    expect(result.success).toBe(true);
  });

  test('a layer with invalid fields fails to parse', () => {
    expect(layerSchema.safeParse({ id: 'layer1' }).success).toBe(false);
    expect(
      layerSchema.safeParse({ id: 'layer1', name: 'x', isVisible: 'yes' })
        .success
    ).toBe(false);
  });
});

describe('layer reference validation', () => {
  const getModelWith = (mutate: (view: any) => void) => {
    return produce(modelFixture, (draft) => {
      draft.views[0].layers = [{ id: 'layer1', name: 'Layer 1' }];
      mutate(draft.views[0]);
    });
  };

  test.each([
    ['ITEM', (view: any) => (view.items[0].layerId = 'ghost')],
    ['CONNECTOR', (view: any) => (view.connectors[0].layerId = 'ghost')],
    ['RECTANGLE', (view: any) => (view.rectangles[0].layerId = 'ghost')],
    [
      'TEXTBOX',
      (view: any) =>
        (view.textBoxes = [
          { id: 'tb1', tile: { x: 0, y: 0 }, content: 'x', layerId: 'ghost' }
        ])
    ]
  ])('flags a dangling layerId on a %s', (entityType, mutate) => {
    const model = getModelWith(mutate);
    const issues = validateView(model.views[0], { model });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      type: 'INVALID_LAYER_REF',
      params: { entityType, layer: 'ghost' }
    });
  });

  test('valid layerId refs and BASE_LAYER_ID produce no issues', () => {
    const model = getModelWith((view) => {
      view.items[0].layerId = 'layer1';
      view.items[1].layerId = BASE_LAYER_ID;
    });

    const issues = validateView(model.views[0], { model });

    expect(issues).toHaveLength(0);
  });
});
