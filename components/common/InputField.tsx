import React from 'react';

interface InputFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string;
  disabled?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
}) => (
  <div className="group">
    <label htmlFor={id} className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 transition-colors group-focus-within:text-amber-500">{label}</label>
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        className="block w-full pl-4 pr-3 py-3 bg-black/40 border border-white/10 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-all text-sm font-medium"
        placeholder={placeholder}
        required
        disabled={disabled}
      />
    </div>
  </div>
);

export default InputField;
