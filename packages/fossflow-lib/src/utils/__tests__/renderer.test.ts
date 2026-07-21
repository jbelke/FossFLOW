import { Coords, Size, Scroll } from 'src/types';
import { CoordsUtils, SizeUtils } from 'src/utils';
import { PROJECTED_TILE_SIZE } from 'src/config';
import type { useScene } from 'src/hooks/useScene';
import {
  getGridSubset,
  getItemAtTile,
  isWithinBounds,
  screenToIso
} from '../renderer';

const getRendererSize = (tileSize: Size, zoom: number = 1): Size => {
  const projectedTileSize = SizeUtils.multiply(PROJECTED_TILE_SIZE, zoom);

  return {
    width: projectedTileSize.width * tileSize.width,
    height: projectedTileSize.height * tileSize.height
  };
};

const getScroll = (coords: Coords): Scroll => {
  return {
    position: coords,
    offset: CoordsUtils.zero()
  };
};

describe('Tests renderer utils', () => {
  test('getGridSubset() works correctly', () => {
    const gridSubset = getGridSubset([
      { x: 5, y: 5 },
      { x: 7, y: 7 }
    ]);

    expect(gridSubset).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 5, y: 7 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 6, y: 7 },
      { x: 7, y: 5 },
      { x: 7, y: 6 },
      { x: 7, y: 7 }
    ]);
  });

  test('isWithinBounds() works correctly', () => {
    const bounds: Coords[] = [
      { x: 4, y: 4 },
      { x: 6, y: 6 }
    ];

    const withinBounds = isWithinBounds({ x: 5, y: 5 }, bounds);
    const onBorder = isWithinBounds({ x: 4, y: 4 }, bounds);
    const outsideBounds = isWithinBounds({ x: 3, y: 3 }, bounds);

    expect(withinBounds).toBe(true);
    expect(onBorder).toBe(true);
    expect(outsideBounds).toBe(false);
  });

  test('screenToIso() works correctly when mouse is at center of project', () => {
    const zoom = 1;
    const rendererSize = getRendererSize({ width: 10, height: 10 }, zoom);
    const scroll = getScroll({ x: 0, y: 0 });
    const tile = screenToIso({
      mouse: {
        x: rendererSize.width / 2,
        y: rendererSize.height / 2
      },
      zoom,
      scroll,
      rendererSize
    });

    expect(tile).toEqual({ x: 0, y: -0 });
  });

  test('screenToIso() works correctly when mouse is at topLeft corner of project', () => {
    const zoom = 1;
    const rendererSize = getRendererSize({ width: 10, height: 10 }, zoom);
    const scroll = getScroll({ x: 0, y: 0 });
    const tile = screenToIso({
      mouse: {
        x: 0,
        y: 0
      },
      zoom,
      scroll,
      rendererSize
    });

    expect(tile).toEqual({ x: 0, y: 10 });
  });

  test('screenToIso() works correctly when mouse is at topLeft corner of project and zoom is 0.5', () => {
    const zoom = 0.5;
    const rendererSize = getRendererSize({ width: 10, height: 10 }, zoom);
    const scroll = getScroll({ x: 0, y: 0 });
    const tile = screenToIso({
      mouse: {
        x: 0,
        y: 0
      },
      zoom,
      scroll,
      rendererSize
    });

    expect(tile).toEqual({ x: 0, y: 10 });
  });

  test('screenToIso() works correctly when mouse is at center of project and zoom is 0.5 and screen is halfway scrolled', () => {
    const zoom = 1;
    const rendererSize = getRendererSize({ width: 10, height: 10 }, zoom);
    const scroll = getScroll({
      x: rendererSize.width / 2,
      y: rendererSize.height / 2
    });
    const tile = screenToIso({
      mouse: {
        x: rendererSize.width / 2,
        y: rendererSize.height / 2
      },
      zoom,
      scroll,
      rendererSize
    });

    expect(tile).toEqual({ x: 0, y: 10 });
  });
});

describe('getItemAtTile() layer filters', () => {
  const items = [
    { id: 'node1', tile: { x: 0, y: 0 } },
    { id: 'hidden1', tile: { x: 2, y: 2 }, layerId: 'hiddenLayer' },
    { id: 'locked1', tile: { x: 4, y: 4 }, layerId: 'lockedLayer' }
  ];

  const scene = {
    items,
    visibleItems: items.filter((item) => {
      return item.layerId !== 'hiddenLayer';
    }),
    textBoxes: [],
    visibleTextBoxes: [],
    connectors: [],
    visibleConnectors: [],
    rectangles: [],
    visibleRectangles: [],
    visibility: {
      hiddenLayerIds: new Set(['hiddenLayer']),
      lockedLayerIds: new Set(['lockedLayer']),
      hiddenConnectorIds: new Set()
    }
  } as unknown as ReturnType<typeof useScene>;

  test('VISIBLE (default) skips hidden items but finds locked ones', () => {
    expect(getItemAtTile({ tile: { x: 0, y: 0 }, scene })).toEqual({
      type: 'ITEM',
      id: 'node1'
    });
    expect(getItemAtTile({ tile: { x: 2, y: 2 }, scene })).toBeNull();
    expect(getItemAtTile({ tile: { x: 4, y: 4 }, scene })).toEqual({
      type: 'ITEM',
      id: 'locked1'
    });
  });

  test('VISIBLE_UNLOCKED additionally skips locked items', () => {
    expect(
      getItemAtTile({
        tile: { x: 4, y: 4 },
        scene,
        filter: 'VISIBLE_UNLOCKED'
      })
    ).toBeNull();
    expect(
      getItemAtTile({
        tile: { x: 0, y: 0 },
        scene,
        filter: 'VISIBLE_UNLOCKED'
      })
    ).toEqual({ type: 'ITEM', id: 'node1' });
  });

  test('ALL finds hidden items (tile occupancy)', () => {
    expect(getItemAtTile({ tile: { x: 2, y: 2 }, scene, filter: 'ALL' })).toEqual(
      { type: 'ITEM', id: 'hidden1' }
    );
  });
});
