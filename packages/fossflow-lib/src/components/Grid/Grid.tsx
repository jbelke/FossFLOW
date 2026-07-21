import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, useTheme } from '@mui/material';
import gsap from 'gsap';
import { Size } from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { gridTileDataUri } from './gridTile';
import { PROJECTED_TILE_SIZE } from 'src/config';
import { SizeUtils } from 'src/utils/SizeUtils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';

export const Grid = () => {
  const theme = useTheme();
  const elementRef = useRef<HTMLDivElement>(null);
  const { size } = useResizeObserver(elementRef.current);
  const [isFirstRender, setIsFirstRender] = useState(true);
  // Stroke colour comes from the theme so the grid stays visible in dark
  // mode; the tile is rebuilt only when the theme changes.
  const tileUri = useMemo(() => {
    return gridTileDataUri(theme.customVars.customPalette.gridLine);
  }, [theme]);
  const scroll = useUiStateStore((state) => {
    return state.scroll;
  });
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });

  useEffect(() => {
    if (!elementRef.current) return;

    const tileSize = SizeUtils.multiply(PROJECTED_TILE_SIZE, zoom);
    const elSize = elementRef.current.getBoundingClientRect();
    const backgroundPosition: Size = {
      width: elSize.width / 2 + scroll.position.x + tileSize.width / 2,
      height: elSize.height / 2 + scroll.position.y
    };

    gsap.to(elementRef.current, {
      duration: isFirstRender ? 0 : 0.25,
      backgroundSize: `${tileSize.width}px ${tileSize.height * 2}px`,
      backgroundPosition: `${backgroundPosition.width}px ${backgroundPosition.height}px`
    });

    if (isFirstRender) {
      setIsFirstRender(false);
    }
  }, [scroll, zoom, isFirstRender, size]);

  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        pointerEvents: 'none'
      }}
    >
      <Box
        ref={elementRef}
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          background: `repeat url("${tileUri}")`
        }}
      />
    </Box>
  );
};
