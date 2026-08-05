import React from 'react';
import { Menu, MenuItem, Divider, Typography } from '@mui/material';
import { Coords } from 'src/types';

export interface MenuItemI {
  label: string;
  onClick: () => void;
  /** Rendered right-aligned. A context menu is where hotkeys get learned. */
  shortcut?: string;
  disabled?: boolean;
  /** Draws a separator above this item. */
  dividerBefore?: boolean;
}

interface Props {
  onClose: () => void;
  position: Coords;
  anchorEl?: HTMLElement;
  menuItems: MenuItemI[];
}

export const ContextMenu = ({
  onClose,
  position,
  anchorEl,
  menuItems
}: Props) => {
  return (
    <Menu
      open
      anchorEl={anchorEl}
      style={{
        left: position.x,
        top: position.y
      }}
      onClose={onClose}
    >
      {menuItems.map((item, index) => {
        const row = (
          <MenuItem
            key={item.label}
            onClick={item.onClick}
            disabled={item.disabled}
            sx={{ gap: 3, justifyContent: 'space-between', minWidth: 200 }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}
              >
                {item.shortcut}
              </Typography>
            )}
          </MenuItem>
        );

        // MUI's Menu wants a flat child list for keyboard navigation, so a
        // divider is emitted as a sibling rather than wrapping the item.
        return item.dividerBefore && index > 0
          ? [<Divider key={`${item.label}-divider`} />, row]
          : row;
      })}
    </Menu>
  );
};
