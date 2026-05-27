"use client";

import {
  DPI_PRESETS,
  PAGE_SIZE_KEYS,
  isResizeActive,
  type DpiPreset,
  type ImageProcessConfig,
  type PageSizeKey,
} from "@/lib/imageResize";

export interface ImageProcessLabels {
  recompressImages: string;
  recompressImagesDesc: string;
  imageQuality: string;
  smaller: string;
  higherQuality: string;
  pageSize: string;
  dpi: string;
  /** Label shown for the no-resize entry in the page-size dropdown. */
  originalSize: string;
  /** Help text describing what the size constraint + DPI do, with DPI usage hints. */
  resizeHint: string;
}

interface ImageProcessSettingsProps {
  config: ImageProcessConfig;
  onChange: (next: ImageProcessConfig) => void;
  labels: ImageProcessLabels;
}

/**
 * Shared image-processing controls used by both the compress and merge wizards.
 *
 * One master toggle ("Recompress images") gates everything. When it's on, the
 * quality slider and page-size dropdown become active. The page-size dropdown
 * has an "Original" entry that means "don't resize" — picking it dims the DPI
 * dropdown since DPI is only meaningful relative to a chosen paper size.
 */
export function ImageProcessSettings({
  config,
  onChange,
  labels,
}: ImageProcessSettingsProps) {
  const enabled = config.recompress;
  const resizeActive = isResizeActive(config.resize);

  return (
    <>
      {/* Master toggle */}
      <label className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={config.recompress}
          onClick={() => onChange({ ...config, recompress: !config.recompress })}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            config.recompress ? "bg-primary" : "bg-border"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              config.recompress ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <div>
          <span className="text-sm font-medium text-foreground">{labels.recompressImages}</span>
          <p className="text-xs text-muted-foreground">{labels.recompressImagesDesc}</p>
        </div>
      </label>

      {/* Image quality slider */}
      <div className={enabled ? "" : "opacity-40"}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{labels.imageQuality}</span>
          <span className="text-xs font-medium text-foreground tabular-nums">{config.quality}%</span>
        </div>
        <input
          type="range"
          min={30}
          max={100}
          step={5}
          value={config.quality}
          onChange={(e) => onChange({ ...config, quality: e.target.valueAsNumber })}
          disabled={!enabled}
          className="w-full accent-primary"
        />
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{labels.smaller}</span>
          <span>{labels.higherQuality}</span>
        </div>
      </div>

      {/* Page size + DPI dropdowns. Page size includes "Original" as a no-resize
          default; DPI is dimmed when Original is selected since it has no effect. */}
      <div className={`grid grid-cols-2 gap-3 ${enabled ? "" : "opacity-40"}`}>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{labels.pageSize}</span>
          <select
            value={config.resize.pageSize}
            onChange={(e) =>
              onChange({
                ...config,
                resize: { ...config.resize, pageSize: e.target.value as PageSizeKey },
              })
            }
            disabled={!enabled}
            className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {PAGE_SIZE_KEYS.map((key) => (
              <option key={key} value={key}>
                {key === "Original" ? labels.originalSize : key}
              </option>
            ))}
          </select>
        </label>
        <label className={`block ${resizeActive ? "" : "opacity-40"}`}>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{labels.dpi}</span>
          <select
            value={config.resize.dpi}
            onChange={(e) =>
              onChange({
                ...config,
                resize: { ...config.resize, dpi: Number(e.target.value) as DpiPreset },
              })
            }
            disabled={!enabled || !resizeActive}
            className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {DPI_PRESETS.map((dpi) => (
              <option key={dpi} value={dpi}>
                {dpi}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Help text spans both columns so the size-constraint + DPI explanation
          stays readable. Dims with the rest of the controls when the master
          toggle is off. */}
      <p className={`text-xs text-muted-foreground ${enabled ? "" : "opacity-40"}`}>
        {labels.resizeHint}
      </p>
    </>
  );
}
