import { useId } from 'react';

interface SmartSelectProps {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}

/**
 * Single-value input backed by a catalog datalist: pick an existing option
 * or type a new value (automatically persisted to its catalog on dive save).
 */
export function SmartSelect({ label, value, options, placeholder, onChange }: SmartSelectProps) {
  const listId = useId();

  return (
    <label className="space-y-1 text-xs font-medium text-slate-700 block">
      <span>{label}</span>
      <input
        type="text"
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white text-slate-900"
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </label>
  );
}
