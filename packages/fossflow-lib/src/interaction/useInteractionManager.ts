import { useCallback, useEffect, useRef } from 'react';
import { useModelStoreApi } from 'src/stores/modelStore';
import {
  useUiStateStore,
  useUiStateStoreApi
} from 'src/stores/uiStateStore';
import {
  ModeActions,
  State,
  SlimMouseEvent,
  Coords,
  ItemReferenceType,
  LayerOrderingAction
} from 'src/types';
import { DialogTypeEnum } from 'src/types/ui';
import {
  getMouse,
  getItemAtTile,
  generateId,
  resolveLayerId,
  getEntityLayerId
} from 'src/utils';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { useScene } from 'src/hooks/useScene';
import { useHistory } from 'src/hooks/useHistory';
import { useNodeActions } from 'src/hooks/useNodeActions';
import { useEntityActions } from 'src/hooks/useEntityActions';
import { useDiagramUtils } from 'src/hooks/useDiagramUtils';
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

// Arrow keys move the selection along the two isometric grid axes.
const NUDGE_DELTAS: { [key: string]: Coords } = {
  ArrowUp: { x: 1, y: 0 },
  ArrowDown: { x: -1, y: 0 },
  ArrowLeft: { x: 0, y: 1 },
  ArrowRight: { x: 0, y: -1 }
};

/** Tiles per Shift+Arrow. */
const LARGE_NUDGE = 10;

const Z_ORDER_KEYS: {
  [key: string]: { step: LayerOrderingAction; extreme: LayerOrderingAction };
} = {
  ']': { step: 'BRING_FORWARD', extreme: 'BRING_TO_FRONT' },
  '[': { step: 'SEND_BACKWARD', extreme: 'SEND_TO_BACK' }
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
  const { duplicateNode, copyNode, cutNode, pasteNode } = useNodeActions();
  const {
    getTargets,
    deleteEntities,
    nudgeEntities,
    setFlags,
    allHaveFlag,
    allEntityRefs
  } = useEntityActions();
  const { fitToView } = useDiagramUtils();
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
        uiState.actions.setSelection([]);
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

      // Grouping acts on the shared selection, which the object tree fills
      // in. Cmd+Shift+G checked first — Cmd+G would otherwise swallow it.
      if (canEdit && isCtrlOrCmd && key === 'g') {
        e.preventDefault();

        const groupRefs = uiState.selection.filter((ref) => {
          return ref.kind === 'GROUP';
        });
        const entityRefs = uiState.selection
          .filter((ref) => {
            return ref.kind !== 'GROUP' && ref.kind !== 'LAYER';
          })
          .map((ref) => {
            return { type: ref.kind as ItemReferenceType, id: ref.id };
          });

        if (e.shiftKey) {
          if (groupRefs.length > 0) {
            groupRefs.forEach((ref) => {
              scene.deleteGroup(ref.id);
            });
          } else if (entityRefs.length > 0) {
            scene.setItemsGroup(entityRefs, null);
          }

          uiState.actions.setSelection([]);
          return;
        }

        if (entityRefs.length > 0) {
          const groupId = generateId();

          scene.createGroup(
            {
              id: groupId,
              name: `Group ${scene.groups.length + 1}`,
              layerId: getEntityLayerId(scene.currentView, entityRefs[0])
            },
            entityRefs
          );
          uiState.actions.setSelection([{ kind: 'GROUP', id: groupId }]);
        }

        return;
      }

      // Paste needs no selection, just a clipboard and a mouse position.
      if (canEdit && isCtrlOrCmd && key === 'v') {
        e.preventDefault();
        const pastedId = pasteNode(uiState.mouse.position.tile);
        if (pastedId) {
          uiState.actions.setItemControls({ type: 'ITEM', id: pastedId });
        }
        return;
      }

      // Select everything in the view.
      if (isCtrlOrCmd && key === 'a') {
        e.preventDefault();
        uiState.actions.setSelection(
          allEntityRefs().map((ref) => {
            return { kind: ref.type, id: ref.id };
          })
        );
        return;
      }

      // Everything below acts on the resolved target set — the shared
      // multi-selection when there is one, else the single open entity. This
      // is what makes Delete and the arrows work on rectangles, text boxes
      // and multi-selections rather than only on nodes.
      const targets = getTargets();

      if (canEdit && targets.length > 0) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          deleteEntities(targets);
          uiState.actions.setSelection([]);
          uiState.actions.setItemControls(null);
          return;
        }

        const nudge = NUDGE_DELTAS[e.key];

        if (nudge && !isCtrlOrCmd) {
          e.preventDefault();
          // Shift is the coarse nudge, the same convention as every other
          // canvas tool.
          const step = e.shiftKey ? LARGE_NUDGE : 1;

          nudgeEntities(targets, {
            x: nudge.x * step,
            y: nudge.y * step
          });
          return;
        }

        // Lock and hide mirror the object tree's per-row toggles, applied to
        // the whole selection at once.
        if (isCtrlOrCmd && e.shiftKey && key === 'l') {
          e.preventDefault();
          setFlags({ isLocked: !allHaveFlag('isLocked', true) });
          return;
        }

        if (isCtrlOrCmd && e.shiftKey && key === 'h') {
          e.preventDefault();
          setFlags({ isVisible: allHaveFlag('isVisible', false) });
          return;
        }

        // Z-order, for the one kind that has a stacking order to change.
        const zOrder = Z_ORDER_KEYS[key];

        if (isCtrlOrCmd && zOrder) {
          const rectangles = targets.filter((ref) => {
            return ref.type === 'RECTANGLE';
          });

          if (rectangles.length > 0) {
            e.preventDefault();
            rectangles.forEach((ref) => {
              scene.changeLayerOrder(
                e.shiftKey ? zOrder.extreme : zOrder.step,
                ref
              );
            });
            return;
          }
        }
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

        if (canEdit && (e.key === 'F2' || e.key === 'Enter')) {
          e.preventDefault();
          uiState.actions.setRenamingItemId(selectedNodeId);
          return;
        }
      }

      // Zoom, on the usual bindings. '=' is the unshifted '+' key.
      if (isCtrlOrCmd && (key === '=' || key === '+')) {
        e.preventDefault();
        uiState.actions.incrementZoom();
        return;
      }

      if (isCtrlOrCmd && key === '-') {
        e.preventDefault();
        uiState.actions.decrementZoom();
        return;
      }

      if (isCtrlOrCmd && key === '0') {
        e.preventDefault();
        fitToView();
        return;
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
    copyNode,
    cutNode,
    pasteNode,
    scene,
    fitToView,
    getTargets,
    deleteEntities,
    nudgeEntities,
    setFlags,
    allHaveFlag,
    allEntityRefs
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
