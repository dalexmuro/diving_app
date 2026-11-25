import { Plus, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

interface SmartMultiSelectProps {
  label: string;
  values: string[];
  options: string[];
  placeholder?: string;
  addLabel: string;
  onChange: (nextValues: string[]) => void;
}

/**
 * Touch-friendly multi-value combobox backed by a saved catalog.
 * Replaces native <datalist> so saved items are immediately tappable on Android Chrome.
 */
export function SmartMultiSelect({
  label,
  values,
  options,
  placeholder,
  addLabel,
  onChange,
}: SmartMultiSelectProps) {
  const inputId = useId();
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  const availableOptions = useMemo(() => {
    const remaining = options.filter(
      (opt) => !values.some((v) => v.toLowerCase() === opt.toLowerCase()),
    );
    const q = draft.trim().toLowerCase();
    if (!q) return remaining;
    return remaining.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, values, draft]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  function addEntry(raw: string) {
    const clean = raw.trim();
    if (!clean) return;
    if (!values.some((v) => v.toLowerCase() === clean.toLowerCase())) {
      onChange([...values, clean]);
    }
    setDraft('');
    setOpen(false);
  }

  function removeEntry(target: string) {
    onChange(values.filter((v) => v !== target));
  }

  return (
    <div ref={wrapperRef} className="relative space-y-2">
      <label htmlFor={inputId} className="block text-xs font-medium text-slate-700">
        {label}
      </label>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((val) => (
            <span
              key={val}
              className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium bg-sky-50 text-sky-900 border border-sky-200"
            >
              <span>{val}</span>
              <button
                type="button"
                aria-label={`Remove ${val}`}
                onClick={() => removeEntry(val)}
                className="p-1 rounded-full text-sky-600 hover:text-red-600 hover:bg-red-50 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={draft}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addEntry(draft);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
        />
        <button
          type="button"
          onClick={() => addEntry(draft)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 text-xs font-medium px-3 py-2 cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5 text-sky-600" />
          <span>{addLabel}</span>
        </button>
      </div>

      {open && availableOptions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100"
        >
          {availableOptions.map((opt) => (
            <li key={opt} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addEntry(opt)}
                className="w-full text-left px-3 py-2.5 text-sm text-slate-800 hover:bg-sky-50 active:bg-sky-100 cursor-pointer"
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
