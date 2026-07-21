import React from 'react';
import { MenuItem, Select } from '@mui/material';
import { ItemReference } from 'src/types';
import { BASE_LAYER_ID } from 'src/schemas/views';
import { useScene } from 'src/hooks/useScene';
import { Section } from '../components/Section';

interface Props {
  item: ItemReference;
  layerId?: string;
}

// Per-entity layer assignment, embedded in each item controls panel. Hidden
// entirely while the diagram has no named layers.
export const LayerSelect = ({ item, layerId }: Props) => {
  const { layers, setItemsLayer } = useScene();

  const namedLayers = layers.filter((layer) => {
    return layer.id !== BASE_LAYER_ID;
  });

  if (namedLayers.length === 0) return null;

  return (
    <Section title="Layer">
      <Select
        size="small"
        fullWidth
        value={layerId ?? BASE_LAYER_ID}
        onChange={(e) => {
          const value = e.target.value as string;

          setItemsLayer([item], value === BASE_LAYER_ID ? null : value);
        }}
      >
        <MenuItem value={BASE_LAYER_ID}>Base</MenuItem>
        {namedLayers.map((layer) => {
          return (
            <MenuItem key={layer.id} value={layer.id}>
              {layer.name}
            </MenuItem>
          );
        })}
      </Select>
    </Section>
  );
};
