import { z } from 'zod';
import { id, constrainedStrings, coords, organizationFields } from './common';
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
// parentId nests a layer inside another layer, turning the flat list into a
// folder tree. It is user-supplied JSON, so nothing may assume it is acyclic —
// see resolveInherited() in src/utils/layers.ts. isCollapsed is the object
// tree's disclosure state, persisted so a reopened document looks the same.
export const layerSchema = z.object({
  id,
  name: constrainedStrings.name,
  isVisible: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  parentId: id.optional(),
  isCollapsed: z.boolean().optional()
});

// A group binds a set of entities so they move, hide, lock and delete as one.
// layerId is authoritative: every member's layerId is normalized to the
// group's when the group is created or joined, so a group never straddles two
// layers. parentId nests groups; same no-cycles-assumed caveat as layers.
export const groupSchema = z.object({
  id,
  name: constrainedStrings.name,
  isVisible: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  layerId: id.optional(),
  parentId: id.optional(),
  isCollapsed: z.boolean().optional()
});

export const viewItemSchema = z.object({
  id,
  tile: coords,
  labelHeight: z.number().optional(),
  ...organizationFields
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
  layers: z.array(layerSchema).optional(),
  groups: z.array(groupSchema).optional()
});

export const viewsSchema = z.array(viewSchema);
