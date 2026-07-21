import { useMemo } from 'react';
import { getItemById } from 'src/utils';
import { TEXTBOX_DEFAULTS } from 'src/config';
import { useModelStore } from 'src/stores/modelStore';
import { useSceneStore } from 'src/stores/sceneStore';
import { useUiStateStore } from 'src/stores/uiStateStore';

export const useTextBox = (id: string) => {
  const currentViewId = useUiStateStore((state) => {
    return state.view;
  });
  const viewTextBox = useModelStore((state) => {
    const view =
      getItemById(state.views, currentViewId)?.value ?? state.views[0];

    if (!view?.textBoxes) return null;
    return getItemById(view.textBoxes, id)?.value ?? null;
  });
  const sceneTextBox = useSceneStore((state) => {
    return state.textBoxes[id];
  });

  return useMemo(() => {
    if (!viewTextBox) return null;

    return {
      ...TEXTBOX_DEFAULTS,
      ...viewTextBox,
      ...sceneTextBox
    };
  }, [viewTextBox, sceneTextBox]);
};
