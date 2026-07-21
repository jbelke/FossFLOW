import React, { memo } from 'react';
import type { useScene } from 'src/hooks/useScene';
import { IsoTileArea } from 'src/components/IsoTileArea/IsoTileArea';
import { getColorVariant } from 'src/utils';
import { useColor } from 'src/hooks/useColor';

type Props = ReturnType<typeof useScene>['rectangles'][0];

// Memoized on the spread fields: from/to/color refs are immer-stable unless
// this rectangle changed.
export const Rectangle = memo(({ from, to, color: colorId }: Props) => {
  const color = useColor(colorId);

  if (!color) {
    return null;
  }

  return (
    <IsoTileArea
      from={from}
      to={to}
      fill={color.value}
      cornerRadius={22}
      stroke={{
        color: getColorVariant(color.value, 'dark', { grade: 2 }),
        width: 1
      }}
    />
  );
});

Rectangle.displayName = 'Rectangle';
