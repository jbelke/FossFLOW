import React from 'react';
import {
  Box,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import { useUiStateStore } from 'src/stores/uiStateStore';
import {
  HOTKEY_PROFILES,
  HOTKEY_REFERENCE,
  HotkeyProfile
} from 'src/config/hotkeys';

// navigator.platform is deprecated but is still the most reliable way to tell
// a Mac from everything else for the purpose of naming one modifier key.
const MOD_LABEL =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl';

export const HotkeySettings = () => {
  const hotkeyProfile = useUiStateStore((state) => state.hotkeyProfile);
  const setHotkeyProfile = useUiStateStore((state) => state.actions.setHotkeyProfile);

  const currentMapping = HOTKEY_PROFILES[hotkeyProfile];

  const tools = [
    { name: 'Select', key: currentMapping.select },
    { name: 'Pan', key: currentMapping.pan },
    { name: 'Add Item', key: currentMapping.addItem },
    { name: 'Rectangle', key: currentMapping.rectangle },
    { name: 'Connector', key: currentMapping.connector },
    { name: 'Text', key: currentMapping.text }
  ];

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Hotkey Settings
      </Typography>
      
      <FormControl fullWidth sx={{ mb: 3 }}>
        <InputLabel>Hotkey Profile</InputLabel>
        <Select
          value={hotkeyProfile}
          label="Hotkey Profile"
          onChange={(e) => setHotkeyProfile(e.target.value as HotkeyProfile)}
        >
          <MenuItem value="qwerty">QWERTY (Q, W, E, R, T, Y)</MenuItem>
          <MenuItem value="smnrct">SMNRCT (S, M, N, R, C, T)</MenuItem>
          <MenuItem value="none">No Hotkeys</MenuItem>
        </Select>
      </FormControl>

      {hotkeyProfile !== 'none' && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tool</TableCell>
                <TableCell>Hotkey</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tools.map((tool) => (
                <TableRow key={tool.name}>
                  <TableCell>{tool.name}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {tool.key ? tool.key.toUpperCase() : '-'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        Note: Hotkeys work when not typing in text fields
      </Typography>

      <Typography variant="h6" sx={{ mt: 3 }} gutterBottom>
        Shortcuts
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        These are fixed and are not affected by the profile above.
      </Typography>

      {HOTKEY_REFERENCE.map((section) => {
        return (
          <TableContainer component={Paper} key={section.group} sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{section.group}</TableCell>
                  <TableCell align="right">Shortcut</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {section.items.map((item) => {
                  return (
                    <TableRow key={item.keys}>
                      <TableCell>{item.action}</TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}
                        >
                          {item.keys.replace(/Mod/g, MOD_LABEL)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        );
      })}
    </Box>
  );
};