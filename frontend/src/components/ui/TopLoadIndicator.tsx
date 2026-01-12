'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function TopLoadIndicator() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let finish: number | null = null;
    const start = window.setTimeout(() => {
      setActive(true);
      setProgress(10);
      if (timer.current) window.clearInterval(timer.current);
      timer.current = window.setInterval(() => {
        setProgress(p => {
          if (p >= 90) return p;
          return Math.min(90, p + Math.max(1, Math.round((90 - p) * 0.08)));
        });
      }, 80);

      finish = window.setTimeout(() => {
        setProgress(100);
        window.setTimeout(() => {
          setActive(false);
          setProgress(0);
        }, 200);
      }, 450);
    }, 0);

    return () => {
      window.clearTimeout(start);
      if (timer.current) window.clearInterval(timer.current);
      if (finish) window.clearTimeout(finish);
    };
  }, [pathname]);

  if (!active) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-70 h-1 bg-transparent">
      <div
        className="h-full bg-linear-to-r from-blue-600 via-sky-500 to-blue-600 transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

