export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
    </div>
  );
}
