/**
 * Glass tab bar (Tab Bar: Home / Explore / Plan / Profile) and the navigation between tabs.
 */
import React from 'react';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { C, M, ar, s } from '../theme';
import { Glass, Icon, Pressy, Txt } from './ui';
import { useNav } from '../nav/Navigator';
import { useStore } from '../data/store';
import type { IconName } from '../assets/svg';

const TABS: { key: string; label: string; icon: IconName }[] = [
  { key: 'profile', label: 'حسابي', icon: 'person' },
  { key: 'plan', label: 'خطتي', icon: 'plan' },
  { key: 'explore', label: 'استكشف', icon: 'explore' },
  { key: 'home', label: 'الرئيسية', icon: 'home' },
];
const tabLayout = LinearTransition.duration(260).easing(M.flowOut);

export function TabBar({ selected, onSelect }: { selected: string; onSelect: (k: string) => void }) {
  const idx = TABS.findIndex((t) => t.key === selected);
  return (
    <Glass level="regular" radius={33} fill="rgba(255,255,255,0.66)" border="rgba(255,255,255,0.8)"
      style={{ height: s(66), paddingHorizontal: s(8), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {/* one indicator layer glides between tabs (Smart Animate 260 ms) */}
      <Animated.View layout={tabLayout} style={{ position: 'absolute', top: s(7), left: s(8 + idx * 89.33), width: s(84), height: s(52), borderRadius: s(26), backgroundColor: C.mint }} />
      {TABS.map((t) => {
        const on = t.key === selected;
        return (
          <Pressy key={t.key} onPress={() => onSelect(t.key)} style={{ width: s(84), height: s(52), alignItems: 'center', justifyContent: 'center', gap: s(2) }}>
            <Icon name={t.icon} size={24} color={on ? C.aquaText : C.slate} />
            <Txt style={[on ? ar(600, 12, 17) : ar(500, 12, 18), { color: on ? C.aquaText : C.slate, textAlign: 'center' }]}>{t.label}</Txt>
          </Pressy>
        );
      })}
    </Glass>
  );
}


/** Tab navigation shared by Home, Explore and Profile (Smart Animate between tabs → cross-fade). */
export function useTabs(current: string) {
  const nav = useNav();
  const { route } = useStore();
  return (k: string) => {
    if (k === current) return;
    if (k === 'home') nav.replace('Home', undefined, 'dissolve');
    else if (k === 'explore') nav.replace('Explore', undefined, 'dissolve');
    else if (k === 'profile') nav.replace('Profile', undefined, 'dissolve');
    else if (k === 'plan') { if (route) nav.push('PlanReady', undefined, 'dissolve'); else nav.push('PlanTime'); }
  };
}

