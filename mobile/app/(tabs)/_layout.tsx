import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function Icon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>{label}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopColor: '#1a1a1a',
          borderTopWidth: 1,
          paddingBottom: 8,
          height: 64,
        },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#444',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.5,
          marginTop: -2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <Icon label="◉" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pulse"
        options={{
          title: 'Pulse',
          tabBarIcon: ({ focused }) => <Icon label="⚡" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Votes',
          tabBarIcon: ({ focused }) => <Icon label="▲" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <Icon label="◈" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
