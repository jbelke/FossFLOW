import { useCallback, useEffect, useRef } from 'react';
import { useModelStoreApi } from 'src/stores/modelStore';
import {
  useUiStateStore,
  useUiStateStoreApi
} from 'src/stores/uiStateStore';
import { ModeActions, State, SlimMouseEvent, Coords } from 'src/types';
import { DialogTypeEnum } from 'src/types/ui';
import {
  getMouse,
  getItemAtTile,
  generateId,
  resolveLayerId
} from 'src/utils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { useScene } from 'src/hooks/useScene';
import { useHistory } from 'src/hooks/useHistory';
import { useNodeActions } from 'src/hooks/useNodeActions';
import { HOTKEY_PROFILES } from 'src/config/hotkeys';
import { TEXTBOX_DEFAULTS } from 'src/config';
import { Cursor } from './modes/Cursor';
import { DragItems } from './modes/DragItems';
import { DrawRectangle } from './modes/Rectangle/DrawRectangle';
import { TransformRectangle } from './modes/Rectangle/TransformRectangle';
import { Connector } from './modes/Connector';
import { Pan } from './modes/Pan';
import { PlaceIcon } from './modes/PlaceIcon';
import { TextBox } from './modes/TextBox';
import { usePanHandlers } from './usePanHandlers';

const modes: { [k in string]: ModeActions } = {
  CURSOR: Cursor,
  DRAG_ITEMS: DragItems,
  'RECTANGLE.DRAW': DrawRectangle,
  'RECTANGLE.TRANSFORM': TransformRectangle,
  CONNECTOR: Connector,
  PAN: Pan,
  PLACE_ICON: PlaceIcon,
  TEXTBOX: TextBox
};

// Arrow keys move a selected node along the two isometric grid axes.
const NUDGE_DELTAS: { [key: string]: Coords } = {
  ArrowUp: { x: 1, y: 0 },
  ArrowDown: { x: -1, y: 0 },
  ArrowLeft: { x: 0, y: 1 },
  ArrowRight: { x: 0, y: -1 }
};

const getModeFunction = (mode: ModeActions, e: SlimMouseEvent) => {
  switch (e.type) {
    case 'mousemove':
      return mode.mousemove;
    case 'mousedown':
      return mode.mousedown;
    case 'mouseup':
      return mode.mouseup;
    default:
      return null;
  }
};

