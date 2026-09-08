import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MUTE_KEY = 'video_muted';

const MuteContext = createContext<{ muted: boolean; toggleMute: () => void }>({
  muted: true,
  toggleMute: () => {},
});

export function MuteProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState(true); // default: muted

  useEffect(() => {
    AsyncStorage.getItem(MUTE_KEY).then(val => {
      if (val !== null) setMuted(val === 'true');
    });
  }, []);

  function toggleMute() {
    setMuted(prev => {
      const next = !prev;
      AsyncStorage.setItem(MUTE_KEY, String(next));
      return next;
    });
  }

  return (
    <MuteContext.Provider value={{ muted, toggleMute }}>
      {children}
    </MuteContext.Provider>
  );
}

export function useMute() {
  return useContext(MuteContext);
}
