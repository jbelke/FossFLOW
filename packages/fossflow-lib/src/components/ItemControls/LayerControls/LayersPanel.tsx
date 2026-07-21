import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Divider,
  IconButton as MUIIconButton,
  Stack,
  Typography
} from '@mui/material';
import {
  AddOutlined as AddIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { Layer } from 'src/types';
import { BASE_LAYER_ID } from 'src/schemas/views';
import {
  generateId,
  getEffectiveLayerId,
  isLayerVisible,
  isLayerLocked
} from 'src/utils';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { ControlsContainer } from '../components/ControlsContainer';
import { Section } from '../components/Section';
import { LayerRow } from './LayerRow';

export const LayersPanel = () => {
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const activeLayerId = useUiStateStore((state) => {
    return state.activeLayerId;
  });
  const {
    layers,
    items,
    connectors,
    rectangles,
    textBoxes,
    createLayer,
    updateLayer,
    deleteLayer
  } = useScene();

  // The base layer's record exists only once toggled; synthesize the row.
  const baseRecord = layers.find((layer) => {
    return layer.id === BASE_LAYER_ID;
  });
  const baseLayer: Layer = { name: 'Base', ...baseRecord, id: BASE_LAYER_ID };
  const namedLayers = layers.filter((layer) => {
    return layer.id !== BASE_LAYER_ID;
  });

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    const tally = (entity: { layerId?: string }) => {
      const layerId = getEffectiveLayerId(entity);
      result.set(layerId, (result.get(layerId) ?? 0) + 1);
    };

    items.forEach(tally);
    connectors.forEach(tally);
    rectangles.forEach(tally);
    textBoxes.forEach(tally);
    return result;
  }, [items, connectors, rectangles, textBoxes]);

  const onAddLayer = () => {
    const id = generateId();

    createLayer({ id, name: `Layer ${namedLayers.length + 1}` });
    uiStateActions.setActiveLayerId(id);
  };

  const rowHandlers = (layer: Layer, isBase: boolean) => {
    return {
      onSelect: () => {
        uiStateActions.setActiveLayerId(isBase ? null : layer.id);
      },
      onToggleVisible: () => {
        updateLayer(layer.id, { isVisible: !isLayerVisible(layer) });
      },
      onToggleLocked: () => {
        updateLayer(layer.id, { isLocked: !isLayerLocked(layer) });
      }
    };
  };

  return (
    <ControlsContainer>
      <Box sx={{ position: 'relative' }}>
        <MUIIconButton
          aria-label="Close"
          onClick={() => {
            return uiStateActions.setItemControls(null);
          }}
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2
          }}
          size="small"
        >
          <CloseIcon />
        </MUIIconButton>
        <Section>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ pr: 4 }}
          >
            <Typography fontWeight={600}>Layers</Typography>
            <Button
              startIcon={<AddIcon />}
              size="small"
              variant="text"
              onClick={onAddLayer}
            >
              Add layer
            </Button>
          </Stack>
        </Section>
        <Section sx={{ pt: 0 }}>
          <Stack spacing={0.25}>
            <LayerRow
              layer={baseLayer}
              count={counts.get(BASE_LAYER_ID) ?? 0}
              isActive={activeLayerId === null}
              {...rowHandlers(baseLayer, true)}
            />
            {namedLayers.length > 0 && <Divider sx={{ my: 0.5 }} />}
            {namedLayers.map((layer) => {
              return (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  count={counts.get(layer.id) ?? 0}
                  isActive={activeLayerId === layer.id}
                  {...rowHandlers(layer, false)}
                  onRename={(name) => {
                    updateLayer(layer.id, { name });
                  }}
                  onDelete={() => {
                    deleteLayer(layer.id);
                    if (activeLayerId === layer.id) {
                      uiStateActions.setActiveLayerId(null);
                    }
                  }}
                />
              );
            })}
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1.5 }}
          >
            New items are added to the highlighted layer. Double-click a layer
            name to rename it.
          </Typography>
        </Section>
      </Box>
    </ControlsContainer>
  );
};
