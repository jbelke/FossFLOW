import { z } from 'zod';
import { id, constrainedStrings, coords } from './common';
import { rectangleSchema } from './rectangle';
import { connectorSchema } from './connector';
import { textBoxSchema } from './textBox';

// Entities with no layerId belong to the implicit base layer. The base layer
// has no record in view.layers until the user first toggles its visibility or
// lock, and layerId === BASE_LAYER_ID is never written onto entities — so
// documents that never touch layers keep their pre-layers shape exactly.
export const BASE_LAYER_ID = '__BASE__';

// isVisible/isLocked stay optional with NO zod defaults: the load path keeps
// the caller's original object and discards the parse output, so defaults
// here would never materialize. undefined ⇒ visible / unlocked (see
// src/utils/layers.ts).
export const layerSchema = z.object({
  id,
  name: constrainedStrings.name,
  isVisible: z.boolean().optional(),
  isLocked: z.boolean().optional()
});

export const viewItemSchema = z.object({
  id,
  tile: coords,
  labelHeight: z.number().optional(),
  layerId: id.optional()
});

export const viewSchema = z.object({
  id,
  lastUpdated: z.string().datetime().optional(),
  name: constrainedStrings.name,
  description: constrainedStrings.description.optional(),
  items: z.array(viewItemSchema),
  rectangles: z.array(rectangleSchema).optional(),
  connectors: z.array(connectorSchema).optional(),
  textBoxes: z.array(textBoxSchema).optional(),
  layers: z.array(layerSchema).optional()
});

export const viewsSchema = z.array(viewSchema);
