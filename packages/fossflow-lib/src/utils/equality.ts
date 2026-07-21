import { Coords } from 'src/types';

export { shallow } from 'zustand/shallow';

export const tileEq = (a: Coords, b: Coords): boolean => {
  return a.x === b.x && a.y === b.y;
};

export const nullableTileEq = (a: Coords | null, b: Coords | null): boolean => {
  if (a === null || b === null) return a === b;
  return tileEq(a, b);
};
