import { getItemById } from 'src/utils';
import { useModelStore } from 'src/stores/modelStore';

export const useColor = (colorId?: string) => {
  return useModelStore((state) => {
    if (colorId === undefined) {
      return state.colors.length > 0 ? state.colors[0] : null;
    }

    return getItemById(state.colors, colorId)?.value ?? null;
  });
};
