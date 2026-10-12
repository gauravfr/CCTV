import type { ButtonHTMLAttributes, ReactNode } from 'react';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; children: ReactNode };
export function Button({ variant = 'secondary', className = '', ...props }: Props) { return <button className={`button button-${variant} ${className}`} {...props} />; }
