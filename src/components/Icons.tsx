interface IconProps {
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

interface BaseIconProps extends IconProps {
  viewBox?: string;
  children: React.ReactNode;
}

function Icon({
  size = 24,
  strokeWidth = 1.5,
  viewBox = "0 0 24 24",
  className,
  style,
  children,
}: BaseIconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon size={18} {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon size={18} {...props}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon size={14} strokeWidth={2} {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  );
}


export function DownloadIcon(props: IconProps) {
  return (
    <Icon size={16} strokeWidth={2} {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </Icon>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Icon size={16} {...props}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <Icon size={16} {...props}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </Icon>
  );
}

export function RotateLeftIcon(props: IconProps) {
  return (
    <Icon size={16} strokeWidth={2} {...props}>
      <path d="M1 4v6h6" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </Icon>
  );
}

export function RotateRightIcon(props: IconProps) {
  return (
    <Icon size={16} strokeWidth={2} {...props}>
      <path d="M23 4v6h-6" />
      <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
    </Icon>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon size={14} strokeWidth={2.5} {...props}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  );
}


export function MergeIcon(props: IconProps) {
  return (
    <Icon size={32} {...props}>
      <path d="M5 3v6l7 7" />
      <path d="M19 3v6l-7 7" />
      <path d="M12 16v5" />
      <polyline points="9 18 12 21 15 18" />
    </Icon>
  );
}

export function ScissorsIcon(props: IconProps) {
  return (
    <Icon size={32} {...props}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </Icon>
  );
}

export function ExtractIcon(props: IconProps) {
  return (
    <Icon size={32} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon size={18} strokeWidth={2} {...props}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon size={16} strokeWidth={2} {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </Icon>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <Icon size={16} strokeWidth={2} {...props}>
      <circle cx="9" cy="6" r="1" fill="currentColor" />
      <circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" />
      <circle cx="15" cy="18" r="1" fill="currentColor" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon size={16} {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}

export function FileDocIcon(props: IconProps) {
  return (
    <Icon size={20} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </Icon>
  );
}


export function FilePlusIcon(props: IconProps) {
  return (
    <Icon size={72} strokeWidth={1.2} viewBox="0 0 28 28" {...props}>
      {/* Document shape with folded corner */}
      <path d="M15 2H6a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9Z" />
      <polyline points="15 2 15 9 22 9" />
      {/* "PDF" text centered on document */}
      <text x="13" y="18" textAnchor="middle" fill="currentColor" stroke="none" fontSize="5.5" fontWeight="600" fontFamily="system-ui, sans-serif">PDF</text>
      {/* Plus badge in lower-right — background circle to mask document border */}
      <circle cx="23" cy="23" r="5.5" fill="var(--background, #fff)" stroke="none" />
      <circle cx="23" cy="23" r="4.5" fill="currentColor" stroke="none" />
      <line x1="23" y1="20.8" x2="23" y2="25.2" stroke="var(--background, #fff)" strokeWidth="1.5" />
      <line x1="20.8" y1="23" x2="25.2" y2="23" stroke="var(--background, #fff)" strokeWidth="1.5" />
    </Icon>
  );
}

export function MergeFilesIcon(props: IconProps) {
  return (
    <Icon size={72} strokeWidth={1.5} viewBox="0 0 28 28" {...props}>
      {/* Back document — only the outline not hidden behind the front one */}
      <path d="M11,19 H5 a2,2 0 0 1 -2,-2 V4 a2,2 0 0 1 2,-2 H12 L17,7 V9" />
      <path d="M12,2 v5 h5" />
      {/* Front document */}
      <path d="M13,9 h7 l5,5 v10 a2,2 0 0 1 -2,2 h-10 a2,2 0 0 1 -2,-2 v-13 a2,2 0 0 1 2,-2 z" />
      <path d="M20,9 v5 h5" />
    </Icon>
  );
}

export function RotateIcon(props: IconProps) {
  return <RotateRightIcon size={32} strokeWidth={1.5} {...props} />;
}

export function CollateIcon(props: IconProps) {
  return (
    <Icon size={32} {...props}>
      {/* Two page columns feeding into an interleaved stack */}
      <rect x="3" y="4" width="6" height="16" rx="1" />
      <rect x="15" y="4" width="6" height="16" rx="1" />
      <line x1="9" y1="8" x2="15" y2="10" />
      <line x1="9" y1="12" x2="15" y2="14" />
      <line x1="9" y1="16" x2="15" y2="18" />
    </Icon>
  );
}

export function CollateFilesIcon(props: IconProps) {
  return (
    <Icon size={72} strokeWidth={1.5} viewBox="0 0 28 28" {...props}>
      {/* Two documents interleaving into one — pages alternating from each */}
      <path d="M4,3 h7 l3,3 v6" />
      <path d="M24,3 h-7 l-3,3 v6" />
      <path d="M11,3 v3 h3" />
      <path d="M17,3 v3 h-3" />
      {/* Interleaved output stack */}
      <rect x="8" y="14" width="12" height="2.5" rx="0.5" />
      <rect x="8" y="18" width="12" height="2.5" rx="0.5" fill="currentColor" stroke="none" opacity="0.35" />
      <rect x="8" y="22" width="12" height="2.5" rx="0.5" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon size={32} {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Icon>
  );
}

export function UnlockIcon(props: IconProps) {
  return (
    <Icon size={32} {...props}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V5a4 4 0 0 1 8 0v2" />
    </Icon>
  );
}

export function CompressIcon(props: IconProps) {
  return (
    <Icon size={32} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v6c9 1 9 5 0 6v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4c-9-1-9-5 0-6V8Z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="2" y1="12.6" x2="15" y2="12.6" strokeWidth="1" />
      <line x1="9" y1="13.4" x2="22" y2="13.4" strokeWidth="1" />
    </Icon>
  );
}

export function BatesIcon(props: IconProps) {
  return (
    <Icon size={32} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <text x="12" y="17" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontWeight="600" fontFamily="monospace">001</text>
    </Icon>
  );
}

export function AttachIcon(props: IconProps) {
  return (
    <Icon size={32} {...props}>
      {/* Document with pages added above and below */}
      <path d="M13.5 7H8a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 8 17h8a1.5 1.5 0 0 0 1.5-1.5V11z" />
      <polyline points="13.5 7 13.5 11 17.5 11" />
      <line x1="12" y1="1.5" x2="12" y2="4.5" />
      <line x1="10.5" y1="3" x2="13.5" y2="3" />
      <line x1="12" y1="19.5" x2="12" y2="22.5" />
      <line x1="10.5" y1="21" x2="13.5" y2="21" />
    </Icon>
  );
}

export function ContrastIcon(props: IconProps) {
  return (
    <Icon size={32} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3 A9 9 0 0 1 12 21 Z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </Icon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon size={32} {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Icon>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <Icon size={16} {...props}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </Icon>
  );
}

export function PlusCircleIcon(props: IconProps) {
  return (
    <Icon size={16} strokeWidth={2} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </Icon>
  );
}

export function GitHubIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      style={style}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
