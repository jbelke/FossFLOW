import React, { memo, useMemo } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import {
  PROJECTED_TILE_SIZE,
  DEFAULT_LABEL_HEIGHT,
  MARKDOWN_EMPTY_VALUE
} from 'src/config';
import { getTilePosition } from 'src/utils';
import { useIcon } from 'src/hooks/useIcon';
import { ViewItem } from 'src/types';
import { useModelItem } from 'src/hooks/useModelItem';
import { ExpandableLabel } from 'src/components/Label/ExpandableLabel';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useNodeActions } from 'src/hooks/useNodeActions';
import { NodeRenameInput } from './NodeRenameInput';

interface Props {
  node: ViewItem;
  order: number;
}

// useNodeActions subscribes broadly, so only the single node actually being
// renamed mounts this (and pays that subscription) — not all N nodes.
const NodeRenameControl = ({
  nodeId,
  initialValue
}: {
  nodeId: string;
  initialValue: string;
}) => {
  const { renameNode } = useNodeActions();
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });

  return (
    <NodeRenameInput
      initialValue={initialValue}
      onCommit={(name) => {
        renameNode(nodeId, name);
        uiStateActions.setRenamingItemId(null);
      }}
      onCancel={() => {
        uiStateActions.setRenamingItemId(null);
      }}
    />
  );
};

// Memoized: `node` is an immer-stable ViewItem ref and `order` a primitive,
// so moving one node re-renders only that node, not all of them.
export const Node = memo(({ node, order }: Props) => {
  const modelItem = useModelItem(node.id);
  const { iconComponent } = useIcon(modelItem?.icon);
  const isRenaming = useUiStateStore((state) => {
    return state.renamingItemId === node.id;
  });

  const position = useMemo(() => {
    return getTilePosition({
      tile: node.tile,
      origin: 'BOTTOM'
    });
  }, [node.tile]);

  const description = useMemo(() => {
    if (
      !modelItem ||
      modelItem.description === undefined ||
      modelItem.description === MARKDOWN_EMPTY_VALUE
    )
      return null;

    return modelItem.description;
  }, [modelItem]);

  // If modelItem doesn't exist, don't render the node
  if (!modelItem) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        zIndex: order
      }}
    >
      <Box
        sx={{ position: 'absolute' }}
        style={{
          left: position.x,
          top: position.y
        }}
      >
        {(modelItem?.name || description || isRenaming) && (
          <Box
            sx={{ position: 'absolute' }}
            style={{ bottom: PROJECTED_TILE_SIZE.height / 2 }}
          >
            <ExpandableLabel
              maxWidth={250}
              expandDirection="BOTTOM"
              labelHeight={node.labelHeight ?? DEFAULT_LABEL_HEIGHT}
            >
              <Stack spacing={1}>
                {isRenaming && (
                  <NodeRenameControl
                    nodeId={node.id}
                    initialValue={modelItem.name ?? ''}
                  />
                )}
                {!isRenaming && modelItem.name && (
                  <Typography fontWeight={600}>{modelItem.name}</Typography>
                )}
                {modelItem.description &&
                  modelItem.description !== MARKDOWN_EMPTY_VALUE && (
                    <MarkdownEditor value={modelItem.description} readOnly />
                  )}
              </Stack>
            </ExpandableLabel>
          </Box>
        )}
        {iconComponent && (
          <Box
            sx={{
              position: 'absolute',
              pointerEvents: 'none'
            }}
          >
            {iconComponent}
          </Box>
        )}
      </Box>
    </Box>
  );
});

Node.displayName = 'Node';
