"use client";

import type React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  PlusIcon,
  TrashIcon,
  DownloadIcon,
  UndoIcon,
  RedoIcon,
  RotateLeftIcon,
  ImageIcon,
  EyeIcon,
  ChevronDownIcon,
} from "./Icons";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface MenuAction {
  label: string;
  onClick: () => void;
}

function DropdownIconButton({
  icon: Icon,
  label,
  disabled,
  items,
}: {
  icon: React.ComponentType;
  label: string;
  disabled?: boolean;
  items: MenuAction[];
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="default" disabled={disabled || items.length === 0} aria-label={label} />
              }
            />
          }
        >
          <Icon />
          <ChevronDownIcon />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} onClick={item.onClick}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TipButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ComponentType;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon" disabled={disabled} onClick={onClick} aria-label={label} />}
      >
        <Icon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/*  PanelHeader                                                        */
/* ------------------------------------------------------------------ */

export interface PanelHeaderProps {
  onAddFiles: () => void;
  onClearAll: () => void;
  clearAllDisabled?: boolean;
  previewVisible?: boolean;
  onTogglePreview?: () => void;
  onRotateLeft?: () => void;
  onRotateRight?: () => void;
  rotateDisabled?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onExtractAllImages?: () => void;
  onExtractFocusedPage?: () => void;
  extractAllDisabled?: boolean;
  extractPageDisabled?: boolean;
  isExtracting?: boolean;
  onRemoveSelected?: () => void;
  removeSelectedDisabled?: boolean;
  onExportAll?: () => void;
  onExportSelection?: () => void;
  exportAllDisabled?: boolean;
  exportSelectionDisabled?: boolean;
}

export function PanelHeader({
  onAddFiles,
  onClearAll,
  clearAllDisabled,
  previewVisible,
  onTogglePreview,
  onRotateLeft,
  onRotateRight,
  rotateDisabled,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onExtractAllImages,
  onExtractFocusedPage,
  extractAllDisabled,
  extractPageDisabled,
  isExtracting,
  onRemoveSelected,
  removeSelectedDisabled,
  onExportAll,
  onExportSelection,
  exportAllDisabled,
  exportSelectionDisabled,
}: PanelHeaderProps) {
  const t = useTranslations("documentPanel");

  const removeItems: MenuAction[] = [
    ...(!removeSelectedDisabled ? [{ label: t("removeSelected"), onClick: () => onRemoveSelected?.() }] : []),
    ...(!clearAllDisabled ? [{ label: t("removeAll"), onClick: () => onClearAll() }] : []),
  ];

  const exportItems: MenuAction[] = [
    ...(!exportAllDisabled ? [{ label: t("exportAll"), onClick: () => onExportAll?.() }] : []),
    ...(!exportSelectionDisabled ? [{ label: t("exportSelection"), onClick: () => onExportSelection?.() }] : []),
  ];

  const rotateItems: MenuAction[] = [
    ...(!rotateDisabled ? [
      { label: t("rotateLeft"), onClick: () => onRotateLeft?.() },
      { label: t("rotateRight"), onClick: () => onRotateRight?.() },
    ] : []),
  ];

  const extractItems: MenuAction[] = [
    ...(!extractPageDisabled ? [{ label: t("extractFromSelected"), onClick: () => onExtractFocusedPage?.() }] : []),
    ...(!extractAllDisabled ? [{ label: t("extractFromAll"), onClick: () => onExtractAllImages?.() }] : []),
  ];

  return (
    <div className="border-b border-border bg-background">
      <div role="toolbar" aria-label="Workbench tools" className="flex flex-wrap items-center gap-1 px-2 py-1.5">
        {/* File: Add / Remove / Export */}
        <div className="flex items-center">
          <Button variant="secondary" size="default" onClick={onAddFiles} className="rounded-r-none">
            <PlusIcon />
            {t("addFiles")}
          </Button>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={<Button variant="secondary" size="default" disabled={removeItems.length === 0} className="rounded-none border-l border-border/30 px-1.5" aria-label={t("remove")} />}
                  />
                }
              >
                <TrashIcon />
                <ChevronDownIcon />
              </TooltipTrigger>
              <TooltipContent>{t("remove")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              {removeItems.map((item) => (
                <DropdownMenuItem key={item.label} onClick={item.onClick}>
                  {item.icon && <item.icon />}
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={<Button variant="secondary" size="default" disabled={exportItems.length === 0} className="rounded-l-none border-l border-border/30 px-1.5" aria-label={t("export")} />}
                  />
                }
              >
                <DownloadIcon />
                <ChevronDownIcon />
              </TooltipTrigger>
              <TooltipContent>{t("export")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start">
              {exportItems.map((item) => (
                <DropdownMenuItem key={item.label} onClick={item.onClick}>
                  {item.icon && <item.icon />}
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Separator orientation="vertical" className="mx-1 !h-6" />

        {/* Edit: Undo / Redo */}
        <div className="flex items-center">
          <TipButton icon={UndoIcon} label={t("undo")} disabled={!canUndo} onClick={() => onUndo?.()} />
          <TipButton icon={RedoIcon} label={t("redo")} disabled={!canRedo} onClick={() => onRedo?.()} />
        </div>

        <Separator orientation="vertical" className="mx-1 !h-6" />

        {/* Tools: Rotate / Extract */}
        <DropdownIconButton icon={RotateLeftIcon} label={t("rotateGroup")} disabled={rotateDisabled} items={rotateItems} />
        <DropdownIconButton
          icon={ImageIcon}
          label={isExtracting ? t("extracting") : t("extractImages")}
          disabled={isExtracting}
          items={extractItems}
        />

        {/* View: Preview toggle */}
        {onTogglePreview && (
          <>
            <Separator orientation="vertical" className="mx-1 !h-6" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Toggle
                    size="default"
                    pressed={previewVisible}
                    onPressedChange={() => onTogglePreview()}
                    aria-label={t("togglePreview")}
                  />
                }
              >
                <EyeIcon />
              </TooltipTrigger>
              <TooltipContent>{t("togglePreview")}</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
