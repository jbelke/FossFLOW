import domtoimage from 'dom-to-image';
import FileSaver from 'file-saver';
import { Model, Size } from '../types';
import { icons as availableIcons } from '../examples/initialData';

export const generateGenericFilename = (extension: string) => {
  return `isoflow-export-${new Date().toISOString()}.${extension}`;
};

export const base64ToBlob = (
  base64: string,
  contentType: string,
  sliceSize = 512
) => {
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);

    const byteNumbers = new Array(slice.length);

    for (let i = 0; i < slice.length; i += 1) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  const blob = new Blob(byteArrays, { type: contentType });

  return blob;
};

/**
 * Decode the text body of a data URL the lenient way browsers do.
 *
 * `dom-to-image` builds its SVG data URL by escaping only `#` and newlines, so
 * the body still contains bare `%` characters from CSS like `width: 100%`.
 * Strict `decodeURIComponent` throws "URI malformed" on those. Decoding each
 * run of valid escapes instead keeps multi-byte UTF-8 sequences intact while
 * leaving a lone `%` untouched.
 */
const decodeDataUrlText = (payload: string) => {
  return payload.replace(/(?:%[0-9A-Fa-f]{2})+/g, (escapeRun) => {
    try {
      return decodeURIComponent(escapeRun);
    } catch (err) {
      return escapeRun;
    }
  });
};

/**
 * Turn any data URL into a Blob. `dom-to-image` returns base64 for raster
 * formats but escaped text for SVG, so both encodings have to work.
 */
export const dataUrlToBlob = (dataUrl: string) => {
  const separator = dataUrl.indexOf(',');

  if (!dataUrl.startsWith('data:') || separator === -1) {
    throw new Error('Not a data URL');
  }

  const header = dataUrl.slice('data:'.length, separator);
  const payload = dataUrl.slice(separator + 1);
  const isBase64 = header.endsWith(';base64');
  const contentType =
    (isBase64 ? header.slice(0, -';base64'.length) : header) ||
    'application/octet-stream';

  if (isBase64) {
    return base64ToBlob(payload, contentType);
  }

  return new Blob([decodeDataUrlText(payload)], { type: contentType });
};

export const downloadFile = (data: Blob, filename: string) => {
  FileSaver.saveAs(data, filename);
};

export const transformToCompactFormat = (model: Model) => {
  const { items, views, icons, title } = model;

  // Compact format: ultra-minimal for LLM generation
  const compactItems = items.map((item, index) => [
    item.name.substring(0, 30), // Truncated name
    item.icon || 'block', // Icon reference only (no base64)
    item.description?.substring(0, 100) || '' // Truncated description
  ]);

  const compactViews = views.map((view) => {
    const positions = view.items.map((viewItem) => {
      const itemIndex = items.findIndex(item => item.id === viewItem.id);
      return [itemIndex, viewItem.tile.x, viewItem.tile.y];
    });

    const connections = view.connectors?.map((connector) => {
      const fromIndex = items.findIndex(item => item.id === connector.anchors[0]?.ref.item);
      const toIndex = items.findIndex(item => item.id === connector.anchors[connector.anchors.length - 1]?.ref.item);
      return [fromIndex, toIndex];
    }).filter(conn => conn[0] !== -1 && conn[1] !== -1) || [];

    return [positions, connections];
  });

  return {
    t: title?.substring(0, 40) || 'Untitled',
    i: compactItems,
    v: compactViews,
    _: { f: 'compact', v: '1.0' }
  };
};

