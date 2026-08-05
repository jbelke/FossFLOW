import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Box,
  Button,
  Stack,
  Alert,
  Checkbox,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography
} from '@mui/material';
import { useModelStore } from 'src/stores/modelStore';
import {
  exportAsImage,
  exportAsPdf,
  downloadFile as downloadFileUtil,
  dataUrlToBlob,
  captureFormatFor,
  generateGenericFilename,
  modelFromModelStore,
  FILE_EXTENSIONS,
  ExportImageFormat
} from 'src/utils';
import { ModelStore } from 'src/types';
import { useDiagramUtils } from 'src/hooks/useDiagramUtils';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { Isoflow } from 'src/Isoflow';
import { Loader } from 'src/components/Loader/Loader';
import { customVars } from 'src/styles/theme';
import { ColorPicker } from 'src/components/ColorSelector/ColorPicker';

interface FormatOption {
  value: ExportImageFormat;
  label: string;
  hint: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    value: 'png',
    label: 'PNG image',
    hint: 'Lossless. The safest choice for sharing and embedding.'
  },
  {
    value: 'jpeg',
    label: 'JPG image',
    hint: 'Much smaller, but lossy — edges and text pick up artefacts.'
  },
  {
    value: 'svg',
    label: 'SVG image',
    hint: 'Scales without blurring in browsers. Not editable in Inkscape or Illustrator.'
  },
  {
    value: 'pdf',
    label: 'PDF document',
    hint: 'One page, sized to the diagram.'
  }
];

/** Chrome and Firefox both refuse canvases beyond roughly this side length. */
const MAX_RASTER_SIDE = 16384;
/**
 * Total pixel budget. Well under what a browser will technically allocate, but
 * a 16MP export is already generous and keeps the PDF's uncompressed RGB buffer
 * (3 bytes per pixel) to a size the tab can actually hold.
 */
const MAX_RASTER_PIXELS = 16_000_000;

interface Props {
  quality?: number;
  onClose: () => void;
}

