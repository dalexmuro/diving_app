import { Plus, X } from 'lucide-react';
import { useId, useState } from 'react';

interface SmartMultiSelectProps {
  label: string;
  values: string[];
  options: string[];
  placeholder?: string;
  addLabel: string;
  onChange: (nextValues: string[]) => void;
}

/**
 * Multi-value combobox backed by a saved catalog: pick multiple existing items
 * or type new entries (each new entry is auto-saved to the catalog on dive save).
 */
export function SmartMultiSelect({
  label,
  values,
  options,
  placeholder,
  addLabel,
  onChange,
}: SmartMultiSelectProps) {
  const listId = useId();
  const [draft, setDraft] = useState('');

  const availableOptions = options.filter(
    (opt) => !values.some((v) => v.toLowerCase() === opt.toLowerCase()),
  );

  function addEntry(raw: string) {
    const clean = raw.trim();
    if (!clean) return;
    if (!values.some((v) => v.toLowerCase() === clean.toLowerCase())) {
      onChange([...values, clean]);
    }
    setDraft('');
  }

  function removeEntry(target: string) {
    onChange(values.filter((v) => v !== target));
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-slate-700">{label}</label>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((val) => (
            <span
              key={val}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 text-sky-900 border border-sky-200"
            >
              <span>{val}</span>
              <button
                type="button"
                aria-label={`Remove ${val}`}
                onClick={() => removeEntry(val)}
                className="text-sky-600 hover:text-red-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          list={listId}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addEntry(draft);
            }
          }}
          className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
        />
        <button
          type="button"
          onClick={() => addEntry(draft)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium px-3 py-2 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-sky-600" />
          <span>{addLabel}</span>
        </button>
      </div>

      <datalist id={listId}>
        {availableOptions.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </div>
  );
}
