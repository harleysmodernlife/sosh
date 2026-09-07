import 'react-native-url-polyfill/auto';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';

function navigateFromNotification(data: Record<string, unknown>) {
  const type = data?.type;
  if (type === 'pulse') router.push('/(tabs)/pulse');
  else if (type === 'trophy') router.push('/(tabs)/profile');
  else if (type === 'results' || type === 'milestone') router.push('/(tabs)/leaderboard');
  else if ((type === 'like' || type === 'comment') && data.post_id) router.push(`/post/${data.post_id}`);
  else if (type === 'follow' && data.user_id) router.push(`/user/${data.user_id}`);
}

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerPushToken() {
  if (Platform.OS === 'web') return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  try {
    await api.users.registerPushToken(tokenData.data);
  } catch {
    // Non-fatal — token registration failure should not block app usage
  }
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const handledNotifId = useRef<string | null>(null);

  // Live notification taps (background → foreground)
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const id = response.notification.request.identifier;
      if (handledNotifId.current === id) return;
      handledNotifId.current = id;
      navigateFromNotification(response.notification.request.content.data as Record<string, unknown>);
    });
    return () => sub.remove();
  }, []);

  // Cold-start: app opened by tapping a notification
  useEffect(() => {
    if (!initialized) return;
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledNotifId.current === id) return;
      handledNotifId.current = id;
      navigateFromNotification(response.notification.request.content.data as Record<string, unknown>);
    });
  }, [initialized]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setInitialized(true);
      SplashScreen.hideAsync();
      if (data.session) {
        registerPushToken();
        try {
          const user = await api.users.me();
          if (!user.username) router.replace('/onboarding');
        } catch {}
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) registerPushToken();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (!initialized) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="admin" />
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="legal" />
        <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="notifications" />
      </Stack>
    </>
  );
}
