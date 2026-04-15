import { DismissibleBanner } from "./DismissibleBanner";

interface WizardBannersProps {
  rejectedMessage?: string;
  passwordProtectedMessage?: string;
  dismissLabel: string;
  onDismissRejected?: () => void;
  onDismissPasswordProtected?: () => void;
}

export function WizardBanners({
  rejectedMessage,
  passwordProtectedMessage,
  dismissLabel,
  onDismissRejected,
  onDismissPasswordProtected,
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
    </>
  );
}
