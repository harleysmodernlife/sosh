import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });
  }, []);

  if (signedIn === null) return null;
  if (signedIn) return <Redirect href="/(tabs)/home" />;
  return <Redirect href="/(auth)/login" />;
}
