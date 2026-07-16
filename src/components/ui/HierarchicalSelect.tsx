'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface HierarchicalOption {
  value: string;
  label: string;
  depth: number;
}

interface HierarchicalSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Flat options, e.g. "All Phases" / "No phase (Extras)", always at depth 0. */
  fixedOptions?: HierarchicalOption[];
  /** Indented phase-tree options. */
  treeOptions: HierarchicalOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** A themed dropdown for hierarchical (indented) option lists — native `<select>` option
 * highlight/selection colors are OS-rendered and can't be restyled to match the app's accent
 * color in most browsers, which is exactly why this exists instead of a plain <select>. */
export default function HierarchicalSelect({
  value,
  onChange,
  fixedOptions = [],
  treeOptions,
  placeholder = 'Select…',
  disabled,
  className = '',
}: HierarchicalSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const allOptions = [...fixedOptions, ...treeOptions];
  const selected = allOptions.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="input text-sm w-full flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-[rgba(232,228,220,0.4)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border shadow-2xl py-1"
          style={{ backgroundColor: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}
        >
          {allOptions.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value || '__empty__'}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors hover:bg-[rgba(var(--ax-accent-rgb),0.12)]"
                style={{
                  paddingLeft: 12 + o.depth * 16,
                  color: isSelected ? 'var(--ax-accent)' : '#e8e4dc',
                  backgroundColor: isSelected ? 'rgba(var(--ax-accent-rgb),0.15)' : undefined,
                }}
              >
                <Check className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
