"use client";

import { useRef, KeyboardEvent, ChangeEvent } from "react";
import { CloseIcon } from "./Icons";

interface KeywordsInputProps {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  draft: string;
  onDraftChange: (next: string) => void;
  removeLabel: (keyword: string) => string;
}

export function parseChips(value: string): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function joinChips(chips: string[]): string {
  return chips.join(", ");
}

export function KeywordsInput({
  id,
  value,
  onChange,
  draft,
  onDraftChange,
  removeLabel,
}: KeywordsInputProps) {
  const chips = parseChips(value);
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      onDraftChange("");
      return;
    }
    onChange(joinChips([...chips, trimmed]));
    onDraftChange("");
  }

  function removeAt(index: number) {
    onChange(joinChips(chips.filter((_, i) => i !== index)));
    inputRef.current?.focus();
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const text = e.target.value;
    if (!text.includes(",")) {
      onDraftChange(text);
      return;
    }
    const parts = text.split(",");
    const newChips = parts.slice(0, -1).map((s) => s.trim()).filter(Boolean);
    if (newChips.length > 0) {
      onChange(joinChips([...chips, ...newChips]));
    }
    onDraftChange(parts[parts.length - 1].trimStart());
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && chips.length > 0) {
      e.preventDefault();
      removeAt(chips.length - 1);
    }
  }

  function handleBlur() {
    if (draft.trim()) commit(draft);
  }

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="flex w-full min-h-8 cursor-text flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
    >
      {chips.map((chip, i) => (
        <span
          key={`${i}-${chip}`}
          className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-xs text-foreground"
        >
          {chip}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeAt(i);
            }}
            aria-label={removeLabel(chip)}
            className="-mr-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CloseIcon size={10} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="min-w-[8ch] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
