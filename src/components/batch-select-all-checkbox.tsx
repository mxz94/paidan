"use client";

import { useId } from "react";

type Props = {
  targetSelector: string;
};

export function BatchSelectAllCheckbox({ targetSelector }: Props) {
  const id = useId();

  return (
    <input
      id={id}
      type="checkbox"
      aria-label="全选"
      onChange={(event) => {
        const checked = event.currentTarget.checked;
        const targets = document.querySelectorAll<HTMLInputElement>(targetSelector);
        targets.forEach((item) => {
          if (!item.disabled) {
            item.checked = checked;
          }
        });
      }}
      className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-400"
    />
  );
}

