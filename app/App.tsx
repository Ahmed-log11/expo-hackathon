import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import {
  NotoSansArabic_400Regular, NotoSansArabic_500Medium, NotoSansArabic_600SemiBold, NotoSansArabic_700Bold, useFonts,
} from '@expo-google-fonts/noto-sans-arabic';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigator } from './src/nav/Navigator';
import { StoreProvider, useStore } from './src/data/store';
import Onboarding from './src/screens/Onboarding';
import { Home, LocationPermission } from './src/screens/Home';
import { PlanComfort, PlanInterests, PlanMustVisit, PlanTime } from './src/screens/PlanWizard';
import { Generating, PlanReady } from './src/screens/PlanResult';
import Journey from './src/screens/Journey';
import { Arrived, Summary, VisitComplete } from './src/screens/Visit';
import { Explore, Favorites, Notifications, Pavilion, Profile } from './src/screens/More';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
const SCREENS = {
  Onboarding, Permission: LocationPermission, Home,
  PlanTime, PlanInterests, PlanMustVisit, PlanComfort, Generating, PlanReady,
  Journey, Arrived, VisitComplete, Summary,
  Pavilion, Explore, Favorites, Notifications, Profile,
};

/** Web preview only (design QA on a laptop): open http://localhost:8081/?screen=PlanReady to jump to a screen. */
function previewScreen(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const name = new URLSearchParams(window.location.search).get('screen');
  return name && name in SCREENS ? name : null;
}
const NEEDS_PLAN = ['PlanReady', 'Journey', 'Arrived', 'VisitComplete', 'Summary'];

function Root() {
  const preview = previewScreen();
  const { createPlan, route } = useStore();
  const [ready, setReady] = useState(!preview || !NEEDS_PLAN.includes(preview));
  useEffect(() => {
    if (!ready) createPlan().then(() => setReady(true)).catch(() => setReady(true));
  }, []);
  if (!ready || (preview && NEEDS_PLAN.includes(preview) && !route)) return <View style={{ flex: 1, backgroundColor: '#F3F8F6' }} />;
  return <Navigator screens={SCREENS} initial={preview ?? 'Onboarding'} />;
}

export default function App() {
  const [loaded] = useFonts({ NotoSansArabic_400Regular, NotoSansArabic_500Medium, NotoSansArabic_600SemiBold, NotoSansArabic_700Bold });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: '#073C3A' }} />;
    return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <Root />
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
