import { useState, useEffect } from 'react';

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function useCountdown(endsAt: string | null | undefined): string | null {
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!endsAt) return;

    const tick = () => {
      const ms = new Date(endsAt).getTime() - Date.now();
      setDisplay(ms > 0 ? formatCountdown(ms) : null);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  return display;
}
