/**
 * Builds the isometric grid tile as a data URI.
 *
 * Replaces the static `assets/grid-tile-bg.svg`, which had `stroke="#000000"`
 * baked in — invisible against a dark canvas. Geometry is unchanged; only the
 * stroke is now driven by `theme.customVars.customPalette.gridLine`.
 */
export const gridTileDataUri = (strokeColor: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 141.38828 163.26061">
  <g stroke="${strokeColor}" stroke-width="1" fill="none">
    <polygon points="70.69436 122.44546 .00022 81.63018 70.69392 40.81515 141.38806 81.63043 70.69436 122.44546"/>
    <line x1="70.69414" y1="40.81503" x2="141.38784" />
    <line y1="0" x2="70.69414" y2="40.81528" />
    <line x1="70.69414" y1="122.44559" x2=".00044" y2="163.26061" />
    <line x1="141.38828" y1="163.26061" x2="70.69414" y2="122.44533" />
  </g>
</svg>`;

  // encodeURIComponent, not base64: keeps the URI readable in devtools and
  // avoids a btoa() dependency for non-ASCII safety.
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};
