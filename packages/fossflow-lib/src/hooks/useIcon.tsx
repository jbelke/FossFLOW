import React, { useMemo, useEffect } from 'react';
import { useModelStore } from 'src/stores/modelStore';
import { Icon, Icons } from 'src/types';
import { IsometricIcon } from 'src/components/SceneLayers/Nodes/Node/IconTypes/IsometricIcon';
import { NonIsometricIcon } from 'src/components/SceneLayers/Nodes/Node/IconTypes/NonIsometricIcon';
import { DEFAULT_ICON } from 'src/config';

// Icon packs run to 1000+ entries and every node resolves its icon on every
// model-store notification, so index by array identity instead of scanning.
const iconIndexCache = new WeakMap<Icons, Map<string, Icon>>();

const getIconFromIndex = (icons: Icons, id: string): Icon | undefined => {
  let index = iconIndexCache.get(icons);

  if (!index) {
    index = new Map(
      icons.map((icon) => {
        return [icon.id, icon];
      })
    );
    iconIndexCache.set(icons, index);
  }

  return index.get(id);
};

export const useIcon = (id: string | undefined) => {
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const icon = useModelStore((state) => {
    if (!id) return DEFAULT_ICON;

    return getIconFromIndex(state.icons, id) ?? DEFAULT_ICON;
  });

  useEffect(() => {
    setHasLoaded(false);
  }, [icon.url]);

  const iconComponent = useMemo(() => {
    if (!icon.isIsometric) {
      setHasLoaded(true);
      return <NonIsometricIcon icon={icon} />;
    }

    return (
      <IsometricIcon
        url={icon.url}
        onImageLoaded={() => {
          setHasLoaded(true);
        }}
      />
    );
  }, [icon]);

  return {
    icon,
    iconComponent,
    hasLoaded
  };
};
