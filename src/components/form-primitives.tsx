/**
 * Reusable form primitives extracted from ProjectForm.
 * Used by both custom section components and DynamicFormSection.
 */

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">{children}</label>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:bg-gray-100 disabled:text-gray-500 ${props.className ?? ""}`}
    />
  );
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent ${props.className ?? ""}`}
    >
      {children}
    </select>
  );
}

export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  helpKey,
  onHelp,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  helpKey?: string;
  onHelp?: (key: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300"
      />
      <label htmlFor={id} className="text-sm text-gray-700">{label}</label>
      {helpKey && onHelp && (
        <button type="button" onClick={() => onHelp(helpKey)} className="text-accent/60 hover:text-accent text-xs" title="Ajuda">?</button>
      )}
    </div>
  );
}
