import type {
  Model,
  ModelItem,
  Connector,
  ConnectorAnchor,
  View,
  Rectangle
} from 'src/types';
import { getAllAnchors, getItemByIdOrThrow } from 'src/utils';
import { BASE_LAYER_ID } from './views';

// Anything that can carry a layerId/groupId/parentId: the four entity kinds,
// plus groups and layers themselves once both trees nest.
type MembershipHolder =
  | 'ITEM'
  | 'CONNECTOR'
  | 'RECTANGLE'
  | 'TEXTBOX'
  | 'GROUP'
  | 'LAYER';

type IssueType =
  | {
      type: 'INVALID_ANCHOR_TO_VIEW_ITEM_REF';
      params: {
        anchor: string;
        viewItem: string;
        view: string;
        connector: string;
      };
    }
  | {
      type: 'INVALID_CONNECTOR_COLOR_REF';
      params: {
        connector: string;
        view: string;
        color: string;
      };
    }
  | {
      type: 'INVALID_RECTANGLE_COLOR_REF';
      params: {
        rectangle: string;
        view: string;
        color: string;
      };
    }
  | {
      type: 'INVALID_ANCHOR_TO_ANCHOR_REF';
      params: {
        srcAnchor: string;
        destAnchor: string;
        view: string;
        connector: string;
      };
    }
  | {
      type: 'INVALID_VIEW_ITEM_TO_MODEL_ITEM_REF';
      params: {
        view: string;
        modelItem: string;
      };
    }
  | {
      type: 'INVALID_ANCHOR_REF';
      params: {
        anchor: string;
        view: string;
        connector: string;
      };
    }
  | {
      type: 'INVALID_MODEL_TO_ICON_REF';
      params: {
        modelItem: string;
        icon: string;
      };
    }
  | {
      type: 'CONNECTOR_TOO_FEW_ANCHORS';
      params: {
        connector: string;
        view: string;
      };
    }
  | {
      type: 'INVALID_LAYER_REF';
      params: {
        entityType: MembershipHolder;
        entity: string;
        view: string;
        layer: string;
      };
    }
  | {
      type: 'INVALID_GROUP_REF';
      params: {
        entityType: MembershipHolder;
        entity: string;
        view: string;
        group: string;
      };
    };

type Issue = IssueType & {
  message: string;
};

export const validateConnectorAnchor = (
  anchor: ConnectorAnchor,
  ctx: {
    view: View;
    connector: Connector;
    allAnchors: ConnectorAnchor[];
  }
): Issue[] => {
  const issues: Issue[] = [];

  if (Object.keys(anchor.ref).length !== 1) {
    issues.push({
      type: 'INVALID_ANCHOR_REF',
      params: {
        anchor: anchor.id,
        view: ctx.view.id,
        connector: ctx.connector.id
      },
      message:
        'Connector includes an anchor that references more than one item.  An anchor can only reference one item.'
    });
  }

  if (anchor.ref.item) {
    try {
      getItemByIdOrThrow(ctx.view.items, anchor.ref.item);
    } catch (e) {
      issues.push({
        type: 'INVALID_ANCHOR_TO_VIEW_ITEM_REF',
        params: {
          anchor: anchor.id,
          viewItem: anchor.ref.item,
          view: ctx.view.id,
          connector: ctx.connector.id
        },
        message:
          'Connector includes an anchor that references an item that does not exist in this view.'
      });
    }
  }

  if (anchor.ref.anchor) {
    const targetAnchorId = ctx.allAnchors
      .map(({ id }) => {
        return id;
      })
      .includes(anchor.ref.anchor);

    if (!targetAnchorId) {
      issues.push({
        type: 'INVALID_ANCHOR_TO_ANCHOR_REF',
        params: {
          destAnchor: anchor.id,
          srcAnchor: anchor.ref.anchor,
          view: ctx.view.id,
          connector: ctx.connector.id
        },
        message:
          'Connector includes an anchor that references another connector anchor that does not exist in this view.'
      });
    }
  }

  return issues;
};

export const validateConnector = (
  connector: Connector,
  ctx: {
    view: View;
    model: Model;
    allAnchors: ConnectorAnchor[];
  }
): Issue[] => {
  const issues: Issue[] = [];

  if (connector.color) {
    try {
      getItemByIdOrThrow(ctx.model.colors, connector.color);
    } catch (e) {
      issues.push({
        type: 'INVALID_CONNECTOR_COLOR_REF',
        params: {
          connector: connector.id,
          view: ctx.view.id,
          color: connector.color
        },
        message:
          'Connector references a color that does not exist in the model.'
      });
    }
  }

  if (connector.anchors.length < 2) {
    issues.push({
      type: 'CONNECTOR_TOO_FEW_ANCHORS',
      params: {
        connector: connector.id,
        view: ctx.view.id
      },
      message:
        'Connector must have at least two anchors.  One for the source and one for the target.'
    });
  }

  const { anchors } = connector;

  anchors.forEach((anchor) => {
    const anchorIssues = validateConnectorAnchor(anchor, {
      view: ctx.view,
      connector,
      allAnchors: ctx.allAnchors
    });

    issues.push(...anchorIssues);
  });

  return issues;
};

