export function DropIndicator() {
  return (
    <div className="flex items-center py-0.5">
      <div className="h-[2px] w-full rounded-full bg-primary" />
    </div>
  );
}

export function DropIndicatorVertical() {
  return (
    <div className="absolute left-0 top-0 z-10 flex h-full items-center">
      <div className="h-full w-[2px] rounded-full bg-primary" />
    </div>
  );
}
