'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [key, setKey] = useState(pathname);

  useEffect(() => {
    setKey(pathname);
  }, [pathname]);

  const hasSidebarChrome = pathname !== '/login';

  return (
    <div className={`flex-1 ${hasSidebarChrome ? 'md:ml-64 pt-16 md:pt-0' : ''}`}>
      <div key={key} className="animate-[pageIn_180ms_ease-out]">
        {children}
      </div>
    </div>
  );
}

