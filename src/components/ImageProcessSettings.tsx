"use client";

import {
  DPI_PRESETS,
  PAGE_SIZE_KEYS,
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
  resizeImages: string;
  resizeImagesDesc: string;
  pageSize: string;
  dpi: string;
}

interface ImageProcessSettingsProps {
  config: ImageProcessConfig;
  onChange: (next: ImageProcessConfig) => void;
  labels: ImageProcessLabels;
}

/**
 * Shared image-processing controls used by both the compress and merge wizards.
 * Renders the recompress toggle + quality slider followed by the resize toggle
 * + page-size and DPI dropdowns. The two wizards differ in how they apply the
 * settings (compress: to all embedded images; merge: to image-derived sources)
 * but the controls themselves are identical.
 */
export function ImageProcessSettings({
  config,
  onChange,
  labels,
}: ImageProcessSettingsProps) {
  return (
    <>
      {/* Recompress images toggle */}
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

      {/* Image quality slider — active whenever we'll re-encode any image,
          which is recompress=on (re-encode all) or resize=on (re-encode the
          downsampled ones). When both are off, no re-encoding happens so the
          slider has nothing to drive and is dimmed. */}
      {(() => {
        const willReencode = config.recompress || config.resize.enabled;
        return (
          <div className={willReencode ? "" : "opacity-40"}>
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
              disabled={!willReencode}
              className="w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{labels.smaller}</span>
              <span>{labels.higherQuality}</span>
            </div>
          </div>
        );
      })()}

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Resize images toggle */}
      <label className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={config.resize.enabled}
          onClick={() =>
            onChange({ ...config, resize: { ...config.resize, enabled: !config.resize.enabled } })
          }
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
            config.resize.enabled ? "bg-primary" : "bg-border"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              config.resize.enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <div>
          <span className="text-sm font-medium text-foreground">{labels.resizeImages}</span>
          <p className="text-xs text-muted-foreground">{labels.resizeImagesDesc}</p>
        </div>
      </label>

      {/* Page size + DPI dropdowns */}
      <div className={`grid grid-cols-2 gap-3 ${config.resize.enabled ? "" : "opacity-40"}`}>
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
            disabled={!config.resize.enabled}
            className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {PAGE_SIZE_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{labels.dpi}</span>
          <select
            value={config.resize.dpi}
            onChange={(e) =>
              onChange({
                ...config,
                resize: { ...config.resize, dpi: Number(e.target.value) as DpiPreset },
              })
            }
            disabled={!config.resize.enabled}
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
    </>
  );
}
