import { getItemById } from 'src/utils';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';

export const useViewItem = (id: string) => {
  const currentViewId = useUiStateStore((state) => {
    return state.view;
  });

  return useModelStore((state) => {
    const view =
      getItemById(state.views, currentViewId)?.value ?? state.views[0];

    if (!view?.items) return null;
    return getItemById(view.items, id)?.value ?? null;
  });
};
