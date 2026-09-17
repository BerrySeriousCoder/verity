import type { ButtonHTMLAttributes } from 'react';

const variants = {
  primary:
    'border border-emerald-900 bg-emerald-900 text-white hover:bg-emerald-950',
  secondary:
    'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100',
  quiet: 'border border-transparent text-emerald-800 hover:bg-emerald-50',
};

export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
}) {
  return (
    <button
      {...props}
      type={type}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-default disabled:opacity-45 ${variants[variant]} ${className}`}
    />
  );
}
