import { buildPdfDocument } from '../exportPdf';

/**
 * The cross-reference table is the fragile part of a hand-written PDF: every
 * entry is a byte offset, so an off-by-one anywhere upstream produces a file
 * that some readers open and others reject. These tests walk the generated
 * bytes the way a reader would.
 */

const RASTER = {
  // 2x1 pixels: one red, one blue.
  samples: new Uint8Array([255, 0, 0, 0, 0, 255]),
  width: 2,
  height: 1
};

const build = (
  overrides: Partial<Parameters<typeof buildPdfDocument>[0]> = {}
) => {
  return buildPdfDocument({
    raster: RASTER,
    streamData: RASTER.samples,
    isCompressed: false,
    pageWidthPt: 144,
    pageHeightPt: 72,
    ...overrides
  });
};

const asLatin1 = (bytes: Uint8Array) => {
  return Array.from(bytes)
    .map((byte) => {
      return String.fromCharCode(byte);
    })
    .join('');
};

describe('buildPdfDocument', () => {
  it('starts with a PDF header and ends with the EOF marker', () => {
    const text = asLatin1(build());

    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.endsWith('%%EOF\n')).toBe(true);
  });

  it('points startxref at the xref keyword', () => {
    const text = asLatin1(build());
    const startxref = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);

    expect(Number.isInteger(startxref)).toBe(true);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
  });

  it('records a byte offset for every object that lands on that object', () => {
    const text = asLatin1(build());
    const startxref = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
    const table = text.slice(startxref);

    const [, count] = /^xref\n0 (\d+)\n/.exec(table) as RegExpExecArray;
    expect(Number(count)).toBe(6);

    const entries = table.match(/^\d{10} \d{5} [nf] $/gm) as string[];
    expect(entries).toHaveLength(6);
    // Every entry, including the trailing space, must be exactly 20 bytes.
    entries.forEach((entry) => {
      expect(entry.length + 1).toBe(20);
    });

    expect(entries[0]).toBe('0000000000 65535 f ');
    entries.slice(1).forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      const header = `${index + 1} 0 obj`;
      expect(text.slice(offset, offset + header.length)).toBe(header);
    });
  });

  it('declares a trailer whose /Size matches the object count', () => {
    const text = asLatin1(build());

    expect(text).toContain('trailer\n<< /Size 6 /Root 1 0 R >>');
  });

  it('embeds the samples verbatim and declares their length', () => {
    const pdf = build();
    const text = asLatin1(pdf);
    const streamStart =
      text.indexOf('stream\n', text.indexOf('5 0 obj')) + 'stream\n'.length;

    expect(text).toContain('/Length 6 >>');
    expect(Array.from(pdf.slice(streamStart, streamStart + 6))).toEqual(
      Array.from(RASTER.samples)
    );
  });

  it('describes the image as 8-bit DeviceRGB at the raster size', () => {
    const text = asLatin1(build());

    expect(text).toContain(
      '/Type /XObject /Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8'
    );
  });

  it('only declares /FlateDecode when the stream is actually compressed', () => {
    expect(asLatin1(build())).not.toContain('/FlateDecode');
    expect(asLatin1(build({ isCompressed: true }))).toContain('/FlateDecode');
  });

  it('sizes the page and the image placement to the requested points', () => {
    const text = asLatin1(build({ pageWidthPt: 480.75, pageHeightPt: 270.5 }));

    expect(text).toContain('/MediaBox [0 0 480.75 270.5]');
    expect(text).toContain('q 480.75 0 0 270.5 0 0 cm /Im0 Do Q');
  });
});
