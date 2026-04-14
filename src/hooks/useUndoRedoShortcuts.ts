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

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if (
        (e.key === "z" && e.shiftKey) ||
        (e.key === "y" && !e.shiftKey)
      ) {
        e.preventDefault();
        onRedo();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onUndo, onRedo]);
}
