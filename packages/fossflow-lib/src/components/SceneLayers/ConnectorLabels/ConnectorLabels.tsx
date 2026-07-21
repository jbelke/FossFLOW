import React, { memo } from 'react';
import type { useScene } from 'src/hooks/useScene';
import { ConnectorLabel } from './ConnectorLabel';

interface Props {
  connectors: ReturnType<typeof useScene>['connectors'];
}

export const ConnectorLabels = memo(({ connectors }: Props) => {
  return (
    <>
      {connectors
        .filter((connector) => {
          return Boolean(connector.description);
        })
        .map((connector) => {
          return <ConnectorLabel key={connector.id} connector={connector} />;
        })}
    </>
  );
});

ConnectorLabels.displayName = 'ConnectorLabels';
