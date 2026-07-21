import React, { memo, useMemo } from 'react';
import { useTheme, Box } from '@mui/material';
import { UNPROJECTED_TILE_SIZE } from 'src/config';
import {
  getAnchorTile,
  getColorVariant,
  getConnectorDirectionIcon,
  getItemById
} from 'src/utils';
import { Circle } from 'src/components/Circle/Circle';
import { Svg } from 'src/components/Svg/Svg';
import { useIsoProjection } from 'src/hooks/useIsoProjection';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import type { useScene } from 'src/hooks/useScene';
import { useColor } from 'src/hooks/useColor';

type MergedConnector = ReturnType<typeof useScene>['connectors'][0];

interface Props {
  connector: MergedConnector;
  isSelected?: boolean;
}

// Anchor handles for the selected connector. Mounted only while selected, so
// a single connector at a time pays the current-view subscription needed to
// resolve anchor positions.
const SelectedConnectorAnchors = ({
  connector,
  drawOffset
}: {
  connector: MergedConnector;
  drawOffset: { x: number; y: number };
}) => {
  const theme = useTheme();
  const currentViewId = useUiStateStore((state) => {
    return state.view;
  });
  const currentView = useModelStore((state) => {
    return getItemById(state.views, currentViewId)?.value ?? state.views[0];
  });

  const anchorPositions = useMemo(() => {
    if (!currentView) return [];

    return connector.anchors.map((anchor) => {
      const position = getAnchorTile(anchor, currentView);

      return {
        id: anchor.id,
        x:
          (connector.path.rectangle.from.x - position.x) *
            UNPROJECTED_TILE_SIZE +
          drawOffset.x,
        y:
          (connector.path.rectangle.from.y - position.y) *
            UNPROJECTED_TILE_SIZE +
          drawOffset.y
      };
    });
  }, [currentView, connector.path.rectangle, connector.anchors, drawOffset]);

  return (
    <>
      {anchorPositions.map((anchor) => {
        return (
          <g key={anchor.id}>
            <Circle
              tile={anchor}
              radius={18}
              fill={theme.customVars.customPalette.diagramBg}
              fillOpacity={0.7}
            />
            <Circle
              tile={anchor}
              radius={12}
              stroke={theme.palette.text.primary}
              fill={theme.customVars.customPalette.diagramBg}
              strokeWidth={6}
            />
          </g>
        );
      })}
    </>
  );
};

// Memoized: the merged connector prop is identity-stable (per-item merge
// cache in useScene) unless this connector actually changed. All hooks run
// before the early return — the previous version returned above its hooks,
// which crashes when a connector's scene entry briefly disappears.
export const Connector = memo(({ connector, isSelected }: Props) => {
  const theme = useTheme();
  const color = useColor(connector.color);
  const hasPath = Boolean(connector.path);

  const { css, pxSize } = useIsoProjection({
    from: connector.path?.rectangle?.from ?? { x: 0, y: 0 },
    to: connector.path?.rectangle?.to ?? { x: 0, y: 0 }
  });

  const drawOffset = useMemo(() => {
    return {
      x: UNPROJECTED_TILE_SIZE / 2,
      y: UNPROJECTED_TILE_SIZE / 2
    };
  }, []);

  const pathString = useMemo(() => {
    if (!hasPath) return '';

    return connector.path.tiles.reduce((acc, tile) => {
      return `${acc} ${tile.x * UNPROJECTED_TILE_SIZE + drawOffset.x},${
        tile.y * UNPROJECTED_TILE_SIZE + drawOffset.y
      }`;
    }, '');
  }, [hasPath, connector.path?.tiles, drawOffset]);

  const directionIcon = useMemo(() => {
    if (!hasPath) return null;

    return getConnectorDirectionIcon(connector.path.tiles);
  }, [hasPath, connector.path?.tiles]);

  const connectorWidthPx = useMemo(() => {
    return (UNPROJECTED_TILE_SIZE / 100) * connector.width;
  }, [connector.width]);

  const strokeDashArray = useMemo(() => {
    switch (connector.style) {
      case 'DASHED':
        return `${connectorWidthPx * 2}, ${connectorWidthPx * 2}`;
      case 'DOTTED':
        return `0, ${connectorWidthPx * 1.8}`;
      case 'SOLID':
      default:
        return 'none';
    }
  }, [connector.style, connectorWidthPx]);

  if (!hasPath || !color) {
    return null;
  }

  return (
    <Box style={css}>
      <Svg
        style={{
          // TODO: The original x coordinates of each tile seems to be calculated wrongly.
          // They are mirrored along the x-axis.  The hack below fixes this, but we should
          // try to fix this issue at the root of the problem (might have further implications).
          transform: 'scale(-1, 1)'
        }}
        viewboxSize={pxSize}
      >
        <polyline
          points={pathString}
          stroke={theme.customVars.customPalette.diagramBg}
          strokeWidth={connectorWidthPx * 1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={0.7}
          strokeDasharray={strokeDashArray}
          fill="none"
        />
        <polyline
          points={pathString}
          stroke={getColorVariant(color.value, 'dark', { grade: 1 })}
          strokeWidth={connectorWidthPx}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={strokeDashArray}
          fill="none"
        />

        {isSelected && (
          <SelectedConnectorAnchors
            connector={connector}
            drawOffset={drawOffset}
          />
        )}

        {directionIcon && connector.showArrow !== false && (
          <g transform={`translate(${directionIcon.x}, ${directionIcon.y})`}>
            <g transform={`rotate(${directionIcon.rotation})`}>
              <polygon
                fill={theme.palette.text.primary}
                stroke={theme.customVars.customPalette.diagramBg}
                strokeWidth={4}
                points="17.58,17.01 0,-17.01 -17.58,17.01"
              />
            </g>
          </g>
        )}
      </Svg>
    </Box>
  );
});

Connector.displayName = 'Connector';
