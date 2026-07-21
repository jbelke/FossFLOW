import { ModelItem } from 'src/types';
import { useModelStore } from 'src/stores/modelStore';
import { getItemById } from 'src/utils';

// Selects just this item: immer structural sharing keeps the item ref stable
// unless the item itself changed, so other items' mutations don't re-render
// this consumer.
export const useModelItem = (id: string): ModelItem | null => {
  return useModelStore((state) => {
    return getItemById(state.items, id)?.value ?? null;
  });
};
