/**
 * Minimal single-page PDF writer.
 *
 * The diagram is rasterised to RGB samples and embedded as a single image
 * XObject that fills the page. This is hand-rolled rather than pulled from a
 * PDF library on purpose: `fossflow` is published as a bundled CommonJS
 * artifact, so a dependency here lands in every consumer's bundle, and the
 * subset of PDF we need (one page, one image, no fonts, no text) is small
 * enough to own outright.
 */

// PDF measures in points; browsers lay out in CSS pixels at a nominal 96 DPI.
const PT_PER_CSS_PX = 72 / 96;

/**
 * 200 inches. Acrobat and most other readers reject pages larger than this, so
 * an oversized diagram is shrunk to fit rather than producing a file that only
 * some viewers will open. The embedded raster keeps its own resolution either
 * way — only the page's physical size changes.
 */
const MAX_PAGE_PT = 14400;

/**
 * PDF syntax — headers, dictionaries, the xref table — is all ASCII, so a
 * one-byte-per-char encode is exact here and avoids depending on TextEncoder.
 */
const ascii = (text: string) => {
  const bytes = new Uint8Array(text.length);

  for (let i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i);
  }

  return bytes;
};

/**
 * Zlib-compress the sample data so the PDF stream can use /FlateDecode.
 * Returns null where `CompressionStream` is unavailable, in which case the
 * caller writes the samples uncompressed — a much larger, but still valid, PDF.
 */
const deflate = async (bytes: Uint8Array): Promise<Uint8Array | null> => {
  if (typeof CompressionStream === 'undefined') {
    return null;
  }

  try {
    // CompressionStream('deflate') emits a zlib wrapper, which is exactly what
    // /FlateDecode expects ('deflate-raw' would not be).
    const compressed = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream('deflate'));
    const buffer = await new Response(compressed).arrayBuffer();

    return new Uint8Array(buffer);
  } catch (err) {
    return null;
  }
};

interface RgbRaster {
  samples: Uint8Array;
  width: number;
  height: number;
}

/**
 * Decode an image data URL into flat 8-bit RGB samples, compositing over
 * `backgroundColor` so any transparency becomes opaque. PDF image XObjects
 * carry no alpha channel of their own — flattening here avoids needing a
 * separate soft mask.
 */
const toRgbRaster = (
  imageDataUrl: string,
  backgroundColor?: string
): Promise<RgbRaster> => {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image;

      if (!width || !height) {
        reject(new Error('Rendered image has no dimensions'));
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not acquire a 2D canvas context'));
        return;
      }

      // Letting the canvas parse the CSS colour keeps us out of the business of
      // understanding hex/rgb()/named colours.
      ctx.fillStyle = backgroundColor ?? '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0);

      const { data } = ctx.getImageData(0, 0, width, height);
      const samples = new Uint8Array(width * height * 3);

      for (let px = 0; px < width * height; px += 1) {
        samples[px * 3] = data[px * 4];
        samples[px * 3 + 1] = data[px * 4 + 1];
        samples[px * 3 + 2] = data[px * 4 + 2];
      }

      resolve({ samples, width, height });
    };

    image.onerror = () => {
      reject(new Error('Could not decode the rendered image'));
    };

    image.src = imageDataUrl;
  });
};

interface PdfDocumentOptions {
  raster: RgbRaster;
  streamData: Uint8Array;
  isCompressed: boolean;
  pageWidthPt: number;
  pageHeightPt: number;
}

/**
 * Assemble the PDF byte-for-byte. Objects are emitted in order while their
 * starting offsets are recorded, because the cross-reference table at the end
 * of the file has to point at each object's exact byte offset.
 */
export const buildPdfDocument = ({
  raster,
  streamData,
  isCompressed,
  pageWidthPt,
  pageHeightPt
}: PdfDocumentOptions): Uint8Array => {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? ascii(chunk) : chunk;
    chunks.push(bytes);
    length += bytes.length;
  };

  const startObject = (body: string) => {
    offsets.push(length);
    push(body);
  };

  const size = (value: number) => {
    return Number(value.toFixed(2));
  };

  push('%PDF-1.4\n');
  // A comment of high-bit bytes marks the file as binary for tools that sniff
  // content to decide between text and binary transfer modes.
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  startObject('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObject('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  startObject(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size(
      pageWidthPt
    )} ${size(
      pageHeightPt
    )}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`
  );

  // Scale the unit square the image is drawn into up to the full page.
  const content = `q ${size(pageWidthPt)} 0 0 ${size(
    pageHeightPt
  )} 0 0 cm /Im0 Do Q\n`;
  startObject(
    `4 0 obj\n<< /Length ${ascii(content).length} >>\nstream\n${content}endstream\nendobj\n`
  );

  offsets.push(length);
  push(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${raster.width} /Height ${
      raster.height
    } /ColorSpace /DeviceRGB /BitsPerComponent 8${
      isCompressed ? ' /Filter /FlateDecode' : ''
    } /Length ${streamData.length} >>\nstream\n`
  );
  push(streamData);
  push('\nendstream\nendobj\n');

  const xrefOffset = length;
  const objectCount = offsets.length + 1;
  // Every xref entry must be exactly 20 bytes wide, trailing space included.
  const entries = offsets
    .map((offset) => {
      return `${offset.toString().padStart(10, '0')} 00000 n \n`;
    })
    .join('');

  push(`xref\n0 ${objectCount}\n0000000000 65535 f \n${entries}`);
  push(
    `trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const pdf = new Uint8Array(length);
  let cursor = 0;
  chunks.forEach((chunk) => {
    pdf.set(chunk, cursor);
    cursor += chunk.length;
  });

  return pdf;
};

export interface ExportAsPdfOptions {
  /** Page width in CSS pixels; the diagram's unprojected width. */
  pageWidth: number;
  /** Page height in CSS pixels; the diagram's unprojected height. */
  pageHeight: number;
  backgroundColor?: string;
}

/**
 * Wrap an already-rendered raster (a PNG data URL from `exportAsImage`) into a
 * single-page PDF sized to the diagram. The raster is typically captured above
 * 1:1, so the page stays at the diagram's logical size while the embedded
 * image keeps its extra resolution.
 */
export const exportAsPdf = async (
  imageDataUrl: string,
  { pageWidth, pageHeight, backgroundColor }: ExportAsPdfOptions
): Promise<Blob> => {
  const raster = await toRgbRaster(imageDataUrl, backgroundColor);
  const compressed = await deflate(raster.samples);

  const widthPt = pageWidth * PT_PER_CSS_PX;
  const heightPt = pageHeight * PT_PER_CSS_PX;
  const pageScale = Math.min(1, MAX_PAGE_PT / widthPt, MAX_PAGE_PT / heightPt);

  const pdf = buildPdfDocument({
    raster,
    streamData: compressed ?? raster.samples,
    isCompressed: compressed !== null,
    pageWidthPt: widthPt * pageScale,
    pageHeightPt: heightPt * pageScale
  });

  return new Blob([pdf as BlobPart], { type: 'application/pdf' });
};
