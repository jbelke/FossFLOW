import { useCallback, useMemo, useRef } from 'react';
import {
  ModelItem,
  ViewItem,
  Connector,
  TextBox,
  Rectangle,
  ItemReference,
  Layer,
  LayerOrderingAction,
  SceneConnector,
  SceneTextBox
} from 'src/types';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useSceneStore, useSceneStoreApi } from 'src/stores/sceneStore';
import * as reducers from 'src/stores/reducers';
import type { State } from 'src/stores/reducers/types';
import {
  getItemByIdOrThrow,
  computeVisibility,
  getEffectiveLayerId
} from 'src/utils';
import {
  CONNECTOR_DEFAULTS,
  RECTANGLE_DEFAULTS,
  TEXTBOX_DEFAULTS
} from 'src/config';

// Subscriptions here are slice-level on purpose: subscribing to the whole
// stores made every mutation (and every history push) re-render every
// useScene consumer. State slices are selected narrowly; mutations read the
// full stores non-reactively via the store APIs at call time.
export const useScene = () => {
  const views = useModelStore((state) => {
    return state.views;
  });
  const modelColors = useModelStore((state) => {
    return state.colors;
  });
  const modelActions = useModelStore((state) => {
    return state.actions;
  });
  const sceneConnectors = useSceneStore((state) => {
    return state.connectors;
  });
  const sceneTextBoxes = useSceneStore((state) => {
    return state.textBoxes;
  });
  const sceneActions = useSceneStore((state) => {
    return state.actions;
  });
  const modelApi = useModelStoreApi();
  const sceneApi = useSceneStoreApi();
  const currentViewId = useUiStateStore((state) => {
    return state.view;
  });
  const transactionInProgress = useRef(false);
  // Per-item merge caches: a merged entity keeps its object identity unless
  // its own view record or scene record changed, so memoized item components
  // can bail out when a sibling changes.
  const connectorCacheRef = useRef(
    new Map<
      string,
      {
        viewRef: Connector;
        sceneRef: SceneConnector | undefined;
        merged: typeof CONNECTOR_DEFAULTS & Connector & SceneConnector;
      }
    >()
  );
  const textBoxCacheRef = useRef(
    new Map<
      string,
      {
        viewRef: TextBox;
        sceneRef: SceneTextBox | undefined;
        merged: typeof TEXTBOX_DEFAULTS & TextBox & SceneTextBox;
      }
    >()
  );
  const rectangleCacheRef = useRef(
    new Map<
      string,
      {
        viewRef: Rectangle;
        merged: typeof RECTANGLE_DEFAULTS & Rectangle;
      }
    >()
  );

  const currentView = useMemo(() => {
    // Handle case where view doesn't exist yet or stores aren't initialized
    if (!views || !currentViewId) {
      return {
        id: '',
        name: 'Default View',
        items: [],
        connectors: [],
        rectangles: [],
        textBoxes: []
      };
    }

    try {
      return getItemByIdOrThrow(views, currentViewId).value;
    } catch (error) {
      // console.warn(`View "${currentViewId}" not found, using fallback`);
      // Return first available view or empty view
      return (
        views[0] || {
          id: currentViewId,
          name: 'Default View',
          items: [],
          connectors: [],
          rectangles: [],
          textBoxes: []
        }
      );
    }
  }, [currentViewId, views]);

  const items = useMemo(() => {
    return currentView.items ?? [];
  }, [currentView.items]);

  const colors = useMemo(() => {
    return modelColors ?? [];
  }, [modelColors]);

  const connectors = useMemo(() => {
    const cache = connectorCacheRef.current;

    return (currentView.connectors ?? []).map((connector) => {
      const sceneConnector = sceneConnectors?.[connector.id];
      const cached = cache.get(connector.id);

      if (
        cached &&
        cached.viewRef === connector &&
        cached.sceneRef === sceneConnector
      ) {
        return cached.merged;
      }

      const merged = {
        ...CONNECTOR_DEFAULTS,
        ...connector,
        ...sceneConnector
      };

      cache.set(connector.id, {
        viewRef: connector,
        sceneRef: sceneConnector,
        merged
      });
      return merged;
    });
  }, [currentView.connectors, sceneConnectors]);

  const rectangles = useMemo(() => {
    const cache = rectangleCacheRef.current;

    return (currentView.rectangles ?? []).map((rectangle) => {
      const cached = cache.get(rectangle.id);

      if (cached && cached.viewRef === rectangle) {
        return cached.merged;
      }

      const merged = {
        ...RECTANGLE_DEFAULTS,
        ...rectangle
      };

      cache.set(rectangle.id, { viewRef: rectangle, merged });
      return merged;
    });
  }, [currentView.rectangles]);

  const textBoxes = useMemo(() => {
    const cache = textBoxCacheRef.current;

    return (currentView.textBoxes ?? []).map((textBox) => {
      const sceneTextBox = sceneTextBoxes?.[textBox.id];
      const cached = cache.get(textBox.id);

      if (
        cached &&
        cached.viewRef === textBox &&
        cached.sceneRef === sceneTextBox
      ) {
        return cached.merged;
      }

      const merged = {
        ...TEXTBOX_DEFAULTS,
        ...textBox,
        ...sceneTextBox
      };

      cache.set(textBox.id, {
        viewRef: textBox,
        sceneRef: sceneTextBox,
        merged
      });
      return merged;
    });
  }, [currentView.textBoxes, sceneTextBoxes]);

  const layers = useMemo(() => {
    return currentView.layers ?? [];
  }, [currentView.layers]);

  const visibility = useMemo(() => {
    return computeVisibility(currentView);
  }, [currentView]);

  // The plain items/connectors/rectangles/textBoxes arrays above stay
  // complete: id lookups (panels, per-item hooks) must keep resolving
  // entities on hidden layers. Only rendering and hit-testing consume the
  // visible* variants — hidden entities unmount entirely, which is the
  // layers perf win. When nothing is hidden the same array refs are returned
  // so memoized consumers see no change.
  const visibleItems = useMemo(() => {
    if (visibility.hiddenLayerIds.size === 0) return items;

    return items.filter((viewItem) => {
      return !visibility.hiddenLayerIds.has(getEffectiveLayerId(viewItem));
    });
  }, [items, visibility]);

  const visibleConnectors = useMemo(() => {
    if (visibility.hiddenConnectorIds.size === 0) return connectors;

    return connectors.filter((connector) => {
      return !visibility.hiddenConnectorIds.has(connector.id);
    });
  }, [connectors, visibility]);

  const visibleRectangles = useMemo(() => {
    if (visibility.hiddenLayerIds.size === 0) return rectangles;

    return rectangles.filter((rectangle) => {
      return !visibility.hiddenLayerIds.has(getEffectiveLayerId(rectangle));
    });
  }, [rectangles, visibility]);

  const visibleTextBoxes = useMemo(() => {
    if (visibility.hiddenLayerIds.size === 0) return textBoxes;

    return textBoxes.filter((textBox) => {
      return !visibility.hiddenLayerIds.has(getEffectiveLayerId(textBox));
    });
  }, [textBoxes, visibility]);

  // Reads the stores non-reactively, so this callback (and every mutation
  // callback built on it) keeps a stable identity across renders.
  const getState = useCallback(() => {
    const modelState = modelApi.getState();
    const sceneState = sceneApi.getState();

    return {
      model: {
        version: modelState.version ?? '',
        title: modelState.title ?? '',
        description: modelState.description,
        colors: modelState.colors ?? [],
        icons: modelState.icons ?? [],
        items: modelState.items ?? [],
        views: modelState.views ?? []
      },
      scene: {
        connectors: sceneState.connectors ?? {},
        textBoxes: sceneState.textBoxes ?? {}
      }
    };
  }, [modelApi, sceneApi]);

  const setState = useCallback(
    (newState: State) => {
      modelActions.set(newState.model, true); // Skip history since we're managing it here
      sceneActions.set(newState.scene, true); // Skip history since we're managing it here
    },
    [modelActions, sceneActions]
  );

  const saveToHistoryBeforeChange = useCallback(() => {
    // Prevent multiple saves during grouped operations
    if (transactionInProgress.current) {
      return;
    }

    modelActions.saveToHistory();
    sceneActions.saveToHistory();
  }, [modelActions, sceneActions]);

  const createModelItem = useCallback(
    (newModelItem: ModelItem) => {
      if (!transactionInProgress.current) {
        saveToHistoryBeforeChange();
      }

      const newState = reducers.createModelItem(newModelItem, getState());
      setState(newState);
      return newState; // Return the new state for chaining
    },
    [
      getState,
      setState,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const updateModelItem = useCallback(
    (id: string, updates: Partial<ModelItem>) => {
      saveToHistoryBeforeChange();
      const newState = reducers.updateModelItem(id, updates, getState());
      setState(newState);
    },
    [
      getState,
      setState,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const deleteModelItem = useCallback(
    (id: string) => {
      saveToHistoryBeforeChange();
      const newState = reducers.deleteModelItem(id, getState());
      setState(newState);
    },
    [
      getState,
      setState,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const createViewItem = useCallback(
    (newViewItem: ViewItem, currentState?: State) => {
      if (!currentViewId) return;

      if (!transactionInProgress.current) {
        saveToHistoryBeforeChange();
      }

      // Use provided state or get current state
      const stateToUse = currentState || getState();

      const newState = reducers.view({
        action: 'CREATE_VIEWITEM',
        payload: newViewItem,
        ctx: { viewId: currentViewId, state: stateToUse }
      });
      setState(newState);
      return newState;
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const updateViewItem = useCallback(
    (id: string, updates: Partial<ViewItem>) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'UPDATE_VIEWITEM',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const deleteViewItem = useCallback(
    (id: string) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_VIEWITEM',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const createConnector = useCallback(
    (newConnector: Connector) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'CREATE_CONNECTOR',
        payload: newConnector,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const updateConnector = useCallback(
    (id: string, updates: Partial<Connector>) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'UPDATE_CONNECTOR',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const deleteConnector = useCallback(
    (id: string) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_CONNECTOR',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const createTextBox = useCallback(
    (newTextBox: TextBox) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'CREATE_TEXTBOX',
        payload: newTextBox,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const updateTextBox = useCallback(
    (id: string, updates: Partial<TextBox>) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'UPDATE_TEXTBOX',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const deleteTextBox = useCallback(
    (id: string) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_TEXTBOX',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const createRectangle = useCallback(
    (newRectangle: Rectangle) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'CREATE_RECTANGLE',
        payload: newRectangle,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const updateRectangle = useCallback(
    (id: string, updates: Partial<Rectangle>) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'UPDATE_RECTANGLE',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const deleteRectangle = useCallback(
    (id: string) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_RECTANGLE',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const changeLayerOrder = useCallback(
    (action: LayerOrderingAction, item: ItemReference) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'CHANGE_LAYER_ORDER',
        payload: { action, item },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const createLayer = useCallback(
    (newLayer: Layer) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'CREATE_LAYER',
        payload: newLayer,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const updateLayer = useCallback(
    (id: string, updates: Partial<Layer>) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'UPDATE_LAYER',
        payload: { id, ...updates },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const deleteLayer = useCallback(
    (id: string) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'DELETE_LAYER',
        payload: id,
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const setItemsLayer = useCallback(
    (itemRefs: ItemReference[], layerId: string | null) => {
      if (!currentViewId) return;

      saveToHistoryBeforeChange();
      const newState = reducers.view({
        action: 'SET_ITEMS_LAYER',
        payload: { items: itemRefs, layerId },
        ctx: { viewId: currentViewId, state: getState() }
      });
      setState(newState);
    },
    [
      getState,
      setState,
      currentViewId,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  const transaction = useCallback(
    (operations: () => void) => {
      // Prevent nested transactions
      if (transactionInProgress.current) {
        operations();
        return;
      }

      // Save state before transaction
      saveToHistoryBeforeChange();

      // Mark transaction as in progress
      transactionInProgress.current = true;

      try {
        // Execute all operations without saving intermediate history
        operations();
      } finally {
        // Always reset transaction state
        transactionInProgress.current = false;
      }
    },
    [saveToHistoryBeforeChange]
  );

  const placeIcon = useCallback(
    (params: { modelItem: ModelItem; viewItem: ViewItem }) => {
      // Save history before the transaction
      saveToHistoryBeforeChange();

      // Mark transaction as in progress
      transactionInProgress.current = true;

      try {
        // Create model item first and get the updated state
        const stateAfterModelItem = createModelItem(params.modelItem);

        // Create view item using the updated state
        if (stateAfterModelItem) {
          createViewItem(params.viewItem, stateAfterModelItem);
        }
      } finally {
        // Always reset transaction state
        transactionInProgress.current = false;
      }
    },
    [
      createModelItem,
      createViewItem,
      saveToHistoryBeforeChange,
      modelActions,
      sceneActions
    ]
  );

  return {
    items,
    connectors,
    colors,
    rectangles,
    textBoxes,
    layers,
    visibility,
    visibleItems,
    visibleConnectors,
    visibleRectangles,
    visibleTextBoxes,
    currentView,
    createModelItem,
    updateModelItem,
    deleteModelItem,
    createViewItem,
    updateViewItem,
    deleteViewItem,
    createConnector,
    updateConnector,
    deleteConnector,
    createTextBox,
    updateTextBox,
    deleteTextBox,
    createRectangle,
    updateRectangle,
    deleteRectangle,
    changeLayerOrder,
    createLayer,
    updateLayer,
    deleteLayer,
    setItemsLayer,
    transaction,
    placeIcon
  };
};
