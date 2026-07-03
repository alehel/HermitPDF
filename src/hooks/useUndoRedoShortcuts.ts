import { useEffect } from "react";

export function useUndoRedoShortcuts(
  onUndo: () => void,
  onRedo: () => void,
) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // With Shift held, e.key is the uppercase letter ("Z"), so compare
      // case-insensitively or Ctrl/Cmd+Shift+Z never matches.
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if ((key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey)) {
        e.preventDefault();
        onRedo();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onUndo, onRedo]);
}
