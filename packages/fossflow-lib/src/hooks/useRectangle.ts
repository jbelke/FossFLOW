import { useMemo } from 'react';
import { getItemById } from 'src/utils';
import { RECTANGLE_DEFAULTS } from 'src/config';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';

export const useRectangle = (id: string) => {
  const currentViewId = useUiStateStore((state) => {
    return state.view;
  });
  const viewRectangle = useModelStore((state) => {
    const view =
      getItemById(state.views, currentViewId)?.value ?? state.views[0];

    if (!view?.rectangles) return null;
    return getItemById(view.rectangles, id)?.value ?? null;
  });

  return useMemo(() => {
    if (!viewRectangle) return null;

    return {
      ...RECTANGLE_DEFAULTS,
      ...viewRectangle
    };
  }, [viewRectangle]);
};
