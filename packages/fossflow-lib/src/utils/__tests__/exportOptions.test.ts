import {
  dataUrlToBlob,
  captureFormatFor,
  FILE_EXTENSIONS
} from '../exportOptions';

const readBlob = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      return resolve(String(reader.result));
    };
    reader.onerror = () => {
      return reject(reader.error);
    };
    reader.readAsText(blob);
  });
};

describe('dataUrlToBlob', () => {
  it('decodes base64 payloads, as raster captures produce', async () => {
    const blob = dataUrlToBlob(`data:image/png;base64,${btoa('binary-ish')}`);

    expect(blob.type).toBe('image/png');
    await expect(readBlob(blob)).resolves.toBe('binary-ish');
  });

  // `dom-to-image` percent-encodes its SVG output rather than base64-encoding
  // it, so assuming base64 would silently corrupt every SVG export.
  it('decodes percent-encoded payloads, as SVG captures produce', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g id="a b"/></svg>';
    const blob = dataUrlToBlob(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    );

    expect(blob.type).toBe('image/svg+xml;charset=utf-8');
    await expect(readBlob(blob)).resolves.toBe(svg);
  });

  // `dom-to-image`'s escapeXhtml replaces only `#` and newlines, and the
  // <foreignObject> it wraps every export in hardcodes width="100%". Strict
  // decoding therefore threw "URI malformed" on *every* SVG export, so no file
  // ever reached the user.
  it('survives the bare % dom-to-image always leaves in its SVG body', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<foreignObject x="0" y="0" width="100%" height="100%">' +
      '<div style="color: %23fff">caf%C3%A9</div>' +
      '</foreignObject></svg>';
    const blob = dataUrlToBlob(`data:image/svg+xml;charset=utf-8,${svg}`);

    await expect(readBlob(blob)).resolves.toBe(
      '<svg xmlns="http://www.w3.org/2000/svg">' +
        '<foreignObject x="0" y="0" width="100%" height="100%">' +
        '<div style="color: #fff">café</div>' +
        '</foreignObject></svg>'
    );
  });

  it('rejects anything that is not a data URL', () => {
    expect(() => {
      return dataUrlToBlob('https://example.com/diagram.png');
    }).toThrow();
  });
});

describe('captureFormatFor', () => {
  it('captures PDF as a PNG raster, and every other format as itself', () => {
    expect(captureFormatFor('pdf')).toBe('png');
    expect(captureFormatFor('png')).toBe('png');
    expect(captureFormatFor('jpeg')).toBe('jpeg');
    expect(captureFormatFor('svg')).toBe('svg');
  });
});

describe('FILE_EXTENSIONS', () => {
  it('maps the JPEG mime-style name onto the conventional .jpg extension', () => {
    expect(FILE_EXTENSIONS.jpeg).toBe('jpg');
  });
});