// Mouse state changes on every pixel of movement, so nothing here may
// subscribe to it (or to the stores wholesale): handlers read store state at
// event time via getState() instead. Window listeners are attached once per
// renderer element through a latest-handler ref, never re-attached per render.
export const useInteractionManager = () => {
  const rendererRef = useRef<HTMLElement>();
  const reducerTypeRef = useRef<string>();
  const uiStateApi = useUiStateStoreApi();
  const modelApi = useModelStoreApi();
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const scene = useScene();
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const { undo, redo, canUndo, canRedo } = useHistory();
  const { duplicateNode, deleteNode, nudgeNode, copyNode, cutNode, pasteNode } =
    useNodeActions();
  const { createTextBox } = scene;
  const {
    handleMouseDown: handlePanMouseDown,
    handleMouseUp: handlePanMouseUp
  } = usePanHandlers();

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.closest('.ql-editor') // Quill editor
      ) {
        return;
      }

      const uiState = uiStateApi.getState();
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) {
          undo();
        }
      }

      if (
        isCtrlOrCmd &&
        (e.key.toLowerCase() === 'y' ||
          (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        if (canRedo) {
          redo();
        }
      }

      // Help dialog shortcut
      if (e.key === 'F1') {
        e.preventDefault();
        uiState.actions.setDialog(DialogTypeEnum.HELP);
      }

      // Tool hotkeys
      const hotkeyMapping = HOTKEY_PROFILES[uiState.hotkeyProfile];
      const key = e.key.toLowerCase();

      const selectedNodeId =
        uiState.itemControls &&
        'id' in uiState.itemControls &&
        uiState.itemControls.type === 'ITEM'
          ? uiState.itemControls.id
          : null;

      // Escape always backs out of the current selection/context menu.
      if (e.key === 'Escape') {
        e.preventDefault();
        uiState.actions.setRenamingItemId(null);
        uiState.actions.setItemControls(null);
        uiState.actions.setContextMenu(null);
        uiState.actions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
        return;
      }

      // Everything that mutates the diagram is editor-only. Read-only modes
      // still allow selection, so mode alone is not a sufficient guard.
      const canEdit = uiState.editorMode === 'EDITABLE';

      // Paste needs no selection, just a clipboard and a mouse position.
      if (canEdit && isCtrlOrCmd && key === 'v') {
        e.preventDefault();
        const pastedId = pasteNode(uiState.mouse.position.tile);
        if (pastedId) {
          uiState.actions.setItemControls({ type: 'ITEM', id: pastedId });
        }
        return;
      }

      if (selectedNodeId) {
        // Copying mutates nothing, so it stays available in read-only modes.
        if (isCtrlOrCmd && key === 'c') {
          e.preventDefault();
          copyNode(selectedNodeId);
          return;
        }

        if (canEdit && isCtrlOrCmd && key === 'd') {
          e.preventDefault();
          const newId = duplicateNode(selectedNodeId);
          if (newId) {
            uiState.actions.setItemControls({ type: 'ITEM', id: newId });
          }
          return;
        }

        if (canEdit && isCtrlOrCmd && key === 'x') {
          e.preventDefault();
          cutNode(selectedNodeId);
          return;
        }

        if (canEdit && (e.key === 'Delete' || e.key === 'Backspace')) {
          e.preventDefault();
          deleteNode(selectedNodeId);
          return;
        }

        if (canEdit && (e.key === 'F2' || e.key === 'Enter')) {
          e.preventDefault();
          uiState.actions.setRenamingItemId(selectedNodeId);
          return;
        }

        const nudge = NUDGE_DELTAS[e.key];

        if (canEdit && nudge && !isCtrlOrCmd) {
          e.preventDefault();
          nudgeNode(selectedNodeId, nudge);
          return;
        }
      }

      // Everything below is an unmodified single-key tool shortcut.
      if (isCtrlOrCmd) return;

      // Quick icon selection for selected node (when ItemControls is an ItemReference with type 'ITEM')
      if (key === 'i' && selectedNodeId) {
        e.preventDefault();
        // Trigger icon change mode
        const event = new CustomEvent('quickIconChange');
        window.dispatchEvent(event);
      }

      // Check if key matches any hotkey
      if (hotkeyMapping.select && key === hotkeyMapping.select) {
        e.preventDefault();
        uiState.actions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
      } else if (hotkeyMapping.pan && key === hotkeyMapping.pan) {
        e.preventDefault();
        uiState.actions.setMode({
          type: 'PAN',
          showCursor: false
        });
        uiState.actions.setItemControls(null);
      } else if (hotkeyMapping.addItem && key === hotkeyMapping.addItem) {
        e.preventDefault();
        uiState.actions.setItemControls({
          type: 'ADD_ITEM'
        });
        uiState.actions.setMode({
          type: 'PLACE_ICON',
          showCursor: true,
          id: null
        });
      } else if (hotkeyMapping.rectangle && key === hotkeyMapping.rectangle) {
        e.preventDefault();
        uiState.actions.setMode({
          type: 'RECTANGLE.DRAW',
          showCursor: true,
          id: null
        });
      } else if (hotkeyMapping.connector && key === hotkeyMapping.connector) {
        e.preventDefault();
        uiState.actions.setMode({
          type: 'CONNECTOR',
          id: null,
          showCursor: true
        });
      } else if (hotkeyMapping.text && key === hotkeyMapping.text) {
        e.preventDefault();
        const textBoxId = generateId();
        const layerId = resolveLayerId(
          scene.currentView,
          uiState.activeLayerId
        );
        createTextBox({
          ...TEXTBOX_DEFAULTS,
          id: textBoxId,
          tile: uiState.mouse.position.tile,
          ...(layerId ? { layerId } : {})
        });
        uiState.actions.setMode({
          type: 'TEXTBOX',
          showCursor: false,
          id: textBoxId
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      return window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    undo,
    redo,
    canUndo,
    canRedo,
    uiStateApi,
    createTextBox,
    duplicateNode,
    deleteNode,
    nudgeNode,
    copyNode,
    cutNode,
    pasteNode
  ]);

  const onMouseEvent = (e: SlimMouseEvent) => {
    if (!rendererRef.current) return;

    const prevUiState = uiStateApi.getState();

    if (prevUiState.mode.type === 'INTERACTIONS_DISABLED') return;

    // Check pan handlers first
    if (e.type === 'mousedown' && handlePanMouseDown(e)) {
      return;
    }
    if (e.type === 'mouseup' && handlePanMouseUp(e)) {
      return;
    }

    const mode = modes[prevUiState.mode.type];
    const modeFunction = getModeFunction(mode, e);

    if (!modeFunction) return;

    const nextMouse = getMouse({
      interactiveElement: rendererRef.current,
      zoom: prevUiState.zoom,
      scroll: prevUiState.scroll,
      lastMouse: prevUiState.mouse,
      mouseEvent: e,
      rendererSize
    });

    prevUiState.actions.setMouse(nextMouse);

    const baseState: State = {
      model: modelApi.getState(),
      scene,
      uiState: uiStateApi.getState(),
      rendererRef: rendererRef.current,
      rendererSize,
      isRendererInteraction: rendererRef.current === e.target
    };

    if (reducerTypeRef.current !== prevUiState.mode.type) {
      const prevReducer = reducerTypeRef.current
        ? modes[reducerTypeRef.current]
        : null;

      if (prevReducer && prevReducer.exit) {
        prevReducer.exit(baseState);
      }

      if (mode.entry) {
        mode.entry(baseState);
      }
    }

    modeFunction(baseState);
    reducerTypeRef.current = prevUiState.mode.type;
  };

  const onContextMenu = (e: SlimMouseEvent) => {
    e.preventDefault();

    const uiState = uiStateApi.getState();

    if (uiState.mode.type === 'INTERACTIONS_DISABLED') return;

    // Don't show context menu if right-click pan is enabled
    if (uiState.panSettings.rightClickPan) {
      return;
    }

    const itemAtTile = getItemAtTile({
      tile: uiState.mouse.position.tile,
      scene,
      filter: 'VISIBLE_UNLOCKED'
    });

    if (itemAtTile) {
      uiState.actions.setContextMenu({
        type: 'ITEM',
        item: itemAtTile,
        tile: uiState.mouse.position.tile
      });
    } else {
      uiState.actions.setContextMenu({
        type: 'EMPTY',
        tile: uiState.mouse.position.tile
      });
    }
  };

  // Double-clicking a node renames it in place.
  const onDoubleClick = () => {
    const uiState = uiStateApi.getState();

    if (uiState.mode.type === 'INTERACTIONS_DISABLED') return;
    if (uiState.editorMode !== 'EDITABLE') return;

    const itemAtTile = getItemAtTile({
      tile: uiState.mouse.position.tile,
      scene,
      filter: 'VISIBLE_UNLOCKED'
    });

    if (itemAtTile?.type === 'ITEM') {
      uiState.actions.setItemControls(itemAtTile);
      uiState.actions.setRenamingItemId(itemAtTile.id);
    }
  };

  // The listeners below are attached once and dispatch through this ref, so
  // the handlers always see the latest render's closures (scene etc.) without
  // the listeners themselves ever churning.
  const handlersRef = useRef({ onMouseEvent, onContextMenu, onDoubleClick });

  useEffect(() => {
    handlersRef.current = { onMouseEvent, onContextMenu, onDoubleClick };
  });

  useEffect(() => {
    const el = window;

    const handleMouseEvent = (e: MouseEvent) => {
      handlersRef.current.onMouseEvent(e);
    };

    const handleContextMenu = (e: MouseEvent) => {
      handlersRef.current.onContextMenu(e);
    };

    const handleDoubleClick = () => {
      handlersRef.current.onDoubleClick();
    };

    const onTouchStart = (e: TouchEvent) => {
      handlersRef.current.onMouseEvent({
        ...e,
        clientX: Math.floor(e.touches[0].clientX),
        clientY: Math.floor(e.touches[0].clientY),
        type: 'mousedown',
        button: 0
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      handlersRef.current.onMouseEvent({
        ...e,
        clientX: Math.floor(e.touches[0].clientX),
        clientY: Math.floor(e.touches[0].clientY),
        type: 'mousemove',
        button: 0
      });
    };

    const onTouchEnd = (e: TouchEvent) => {
      handlersRef.current.onMouseEvent({
        ...e,
        clientX: 0,
        clientY: 0,
        type: 'mouseup',
        button: 0
      });
    };

    const onScroll = (e: WheelEvent) => {
      const { mode, actions } = uiStateApi.getState();

      if (mode.type === 'INTERACTIONS_DISABLED') return;

      if (e.deltaY > 0) {
        actions.decrementZoom();
      } else {
        actions.incrementZoom();
      }
    };

    el.addEventListener('mousemove', handleMouseEvent);
    el.addEventListener('mousedown', handleMouseEvent);
    el.addEventListener('mouseup', handleMouseEvent);
    el.addEventListener('contextmenu', handleContextMenu);
    el.addEventListener('dblclick', handleDoubleClick);
    el.addEventListener('touchstart', onTouchStart);
    el.addEventListener('touchmove', onTouchMove);
    el.addEventListener('touchend', onTouchEnd);
    rendererEl?.addEventListener('wheel', onScroll);

    return () => {
      el.removeEventListener('mousemove', handleMouseEvent);
      el.removeEventListener('mousedown', handleMouseEvent);
      el.removeEventListener('mouseup', handleMouseEvent);
      el.removeEventListener('contextmenu', handleContextMenu);
      el.removeEventListener('dblclick', handleDoubleClick);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      rendererEl?.removeEventListener('wheel', onScroll);
    };
  }, [rendererEl, uiStateApi]);

  const setInteractionsElement = useCallback((element: HTMLElement) => {
    rendererRef.current = element;
  }, []);

  return {
    setInteractionsElement
  };
};
