export type HotkeyProfile = 'qwerty' | 'smnrct' | 'none';

export interface HotkeyMapping {
  select: string | null;
  pan: string | null;
  addItem: string | null;
  rectangle: string | null;
  connector: string | null;
  text: string | null;
}

export const HOTKEY_PROFILES: Record<HotkeyProfile, HotkeyMapping> = {
  qwerty: {
    select: 'q',
    pan: 'w',
    addItem: 'e',
    rectangle: 'r',
    connector: 't',
    text: 'y'
  },
  smnrct: {
    select: 's',
    pan: 'm',
    addItem: 'n',
    rectangle: 'r',
    connector: 'c',
    text: 't'
  },
  none: {
    select: null,
    pan: null,
    addItem: null,
    rectangle: null,
    connector: null,
    text: null
  }
};

export const DEFAULT_HOTKEY_PROFILE: HotkeyProfile = 'smnrct';

/**
 * The fixed (non-remappable) shortcuts, as the Settings dialog shows them.
 *
 * This lives next to the profiles rather than inside the dialog so there is a
 * single list to keep in step with useInteractionManager — a shortcut that
 * works but is undocumented is nearly as bad as one that does not work.
 *
 * `Mod` renders as ⌘ on macOS and Ctrl elsewhere.
 */
export interface HotkeyDoc {
  keys: string;
  action: string;
}

export const HOTKEY_REFERENCE: { group: string; items: HotkeyDoc[] }[] = [
  {
    group: 'Selection',
    items: [
      { keys: 'Mod+A', action: 'Select everything in the view' },
      { keys: 'Ctrl/Cmd+Click', action: 'Add or remove one row from the selection' },
      { keys: 'Shift+Click', action: 'Select a range of rows' },
      { keys: 'Esc', action: 'Clear the selection' }
    ]
  },
  {
    group: 'Editing',
    items: [
      { keys: 'Delete / Backspace', action: 'Delete the selection' },
      { keys: 'Mod+D', action: 'Duplicate the selected node' },
      { keys: 'Mod+C / Mod+X / Mod+V', action: 'Copy, cut and paste a node' },
      { keys: 'F2 / Enter', action: 'Rename the selected node' },
      { keys: 'Mod+Z', action: 'Undo' },
      { keys: 'Mod+Shift+Z / Mod+Y', action: 'Redo' }
    ]
  },
  {
    group: 'Arrange',
    items: [
      { keys: '↑ ↓ ← →', action: 'Nudge the selection one tile' },
      { keys: 'Shift+Arrows', action: 'Nudge ten tiles' },
      { keys: 'Mod+] / Mod+[', action: 'Bring a rectangle forward / send backward' },
      {
        keys: 'Mod+Shift+] / Mod+Shift+[',
        action: 'Bring a rectangle to front / send to back'
      }
    ]
  },
  {
    group: 'Layers and groups',
    items: [
      { keys: 'Mod+G', action: 'Group the selection' },
      { keys: 'Mod+Shift+G', action: 'Ungroup' },
      { keys: 'Mod+Shift+L', action: 'Lock or unlock the selection' },
      { keys: 'Mod+Shift+H', action: 'Hide or show the selection' }
    ]
  },
  {
    group: 'View',
    items: [
      { keys: 'Mod+= / Mod+-', action: 'Zoom in and out' },
      { keys: 'Mod+0', action: 'Fit the diagram to the screen' },
      { keys: 'F1', action: 'Help' }
    ]
  }
];