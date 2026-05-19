import { DismissibleBanner } from "./DismissibleBanner";

interface WizardBannersProps {
  rejectedMessage?: string;
  passwordProtectedMessage?: string;
  oversizedMessage?: string;
  dismissLabel: string;
  onDismissRejected?: () => void;
  onDismissPasswordProtected?: () => void;
  onDismissOversized?: () => void;
}

export function WizardBanners({
  rejectedMessage,
  passwordProtectedMessage,
  oversizedMessage,
  dismissLabel,
  onDismissRejected,
  onDismissPasswordProtected,
  onDismissOversized,
}: WizardBannersProps) {
  return (
    <>
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
