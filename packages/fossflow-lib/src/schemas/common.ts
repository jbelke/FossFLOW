import { z } from 'zod';

export const coords = z.object({
  x: z.number(),
  y: z.number()
});

export const id = z.string();
export const color = z.string();

export const constrainedStrings = {
  name: z.string().max(100),
  description: z.string().max(1000)
};

// Fields every organizable entity (view item, connector, rectangle, text box)
// carries: which layer and group it belongs to, plus its own visibility and
// lock overrides. All optional, and absent means "inherit from my layer/group"
// — so an entity that has never been organized serializes exactly as it did
// before layers and groups existed. Lives here rather than in views.ts because
// rectangle/connector/textBox schemas are imported *by* views.ts.
export const organizationFields = {
  layerId: id.optional(),
  groupId: id.optional(),
  isVisible: z.boolean().optional(),
  isLocked: z.boolean().optional()
};
