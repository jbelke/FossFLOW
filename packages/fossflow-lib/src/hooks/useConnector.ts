import { useMemo } from 'react';
import { getItemById } from 'src/utils';
import { CONNECTOR_DEFAULTS } from 'src/config';
import { useModelStore } from 'src/stores/modelStore';
import { useSceneStore } from 'src/stores/sceneStore';
import { useUiStateStore } from 'src/stores/uiStateStore';

export const useConnector = (id: string) => {
  const currentViewId = useUiStateStore((state) => {
    return state.view;
  });
  const viewConnector = useModelStore((state) => {
    const view =
      getItemById(state.views, currentViewId)?.value ?? state.views[0];

    if (!view?.connectors) return null;
    return getItemById(view.connectors, id)?.value ?? null;
  });
  const sceneConnector = useSceneStore((state) => {
    return state.connectors[id];
  });

  return useMemo(() => {
    if (!viewConnector) return null;

    return {
      ...CONNECTOR_DEFAULTS,
      ...viewConnector,
      ...sceneConnector
    };
  }, [viewConnector, sceneConnector]);
};
