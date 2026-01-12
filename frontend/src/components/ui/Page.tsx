import { ReactNode } from 'react';
import Image from 'next/image';

export function Page({ children, width = 'lg' }: { children: ReactNode; width?: 'md' | 'lg' | 'xl' }) {
  const map: Record<string, string> = { md: 'max-w-4xl', lg: 'max-w-6xl', xl: 'max-w-7xl' };
  return <div className={`px-4 py-6 md:p-8 ${map[width] || map.lg} mx-auto`}>{children}</div>;
}

export function Loading({
  label = 'Carregando',
  size = 'md',
  className = '',
}: {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes: Record<string, { wrap: string; spinner: string; logo: string; text: string; logoDim: number }> = {
    sm: { wrap: 'py-6 gap-2', spinner: 'h-9 w-9', logo: 'h-4 w-4', text: 'text-sm', logoDim: 16 },
    md: { wrap: 'py-10 gap-3', spinner: 'h-12 w-12', logo: 'h-5 w-5', text: 'text-sm', logoDim: 20 },
    lg: { wrap: 'py-14 gap-3', spinner: 'h-16 w-16', logo: 'h-7 w-7', text: 'text-base', logoDim: 28 },
  };
  const s = sizes[size] || sizes.md;

  return (
    <div className={`flex flex-col items-center justify-center text-gray-500 ${s.wrap} ${className}`}>
      <div className={`relative ${s.spinner}`}>
        <div className="absolute inset-0 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" />
        <div className="absolute inset-1 rounded-full bg-white" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Image src="/assets/icone_logo_pluck.svg" alt="Pluck" width={s.logoDim} height={s.logoDim} className={s.logo} />
        </div>
      </div>
      <div className={s.text}>{label}</div>
    </div>
  );
}

export function InlineLoading({ label = 'Carregando' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-gray-500">
      <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" />
      <span className="text-sm">{label}</span>
    </span>
  );
}