export const transformFromCompactFormat = (compactModel: any): Model => {
  const { t, i, v, _ } = compactModel;

  // Restore from compact format
  const fullItems = i.map((item: any, index: number) => ({
    id: `item_${index}`,
    name: item[0],
    icon: item[1],
    description: item[2] || '' // Restore description if available
  }));

  // Resolve icons from the internal icon library
  const iconSet = new Set<string>();
  i.forEach((item: any) => {
    if (item[1]) iconSet.add(item[1]);
  });

  const fullIcons = Array.from(iconSet).map(iconName => {
    // Find the icon in the available icons library
    const existingIcon = availableIcons.find(icon => icon.id === iconName || icon.name === iconName);
    
    if (existingIcon) {
      // Use the existing icon data with proper URL
      return {
        id: iconName,
        name: existingIcon.name,
        url: existingIcon.url,
        collection: existingIcon.collection,
        isIsometric: existingIcon.isIsometric ?? true
      };
    } else {
      // Fallback for unknown icons
      return {
        id: iconName,
        name: iconName,
        url: '', // App will use default icon
        isIsometric: true
      };
    }
  });

  const fullViews = v.map((view: any, viewIndex: number) => {
    const [positions, connections] = view;

    const viewItems = positions.map((pos: any) => {
      const [itemIndex, x, y] = pos;
      return {
        id: `item_${itemIndex}`,
        tile: { x, y },
        labelHeight: 80
      };
    });

    const connectors = connections.map((conn: any, connIndex: number) => {
      const [fromIndex, toIndex] = conn;
      return {
        id: `conn_${viewIndex}_${connIndex}`,
        color: 'color1',
        anchors: [
          { id: `a_${viewIndex}_${connIndex}_0`, ref: { item: `item_${fromIndex}` } },
          { id: `a_${viewIndex}_${connIndex}_1`, ref: { item: `item_${toIndex}` } }
        ],
        width: 10,
        description: '',
        style: 'SOLID'
      };
    });

    return {
      id: `view_${viewIndex}`,
      name: `View ${viewIndex + 1}`,
      items: viewItems,
      connectors,
      rectangles: [],
      textBoxes: []
    };
  });

  return {
    title: t,
    version: '1.0',
    items: fullItems,
    views: fullViews,
    icons: fullIcons,
    colors: [{ id: 'color1', value: '#a5b8f3' }]
  };
};

export const exportAsJSON = (model: Model) => {
  const data = new Blob([JSON.stringify(model)], {
    type: 'application/json;charset=utf-8'
  });

  downloadFile(data, generateGenericFilename('json'));
};

export const exportAsCompactJSON = (model: Model) => {
  const compactModel = transformToCompactFormat(model);
  const data = new Blob([JSON.stringify(compactModel)], {
    type: 'application/json;charset=utf-8'
  });

  downloadFile(data, generateGenericFilename('compact.json'));
};

export type ExportImageFormat = 'png' | 'jpeg' | 'svg' | 'pdf';

/**
 * PDF has no capture path of its own — it wraps a PNG raster (see
 * `exportAsPdf`), so this is the format actually handed to `dom-to-image`.
 */
export type CaptureFormat = Exclude<ExportImageFormat, 'pdf'>;

export const captureFormatFor = (format: ExportImageFormat): CaptureFormat => {
  return format === 'pdf' ? 'png' : format;
};

export const FILE_EXTENSIONS: Record<ExportImageFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  svg: 'svg',
  pdf: 'pdf'
};

export interface ExportImageOptions extends Partial<Size> {
  format?: CaptureFormat;
  /** Flattened behind the diagram; only applied to JPEG, which has no alpha. */
  backgroundColor?: string;
  jpegQuality?: number;
}

export const exportAsImage = async (
  el: HTMLDivElement,
  options: ExportImageOptions = {}
) => {
  const {
    format = 'png',
    backgroundColor,
    jpegQuality = 0.92,
    ...size
  } = options;

  const domToImageOptions = {
    ...size,
    cacheBust: true
  };

  switch (format) {
    case 'jpeg':
      return domtoimage.toJpeg(el, {
        ...domToImageOptions,
        bgcolor: backgroundColor,
        quality: jpegQuality
      });
    // Note this is not a native-vector export: `dom-to-image` wraps the cloned
    // DOM in a <foreignObject>, so it scales cleanly in browsers but does not
    // open as editable shapes in Inkscape or Illustrator. A true vector export
    // would need the renderer to stop drawing nodes as HTML.
    case 'svg':
      return domtoimage.toSvg(el, domToImageOptions);
    default:
      return domtoimage.toPng(el, domToImageOptions);
  }
};
