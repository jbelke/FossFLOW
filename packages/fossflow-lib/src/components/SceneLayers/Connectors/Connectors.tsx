import React from 'react';
import type { useScene } from 'src/hooks/useScene';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { Connector } from './Connector';

interface Props {
  connectors: ReturnType<typeof useScene>['connectors'];
}

export const Connectors = ({ connectors }: Props) => {
  // Derive a primitive in the selector so mode/itemControls identity churn
  // (every setMode call) doesn't re-render all connectors.
  const selectedConnectorId = useUiStateStore((state) => {
    if (state.mode.type === 'CONNECTOR') {
      return state.mode.id;
    }
    if (state.itemControls?.type === 'CONNECTOR') {
      return state.itemControls.id;
    }

    return null;
  });

  return (
    <>
      {[...connectors].reverse().map((connector) => {
        return (
          <Connector
            key={connector.id}
            connector={connector}
            isSelected={selectedConnectorId === connector.id}
          />
        );
      })}
    </>
  );
};
