import { useCallback } from 'react';
import type { Coords, ItemReference, ItemReferenceType } from 'src/types';
import { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { CoordsUtils, getItemById, getGroupMemberRefs } from 'src/utils';

/**
 * Kind-agnostic operations on a set of entities.
 *
 * The keyboard handler used to reach for node-specific helpers, which is why
 * Delete and the arrow keys silently did nothing on a rectangle, a text box or
 * a multi-selection. Everything here dispatches on ItemReference.type instead,
 * so one shortcut covers every kind the canvas can hold.
 */
export const useEntityActions = () => {
  const scene = useScene();
  const selection = useUiStateStore((state) => {
    return state.selection;
  });
  const itemControls = useUiStateStore((state) => {
    return state.itemControls;
  });

  /**
   * What a shortcut should act on: the shared multi-selection when there is
   * one, otherwise whatever single entity has its controls panel open. A
   * selected GROUP contributes its members, so "delete the group" deletes its
   * contents rather than nothing.
   */
  const getTargets = useCallback((): ItemReference[] => {
    const refs: ItemReference[] = [];
    const seen = new Set<string>();

    const push = (ref: ItemReference) => {
      const key = `${ref.type}:${ref.id}`;

      if (seen.has(key)) return;

      seen.add(key);
      refs.push(ref);
    };

    if (selection.length > 0) {
      selection.forEach((ref) => {
        if (ref.kind === 'LAYER') return;

        if (ref.kind === 'GROUP') {
          getGroupMemberRefs(scene.currentView, ref.id).forEach(push);
          return;
        }

        push({ type: ref.kind as ItemReferenceType, id: ref.id });
      });

      return refs;
    }

    if (
      itemControls &&
      'id' in itemControls &&
      itemControls.type !== 'CONNECTOR_ANCHOR'
    ) {
      push({ type: itemControls.type, id: itemControls.id });
    }

    return refs;
  }, [selection, itemControls, scene.currentView]);

  const deleteEntities = useCallback(
    (refs: ItemReference[]) => {
      if (refs.length === 0) return;

      // One transaction so a multi-delete is a single undo step.
      scene.transaction(() => {
        refs.forEach((ref) => {
          switch (ref.type) {
            case 'ITEM':
              scene.deleteViewItem(ref.id);
              break;
            case 'CONNECTOR':
              scene.deleteConnector(ref.id);
              break;
            case 'RECTANGLE':
              scene.deleteRectangle(ref.id);
              break;
            case 'TEXTBOX':
              scene.deleteTextBox(ref.id);
              break;
            default:
              break;
          }
        });
      });
    },
    [scene]
  );

  const nudgeEntities = useCallback(
    (refs: ItemReference[], delta: Coords) => {
      if (refs.length === 0) return;

      scene.transaction(() => {
        refs.forEach((ref) => {
          if (ref.type === 'ITEM') {
            const item = getItemById(scene.items, ref.id)?.value;

            if (item) {
              scene.updateViewItem(ref.id, {
                tile: CoordsUtils.add(item.tile, delta)
              });
            }
          } else if (ref.type === 'RECTANGLE') {
            const rectangle = getItemById(scene.rectangles, ref.id)?.value;

            if (rectangle) {
              scene.updateRectangle(ref.id, {
                from: CoordsUtils.add(rectangle.from, delta),
                to: CoordsUtils.add(rectangle.to, delta)
              });
            }
          } else if (ref.type === 'TEXTBOX') {
            const textBox = getItemById(scene.textBoxes, ref.id)?.value;

            if (textBox) {
              scene.updateTextBox(ref.id, {
                tile: CoordsUtils.add(textBox.tile, delta)
              });
            }
          }
          // Connectors are anchored to the items they join, so they follow
          // rather than being nudged in their own right.
        });
      });
    },
    [scene]
  );

  /** Sets isVisible/isLocked on entities, and on selected layers and groups. */
  const setFlags = useCallback(
    (updates: { isVisible?: boolean; isLocked?: boolean }) => {
      const containers = selection.filter((ref) => {
        return ref.kind === 'LAYER' || ref.kind === 'GROUP';
      });
      const entities = getTargets();

      if (containers.length === 0 && entities.length === 0) return;

      scene.transaction(() => {
        containers.forEach((ref) => {
          if (ref.kind === 'LAYER') {
            scene.updateLayer(ref.id, updates);
          } else {
            scene.updateGroup(ref.id, updates);
          }
        });

        // A selected group already applied the flag to itself above; applying
        // it again per member would fight the cascade.
        if (containers.length > 0) return;

        entities.forEach((ref) => {
          switch (ref.type) {
            case 'ITEM':
              scene.updateViewItem(ref.id, updates);
              break;
            case 'CONNECTOR':
              scene.updateConnector(ref.id, updates);
              break;
            case 'RECTANGLE':
              scene.updateRectangle(ref.id, updates);
              break;
            case 'TEXTBOX':
              scene.updateTextBox(ref.id, updates);
              break;
            default:
              break;
          }
        });
      });
    },
    [scene, selection, getTargets]
  );

  /** True when every target already has the flag set — drives the toggles. */
  const allHaveFlag = useCallback(
    (field: 'isVisible' | 'isLocked', value: boolean): boolean => {
      const containers = selection.filter((ref) => {
        return ref.kind === 'LAYER' || ref.kind === 'GROUP';
      });

      if (containers.length > 0) {
        return containers.every((ref) => {
          const list = ref.kind === 'LAYER' ? scene.layers : scene.groups;
          const record = list.find((candidate) => {
            return candidate.id === ref.id;
          });

          return record?.[field] === value;
        });
      }

      const collections: Record<string, { id: string }[]> = {
        ITEM: scene.items,
        CONNECTOR: scene.connectors,
        RECTANGLE: scene.rectangles,
        TEXTBOX: scene.textBoxes
      };

      const targets = getTargets();

      if (targets.length === 0) return false;

      return targets.every((ref) => {
        const entity = (collections[ref.type] ?? []).find((candidate) => {
          return candidate.id === ref.id;
        }) as Record<string, unknown> | undefined;

        return entity?.[field] === value;
      });
    },
    [scene, selection, getTargets]
  );

  /** Every entity in the current view — for select-all. */
  const allEntityRefs = useCallback((): ItemReference[] => {
    const view = scene.currentView;

    return [
      ...view.items.map((entity) => {
        return { type: 'ITEM' as const, id: entity.id };
      }),
      ...(view.rectangles ?? []).map((entity) => {
        return { type: 'RECTANGLE' as const, id: entity.id };
      }),
      ...(view.textBoxes ?? []).map((entity) => {
        return { type: 'TEXTBOX' as const, id: entity.id };
      }),
      ...(view.connectors ?? []).map((entity) => {
        return { type: 'CONNECTOR' as const, id: entity.id };
      })
    ];
  }, [scene.currentView]);

  return {
    getTargets,
    deleteEntities,
    nudgeEntities,
    setFlags,
    allHaveFlag,
    allEntityRefs
  };
};
