/**
 * 04 — Location Permission and 05 — Home (Default / Crowd High), with the glass tab bar.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import Animated, { FadeIn, FadeInDown, useSharedValue } from 'react-native-reanimated';
import { C, M, ar, s } from '../theme';
import { Button, CROWD, Glass, GlassButton, Icon, Pressy, Txt, levelFor } from '../components/ui';
import { CurrentLocation, HeatSpot, MapPlane, PavilionMarker } from '../map/MapView';
import { placePoint, toPath, walkBetween } from '../map/route';
import { useNav } from '../nav/Navigator';
import { useStore } from '../data/store';
import { nameOf } from '../data/places';
import { MAP_IMAGE } from '../assets/images';
import type { IconName } from '../assets/svg';
import { TabBar, useTabs } from '../components/tabs';

// ---------- Location Permission ----------
export function LocationPermission() {
  const nav = useNav();
  // Illustration: a route from just south of the plaza up to District 1, with the visitor's dot.
  const route = useMemo(() => walkBetween('plaza_south', 'de'), []);
  const vx = useSharedValue(placePoint('plaza_south').x), vy = useSharedValue(placePoint('plaza_south').y), va = useSharedValue(-90);
  // Illustration: the site map at 90% inside a rounded card (Figma: map 362 x 787 at -4, -210).
  const k = 362 / 402;
  const benefits: { t: string; i: IconName }[] = [
    { t: 'مسارات أقصر تبدأ من مكانك', i: 'reroute' },
    { t: 'تنبيه لطيف عندما يتغيّر الازدحام', i: 'bell' },
    { t: 'لا نشارك موقعك، ويتوقف بانتهاء زيارتك', i: 'lock' },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: C.canvas }}>
      <StatusBar style="dark" />
      <View style={{ position: 'absolute', left: s(16), top: s(70), width: s(370), height: s(300), borderRadius: s(32), overflow: 'hidden', backgroundColor: C.mapBg }}>
        <View style={{ position: 'absolute', left: s(-4), top: s(-210), width: s(362), height: s(787) }}>
          <Image source={MAP_IMAGE} style={StyleSheet.absoluteFill} contentFit="fill" />
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 402 874">
            <Path d={toPath(route.pts)} stroke={C.white} strokeWidth={11 / k} strokeLinecap="round" fill="none" />
            <Path d={toPath(route.pts)} stroke={C.aqua} strokeWidth={6 / k} strokeLinecap="round" fill="none" />
          </Svg>
          <View style={{ position: 'absolute', left: 0, top: 0, width: s(402), height: s(874), transform: [{ scale: k }], transformOrigin: 'top left' }}>
            <CurrentLocation x={vx} y={vy} angle={va} />
          </View>
        </View>
        <LinearGradient colors={['rgba(243,248,246,0)', C.canvas]} locations={[0.55, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <View style={{ position: 'absolute', left: s(16), right: s(16), top: s(394), gap: s(14) }}>
        <Animated.View entering={FadeInDown.duration(M.sheet)} style={{ gap: s(14) }}>
          <Txt style={ar(700, 28, 38)}>خلّنا نرافقك داخل إكسبو</Txt>
          <Txt style={[ar(400, 17, 29), { color: C.slate }]}>نستخدم موقعك أثناء الزيارة لاقتراح أقرب المسارات وتحديث خطتك عند تغيّر الازدحام.</Txt>
        </Animated.View>
        {benefits.map((b, i) => (
          <Animated.View key={b.t} entering={FadeInDown.delay(120 + i * 80).duration(M.sheet)} style={{ height: s(42), flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
            <View style={{ width: s(42), height: s(42), borderRadius: s(16), backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={b.i} size={22} color={C.aquaText} />
            </View>
            <Txt style={[ar(400, 16, 26), { flex: 1 }]}>{b.t}</Txt>
          </Animated.View>
        ))}
      </View>
      <View style={{ position: 'absolute', left: s(16), right: s(16), bottom: s(46), gap: s(6), alignItems: 'center' }}>
        <Button label="السماح أثناء الاستخدام" style={{ alignSelf: 'stretch' }} onPress={() => nav.replace('Home', undefined, 'dissolve')} />
        <Button label="ليس الآن" variant="tertiary" size="medium" onPress={() => nav.replace('Home', undefined, 'dissolve')} />
      </View>
    </View>
  );
}

// ---------- Home ----------
const HOME_MARKERS = ['jp', 'kr', 'th_technology'];

export function Home() {
  const nav = useNav();
  const { crowd, plan, route } = useStore();
  const [high, setHigh] = useState(false);
  const camY = useSharedValue(0);
  const vx = useSharedValue(232), vy = useSharedValue(470), va = useSharedValue(-90);
  const hours = Math.max(1, Math.round((plan.end.getTime() - plan.start.getTime()) / 3600_000));
  const waits = Object.values(crowd);
  const avg = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 18;
  const overall = high ? 'busy' : levelFor(avg);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'صباح الخير' : 'مساء الخير';

  const waitOf = (id: string) => (high && id === 'jp' ? 38 : crowd[id] ?? 12);
  const openPlan = () => nav.push('PlanTime');
  const onTab = useTabs('home');

  return (
    <View style={{ flex: 1, backgroundColor: C.mapBg }}>
      <StatusBar style="dark" />
      <MapPlane camY={camY}>
        <HeatSpot id="plaza" at={{ x: 201, y: 440 }} level="moderate" />
        <HeatSpot id="ksa" at={placePoint('ksa')} level="moderate" />
        {HOME_MARKERS.map((id) => <HeatSpot key={id + (high ? 'h' : '')} id={id} at={placePoint(id)} level={levelFor(waitOf(id))} />)}
        {HOME_MARKERS.map((id) => {
          const w = waitOf(id), lvl = levelFor(w);
          return <PavilionMarker key={id} at={placePoint(id)} name={nameOf(id)} meta={`${CROWD[lvl].word} · ${w} د`} level={lvl} />;
        })}
        <CurrentLocation x={vx} y={vy} angle={va} />
      </MapPlane>

      {/* search + profile */}
      <View style={{ position: 'absolute', top: s(62), left: s(16), right: s(16), flexDirection: 'row', alignItems: 'center', gap: s(16) }}>
        <GlassButton icon="person" onPress={() => onTab('profile')} />
        <Pressy style={{ flex: 1 }} onPress={() => onTab('explore')}>
          <Glass level="regular" radius={25} style={{ height: s(50), paddingHorizontal: s(16), flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
            <Txt style={[ar(400, 17, 29), { color: C.slate, flex: 1 }]}>ابحث عن جناح أو تجربة</Txt>
            <Icon name="search" size={22} color={C.slate} />
          </Glass>
        </Pressy>
      </View>

      {/* live status (tap: crowd high) + map controls */}
      <Pressy onPress={() => setHigh((h) => !h)} style={{ position: 'absolute', top: s(124), right: s(16) }}>
        <Glass level="regular" radius={20} fill="rgba(255,255,255,0.72)" border="rgba(255,255,255,0.85)"
          style={{ height: s(39), paddingHorizontal: s(14), flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <Animated.View key={overall} entering={FadeIn.duration(M.standard)}>
            <Txt style={ar(500, 13, 19)}>{`الازدحام العام ${overall === 'low' ? 'منخفض' : overall === 'moderate' ? 'متوسط' : 'مرتفع'}`}</Txt>
          </Animated.View>
          <View style={{ width: s(8), height: s(8), borderRadius: s(4), backgroundColor: CROWD[overall].dot }} />
          <View style={{ width: s(1), height: s(14), backgroundColor: 'rgba(96,120,116,0.5)' }} />
          <Txt style={[ar(600, 13, 19), { color: C.aquaText }]}>انسياب مباشر</Txt>
          <View style={{ width: s(8), height: s(8), borderRadius: s(4), backgroundColor: C.aqua }} />
        </Glass>
      </Pressy>
      <View style={{ position: 'absolute', left: s(16), top: s(124), gap: s(10) }}>
        <GlassButton icon="locate" />
        <GlassButton icon="crowd" selected />
      </View>

      {/* plan prompt sheet */}
      <Glass level="regular" radius={34} fill="rgba(255,255,255,0.86)" border="rgba(255,255,255,0.95)"
        style={{ position: 'absolute', left: 0, right: 0, bottom: s(-34), paddingHorizontal: s(20), paddingTop: s(8), paddingBottom: s(112 + 34), gap: s(12), borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <View style={{ alignSelf: 'flex-end', marginRight: s(4), width: s(36), height: s(5), borderRadius: s(3), backgroundColor: 'rgba(96,120,116,0.45)' }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: s(6) }}>
          <Txt style={[ar(500, 13, 19), { color: C.slate }]}>31°</Txt>
          <Txt style={[ar(500, 13, 19), { color: C.slate }]}>{`${greeting} · أنت قرب الساحة المركزية`}</Txt>
          <Icon name="pin" size={16} color={C.aquaText} />
        </View>
        <Animated.View key={high ? 'h' : 'd'} entering={FadeIn.duration(M.standard)} style={{ gap: s(2) }}>
          <Txt style={ar(700, 22, 31)}>{high ? 'الزحمة مرتفعة في الشمال' : `عندك ${hours} ساعات في إكسبو؟`}</Txt>
          <Txt style={[ar(400, 15, 24), { color: C.slate }]}>{high ? 'نبدأ يومك من الأجنحة الهادئة جنوبًا، ونعود للشمال عندما يخف الازدحام.' : 'نبني لك أفضل مسار حسب الزحمة الآن.'}</Txt>
        </Animated.View>
        <Button label="خطط يومي" icon="plan" onPress={openPlan} />
      </Glass>

      <View style={{ position: 'absolute', left: s(16), right: s(16), bottom: s(30) }}>
        <TabBar selected="home" onSelect={onTab} />
      </View>
    </View>
  );
}
