"use client";

import { useTranslations } from "next-intl";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { ProcessingOverlay } from "./ProcessingOverlay";

// Full-screen "loading your files" indicator shown while dropped/picked files
// are being parsed and stored. Delayed via useDelayedFlag so small files that
// ingest near-instantly never flash a spinner.
export function IngestionOverlay({ active }: { active: boolean }) {
  const t = useTranslations("common");
  const visible = useDelayedFlag(active, { showAfterMs: 300 });
  return (
    <ProcessingOverlay
      visible={visible}
      title={t("loadingFilesTitle")}
      description={t("loadingFilesDescription")}
    />
  );
}