export const ExportImageDialog = ({ onClose, quality = 1.5 }: Props) => {
  const containerRef = useRef<HTMLDivElement>();
  const isExporting = useRef<boolean>(false);
  const currentView = useUiStateStore((state) => {
    return state.view;
  });
  const [imageData, setImageData] = React.useState<string>();
  const [exportError, setExportError] = useState(false);
  const [format, setFormat] = useState<ExportImageFormat>('png');
  const [isPreparingDownload, setIsPreparingDownload] = useState(false);
  const { getUnprojectedBounds } = useDiagramUtils();
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const model = useModelStore((state): Omit<ModelStore, 'actions'> => {
    return modelFromModelStore(state);
  });

  const unprojectedBounds = useMemo(() => {
    return getUnprojectedBounds();
  }, [getUnprojectedBounds]);

  // Browsers cap both the side length and the total area of a canvas. A large
  // diagram blows through that budget at `quality` scale and fails to rasterise
  // at all, so shrink the offscreen render until it fits instead of erroring.
  const exportScale = useMemo(() => {
    const { width, height } = unprojectedBounds;

    if (!width || !height) {
      return quality;
    }

    return Math.min(
      quality,
      MAX_RASTER_SIDE / width,
      MAX_RASTER_SIDE / height,
      Math.sqrt(MAX_RASTER_PIXELS / (width * height))
    );
  }, [unprojectedBounds, quality]);

  const isScaledDown = exportScale < quality;

  useEffect(() => {
    uiStateActions.setMode({
      type: 'INTERACTIONS_DISABLED',
      showCursor: false
    });
  }, [uiStateActions]);

  const [showGrid, setShowGrid] = useState(false);
  const handleShowGridChange = (checked: boolean) => {
    setShowGrid(checked);
  };

  const [backgroundColor, setBackgroundColor] = useState<string>(
    customVars.customPalette.diagramBg
  );
  const handleBackgroundColorChange = (color: string) => {
    setBackgroundColor(color);
  };

  // PDF reuses the PNG capture, so switching between those two needs no
  // re-render of the offscreen diagram.
  const captureFormat = captureFormatFor(format);

  const exportImage = useCallback(() => {
    if (!containerRef.current || isExporting.current) {
      return;
    }

    isExporting.current = true;
    exportAsImage(containerRef.current as HTMLDivElement, {
      format: captureFormat,
      backgroundColor
    })
      .then((data) => {
        setImageData(data);
        isExporting.current = false;
      })
      .catch((err) => {
        console.error(err);
        setExportError(true);
        isExporting.current = false;
      });
  }, [captureFormat, backgroundColor]);

  // Recapture whenever anything that changes the rendered output changes. The
  // delay lets the offscreen diagram settle after a re-render before we read it.
  useEffect(() => {
    setImageData(undefined);
    setExportError(false);
    isExporting.current = false;
    const timer = setTimeout(() => {
      exportImage();
    }, 100);

    return () => {
      return clearTimeout(timer);
    };
  }, [exportImage, showGrid]);

  const downloadFile = useCallback(async () => {
    if (!imageData) return;

    const filename = generateGenericFilename(FILE_EXTENSIONS[format]);
    setIsPreparingDownload(true);

    try {
      const file =
        format === 'pdf'
          ? await exportAsPdf(imageData, {
              pageWidth: unprojectedBounds.width,
              pageHeight: unprojectedBounds.height,
              backgroundColor
            })
          : dataUrlToBlob(imageData);

      downloadFileUtil(file, filename);
    } catch (err) {
      console.error(err);
      setExportError(true);
    } finally {
      setIsPreparingDownload(false);
    }
  }, [imageData, format, backgroundColor, unprojectedBounds]);

  // The offscreen diagram stays mounted for the life of the dialog so that a
  // recapture is always possible; keep its props stable so it does not reload
  // the model on every render of this component.
  const initialData = useMemo(() => {
    return { ...model, fitToView: true, view: currentView };
  }, [model, currentView]);

  const rendererProps = useMemo(() => {
    return { showGrid, backgroundColor };
  }, [showGrid, backgroundColor]);

  const activeFormat = FORMAT_OPTIONS.find((option) => {
    return option.value === format;
  }) as FormatOption;

  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>Export diagram</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Alert severity="info">
            <strong>
              Certain browsers may not support exporting images properly.
            </strong>{' '}
            <br />
            For best results, please use the latest version of either Chrome or
            Firefox.
          </Alert>

          {isScaledDown && (
            <Alert severity="warning">
              This diagram is larger than your browser can rasterise at full
              size, so the export is scaled to{' '}
              {Math.round((exportScale / quality) * 100)}% —{' '}
              {Math.round(unprojectedBounds.width * exportScale)} ×{' '}
              {Math.round(unprojectedBounds.height * exportScale)} pixels. Fine
              detail and small text will be lost.
            </Alert>
          )}

          <Box
            sx={{
              position: 'absolute',
              width: 0,
              height: 0,
              overflow: 'hidden'
            }}
          >
            <Box
              ref={containerRef}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0
              }}
              style={{
                width: unprojectedBounds.width * exportScale,
                height: unprojectedBounds.height * exportScale
              }}
            >
              <Isoflow
                editorMode="NON_INTERACTIVE"
                initialData={initialData}
                renderer={rendererProps}
              />
            </Box>
          </Box>
          {!imageData && !exportError && (
            <Box
              sx={{
                position: 'relative',
                top: 0,
                left: 0,
                width: 500,
                height: 300,
                bgcolor: 'common.white'
              }}
            >
              <Loader size={2} />
            </Box>
          )}
          <Stack alignItems="center" spacing={2}>
            {imageData && (
              <Box
                component="img"
                sx={{
                  maxWidth: '100%'
                }}
                style={{
                  width: unprojectedBounds.width
                }}
                src={imageData}
                alt="preview"
              />
            )}
            <Box sx={{ width: '100%' }}>
              <Box component="fieldset">
                <Typography variant="caption" component="legend">
                  Options
                </Typography>

                <TextField
                  select
                  fullWidth
                  size="small"
                  label="Format"
                  value={format}
                  helperText={activeFormat.hint}
                  onChange={(event) => {
                    setFormat(event.target.value as ExportImageFormat);
                  }}
                  sx={{ mb: 1 }}
                >
                  {FORMAT_OPTIONS.map((option) => {
                    return (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    );
                  })}
                </TextField>

                <FormControlLabel
                  label="Show grid"
                  control={
                    <Checkbox
                      size="small"
                      checked={showGrid}
                      onChange={(event) => {
                        handleShowGridChange(event.target.checked);
                      }}
                    />
                  }
                />
                <FormControlLabel
                  label="Background color"
                  control={
                    <ColorPicker
                      value={backgroundColor}
                      onChange={handleBackgroundColorChange}
                    />
                  }
                />
              </Box>
            </Box>
            {imageData && (
              <Stack sx={{ width: '100%' }} alignItems="flex-end">
                <Stack direction="row" spacing={2}>
                  <Button variant="text" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button onClick={downloadFile} disabled={isPreparingDownload}>
                    {isPreparingDownload
                      ? 'Preparing…'
                      : `Download as ${FILE_EXTENSIONS[format].toUpperCase()}`}
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>

          {exportError && (
            <Alert severity="error">Could not export image</Alert>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
};
