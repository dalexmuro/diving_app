import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { usePreferences } from '../i18n/I18nContext';

interface SmartSelectProps {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}

/**
 * Touch-friendly combobox replacing native <datalist> (which behaves inconsistently on Android Chrome).
 * Shows all saved catalog options on focus/tap, filters while typing, and allows entering new values.
 */
export function SmartSelect({ label, value, options, placeholder, onChange }: SmartSelectProps) {
  const { t } = usePreferences();
  const inputId = useId();
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, value]);

  const exactMatch = options.some((opt) => opt.toLowerCase() === value.trim().toLowerCase());

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

  return (
    <div ref={wrapperRef} className="relative space-y-1">
      <label htmlFor={inputId} className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={value}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
          className="w-full pl-3 pr-9 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
        />
        {options.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={label}
            onClick={() => setOpen((prev) => !prev)}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {open && (filtered.length > 0 || (value.trim() && !exactMatch)) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100"
        >
          {filtered.map((opt) => (
            <li key={opt} role="option" aria-selected={opt === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 text-sm text-slate-800 hover:bg-sky-50 active:bg-sky-100 cursor-pointer"
              >
                {opt}
              </button>
            </li>
          ))}
          {value.trim() && !exactMatch && (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(value.trim());
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 text-xs font-medium text-sky-700 bg-sky-50/50 hover:bg-sky-100/70 cursor-pointer"
              >
                {t('useCustomValue')} «{value.trim()}»
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
