"use client";

import { useTranslations } from "next-intl";
import { DismissibleBanner } from "./DismissibleBanner";

interface WizardBannersProps {
  rejectedMessage?: string;
  passwordProtectedMessage?: string;
  oversizedMessage?: string;
  environmentUnsupported?: boolean;
  dismissLabel: string;
  onDismissRejected?: () => void;
  onDismissPasswordProtected?: () => void;
  onDismissOversized?: () => void;
  onDismissEnvironmentUnsupported?: () => void;
}

export function WizardBanners({
  rejectedMessage,
  passwordProtectedMessage,
  oversizedMessage,
  environmentUnsupported,
  dismissLabel,
  onDismissRejected,
  onDismissPasswordProtected,
  onDismissOversized,
  onDismissEnvironmentUnsupported,
}: WizardBannersProps) {
  const tCommon = useTranslations("common");
  return (
    <>
      {environmentUnsupported && onDismissEnvironmentUnsupported && (
        <DismissibleBanner
          message={tCommon("storageUnsupported")}
          dismissLabel={dismissLabel}
          onDismiss={onDismissEnvironmentUnsupported}
        />
      )}
      {rejectedMessage && onDismissRejected && (
        <DismissibleBanner
          message={rejectedMessage}
          dismissLabel={dismissLabel}
          onDismiss={onDismissRejected}
        />
      )}
      {passwordProtectedMessage && onDismissPasswordProtected && (
        <DismissibleBanner
          message={passwordProtectedMessage}
          dismissLabel={dismissLabel}
          onDismiss={onDismissPasswordProtected}
        />
      )}
      {oversizedMessage && onDismissOversized && (
        <DismissibleBanner
          message={oversizedMessage}
          dismissLabel={dismissLabel}
          onDismiss={onDismissOversized}
        />
      )}
    </>
  );
}