export const validateRectangle = (
  rectangle: Rectangle,
  ctx: { view: View; model: Model }
): Issue[] => {
  const issues: Issue[] = [];

  if (rectangle.color) {
    try {
      getItemByIdOrThrow(ctx.model.colors, rectangle.color);
    } catch (e) {
      issues.push({
        type: 'INVALID_RECTANGLE_COLOR_REF',
        params: {
          rectangle: rectangle.id,
          view: ctx.view.id,
          color: rectangle.color
        },
        message:
          'Rectangle references a color that does not exist in the model.'
      });
    }
  }

  return issues;
};

export const validateView = (view: View, ctx: { model: Model }): Issue[] => {
  const issues: Issue[] = [];

  if (view.connectors) {
    const allAnchors = getAllAnchors(view.connectors);

    view.connectors.forEach((connector) => {
      issues.push(
        ...validateConnector(connector, {
          view,
          model: ctx.model,
          allAnchors
        })
      );
    });
  }

  if (view.rectangles) {
    view.rectangles.forEach((rectangle) => {
      issues.push(
        ...validateRectangle(rectangle, {
          view,
          model: ctx.model
        })
      );
    });
  }

  view.items.forEach((viewItem) => {
    try {
      getItemByIdOrThrow(ctx.model.items, viewItem.id);
    } catch (e) {
      issues.push({
        type: 'INVALID_VIEW_ITEM_TO_MODEL_ITEM_REF',
        params: {
          modelItem: viewItem.id,
          view: view.id
        },
        message:
          'Invalid item in view.  The item references a non-existant item in the model.'
      });
    }
  });

  // layerId must resolve to a layer in this view. BASE_LAYER_ID is never
  // stamped onto entities, but tolerate it if a hand-edited document does.
  const layerIds = new Set(
    (view.layers ?? []).map((layer) => {
      return layer.id;
    })
  );

  // groupId must resolve to a group in this view, same as layerId.
  const groupIds = new Set(
    (view.groups ?? []).map((group) => {
      return group.id;
    })
  );

  const checkMembershipRefs = (
    entityType: 'ITEM' | 'CONNECTOR' | 'RECTANGLE' | 'TEXTBOX',
    entity: { id: string; layerId?: string; groupId?: string }
  ) => {
    if (
      entity.layerId &&
      entity.layerId !== BASE_LAYER_ID &&
      !layerIds.has(entity.layerId)
    ) {
      issues.push({
        type: 'INVALID_LAYER_REF',
        params: {
          entityType,
          entity: entity.id,
          view: view.id,
          layer: entity.layerId
        },
        message: 'Item references a layer that does not exist in this view.'
      });
    }

    if (entity.groupId && !groupIds.has(entity.groupId)) {
      issues.push({
        type: 'INVALID_GROUP_REF',
        params: {
          entityType,
          entity: entity.id,
          view: view.id,
          group: entity.groupId
        },
        message: 'Item references a group that does not exist in this view.'
      });
    }
  };

  view.items.forEach((viewItem) => {
    return checkMembershipRefs('ITEM', viewItem);
  });
  (view.connectors ?? []).forEach((connector) => {
    return checkMembershipRefs('CONNECTOR', connector);
  });
  (view.rectangles ?? []).forEach((rectangle) => {
    return checkMembershipRefs('RECTANGLE', rectangle);
  });
  (view.textBoxes ?? []).forEach((textBox) => {
    return checkMembershipRefs('TEXTBOX', textBox);
  });

  // A group's own layerId, and both trees' parentIds, must resolve too — a
  // dangling parent would silently orphan a whole subtree in the object tree.
  (view.groups ?? []).forEach((group) => {
    if (
      group.layerId &&
      group.layerId !== BASE_LAYER_ID &&
      !layerIds.has(group.layerId)
    ) {
      issues.push({
        type: 'INVALID_LAYER_REF',
        params: {
          entityType: 'GROUP',
          entity: group.id,
          view: view.id,
          layer: group.layerId
        },
        message: 'Group references a layer that does not exist in this view.'
      });
    }

    if (group.parentId && !groupIds.has(group.parentId)) {
      issues.push({
        type: 'INVALID_GROUP_REF',
        params: {
          entityType: 'GROUP',
          entity: group.id,
          view: view.id,
          group: group.parentId
        },
        message: 'Group references a parent group that does not exist.'
      });
    }
  });

  (view.layers ?? []).forEach((layer) => {
    if (layer.parentId && !layerIds.has(layer.parentId)) {
      issues.push({
        type: 'INVALID_LAYER_REF',
        params: {
          entityType: 'LAYER',
          entity: layer.id,
          view: view.id,
          layer: layer.parentId
        },
        message: 'Layer references a parent layer that does not exist.'
      });
    }
  });

  return issues;
};

export const validateModelItem = (
  modelItem: ModelItem,
  ctx: {
    model: Model;
  }
): Issue[] => {
  const issues: Issue[] = [];

  if (!modelItem.icon) return issues;

  try {
    getItemByIdOrThrow(ctx.model.icons, modelItem.icon);
  } catch (e) {
    issues.push({
      type: 'INVALID_MODEL_TO_ICON_REF',
      params: {
        modelItem: modelItem.id,
        icon: modelItem.icon
      },
      message:
        'Invalid item found in the model.  The item references an icon that does not exist.'
    });
  }

  return issues;
};

export const validateModel = (model: Model): Issue[] => {
  const issues: Issue[] = [];

  model.items.forEach((modelItem) => {
    issues.push(...validateModelItem(modelItem, { model }));
  });

  model.views.forEach((view) => {
    issues.push(...validateView(view, { model }));
  });

  return issues;
};
