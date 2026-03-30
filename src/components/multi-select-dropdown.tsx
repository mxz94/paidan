"use client";

import { useMemo, useState } from "react";
import { useEffect, useRef } from "react";

type Option = {
  value: string;
  label: string;
};

type Props = {
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function MultiSelectDropdown({
  options,
  value,
  onChange,
  placeholder = "请选择",
  disabled = false,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedLabels = useMemo(
    () => options.filter((item) => selectedSet.has(item.value)).map((item) => item.label),
    [options, selectedSet],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-left text-sm text-slate-700 outline-none transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
      >
        <span className="truncate">
          {selectedLabels.length > 0 ? selectedLabels.join("、") : placeholder}
        </span>
        <span className="text-xs text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && !disabled ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">已选 {selectedLabels.length} 项</span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              清空
            </button>
          </div>
          <ul className="space-y-1">
            {options.map((item) => {
              const checked = selectedSet.has(item.value);
              return (
                <li key={item.value}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        if (event.currentTarget.checked) {
                          onChange([...value, item.value]);
                        } else {
                          onChange(value.filter((v) => v !== item.value));
                        }
                      }}
                    />
                    <span className="text-sm text-slate-700">{item.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 border-t border-slate-100 pt-2 text-right">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              收起
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
