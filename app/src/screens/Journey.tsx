/**
 * 06 — Live Journey, one continuous map scene (the map, markers and cards persist; Smart Animate between states):
 *   active → guidance → guidance2 → [crowd alert] rising → searching → [offer] drawing → offer → confirmed → newRoute → approach → Arrived
 * Rerouting (Motion · Patterns): hotspot intensifies (800 ms) → "الازدحام يرتفع" → "نبحث عن مسار أفضل…"
 * → old route turns dotted → new Aqua route draws (540 ms) → card slides up → −26 emphasis ring → accept or keep.
 * Everything shown comes from the API: route, waits, crowd levels and the reroute offer.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { C, M, VIEW_H, s } from '../theme';
import { CROWD, GlassButton, levelFor } from '../components/ui';
import { JourneyCapsule, LiveAlert, NavInstruction, NextStopCard, RerouteCard, Toast } from '../components/journey';
import { ActiveRoute, CurrentLocation, HeatSpot, MapPlane, NextMarker, PavilionMarker, PlainRoute, StopDot } from '../map/MapView';
import { Pt, placePoint, pointAt, shadedRuns, slice, walkBetween, walkFromPoint } from '../map/route';
import { useNav } from '../nav/Navigator';
import { backend } from '../data/api';
import { fmtTime, useStore } from '../data/store';
import { categoryOf, nameOf, photoOf, shortName } from '../data/places';
import { PHOTOS } from '../assets/images';

type Phase = 'active' | 'guidance' | 'guidance2' | 'rising' | 'searching' | 'drawing' | 'offer' | 'confirmed' | 'newRoute' | 'approach';
const REROUTE: Phase[] = ['drawing', 'offer', 'confirmed'];
const GUIDING: Phase[] = ['guidance', 'guidance2', 'rising', 'searching'];
const layout = LinearTransition.duration(M.standard).easing(M.flowOut);

/** Where the visitor is along the current walk, per state (the prototype's positions). */
const T_VISITOR: Partial<Record<Phase, number>> = { active: 0.08, guidance: 0.18, guidance2: 0.42, rising: 0.42, searching: 0.42, approach: 0.93 };

function minutesAr(n: number) {
  if (n <= 1) return 'دقيقة';
  if (n === 2) return 'دقيقتين';
  if (n <= 10) return `${n} دقائق`;
  return `${n} دقيقة`;
}

export default function Journey() {
  const nav = useNav();
  const { route, done, crowd, alert, offer, accept, decline, triggerCrowd, mode, clearAlert } = useStore();
  const [phase, setPhase] = useState<Phase>('active');
  const [toast, setToast] = useState<string>();
  const [snap, setSnap] = useState<typeof offer>();          // the offer being shown (the store clears it on accept)
  const [anchor, setAnchor] = useState<Pt>();                // where the visitor stood when the plan changed
  const [completed, setCompleted] = useState<Pt[]>([]);      // walked part of the abandoned route
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const arriving = useRef(false);                            // "arrive" navigates once per leg, even on a double tap
  const [cardH, setCardH] = useState(0);                     // measured height of the bottom card (points)

  const stops = route?.stops ?? [];
  const next = stops[0];
  const prev = done.length ? done[done.length - 1].id : route?.start_point ?? 'metro';
  const stopNo = done.length + 1;
  const total = done.length + stops.length;

  // A new leg (back from a visit): start fresh.
  useEffect(() => { setPhase('active'); setAnchor(undefined); setCompleted([]); setSnap(undefined); arriving.current = false; }, [done.length]);

  // ---------- geometry ----------
  const altId = snap?.new?.[0]?.pavilion_id;
  const crowdedId = snap?.trigger?.pavilion_id ?? next?.pavilion_id;
  // While the offer is on screen the visitor is still walking to the original stop (the route may already be updated).
  const legTarget = REROUTE.includes(phase) && crowdedId ? crowdedId : next?.pavilion_id;
  const leg = useMemo(() => (legTarget ? (anchor ? walkFromPoint(anchor, legTarget) : walkBetween(prev, legTarget)) : null), [prev, legTarget, anchor?.x, anchor?.y]);
  const tVis = anchor ? (phase === 'approach' ? 0.93 : 0) : T_VISITOR[phase] ?? 0.42;
  const visitor = leg ? pointAt(leg, tVis) : placePoint(prev);
  const altWalk = useMemo(() => (altId && REROUTE.includes(phase) ? walkFromPoint(visitor, altId) : null), [altId, phase === 'drawing' || phase === 'offer' || phase === 'confirmed']);

  // ---------- camera: frame the visitor and the destination between the top UI and the card ----------
  const camY = useSharedValue(-150);
  const vx = useSharedValue(visitor.x), vy = useSharedValue(visitor.y), va = useSharedValue(-90);
  useEffect(() => {
    const dest = REROUTE.includes(phase) && altId ? placePoint(altId) : next ? placePoint(next.pavilion_id) : visitor;
    const band = REROUTE.includes(phase) ? [40, 390] : phase === 'active' ? [110, 500] : [190, 590];
    const top = Math.min(dest.y - 80, visitor.y - 40), bottom = Math.max(dest.y, visitor.y + 40);
    let cam = (band[0] + band[1]) / 2 - (top + bottom) / 2;
    cam = Math.max(-340, Math.min(40, cam));
    const dur = phase === 'drawing' ? 550 : phase === 'newRoute' ? 420 : 450;
    camY.value = withTiming(cam, { duration: dur, easing: M.easeInOut });
    const angle = leg ? (pointAt(leg, Math.min(0.99, tVis + 0.02)).angle * 180) / Math.PI : -90;
    vx.value = withTiming(visitor.x, { duration: phase === 'approach' ? 700 : 450, easing: M.flowOut });
    vy.value = withTiming(visitor.y, { duration: phase === 'approach' ? 700 : 450, easing: M.flowOut });
    va.value = withTiming(angle, { duration: 300 });
  }, [phase, leg, altId]);

  // ---------- live events ----------
  useEffect(() => {
    if (!alert || !next) return;
    if (alert.pavilion_id !== next.pavilion_id) return;
    if (['active', 'guidance', 'guidance2'].includes(phaseRef.current)) {
      setPhase('rising');
      const t = setTimeout(() => setPhase((p) => (p === 'rising' ? 'searching' : p)), 1300);
      return () => clearTimeout(t);
    }
  }, [alert]);

  useEffect(() => {
    if (!offer) return;
    if (!['rising', 'searching', 'guidance', 'guidance2', 'active'].includes(phaseRef.current)) return;
    setSnap(offer);
    const wait = phaseRef.current === 'searching' ? 700 : 1500;
    const t1 = setTimeout(() => setPhase('drawing'), wait);
    const t2 = setTimeout(() => setPhase((p) => (p === 'drawing' ? 'offer' : p)), wait + 1100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [offer]);

  // No better order found in time: keep the plan quietly.
  useEffect(() => {
    if (phase !== 'searching') return;
    const t = setTimeout(() => {
      if (phaseRef.current === 'searching' && !snap) { setPhase('guidance2'); clearAlert(); flash('مسارك الحالي ما زال الأفضل'); }
    }, 9000);
    return () => clearTimeout(t);
  }, [phase, snap]);

  const flash = (text: string) => { setToast(text); setTimeout(() => setToast(undefined), 3000); };

  // ---------- actions ----------
  const startGuidance = () => {
    if (mode === 'demo' && done.length >= 2) { nav.push('Summary', undefined, 'dissolve'); return; }   // prototype: fast-forward to end of day
    setPhase('guidance');
  };
  const tapInstruction = () => {
    if (phase === 'guidance') setPhase('guidance2');
    else if (phase === 'guidance2') triggerCrowd();           // demo control: the next stop's queue jumps
  };
  const onAccept = async () => {
    if (phase !== 'offer') return;
    const here = visitor;
    const walked = leg ? slice(leg, 0, tVis) : [];
    setPhase('confirmed');
    await accept();
    setTimeout(() => {
      setCompleted(walked);
      setAnchor(here);
      setPhase('newRoute');
      flash(`وفّرنا لك ${snap?.saves_min ?? 0} دقيقة`);
    }, 900);
  };
  const onKeep = async () => {
    await decline();
    clearAlert();
    setSnap(undefined);
    setPhase('guidance2');
  };
  const arrive = () => {
    if (!next || arriving.current) return;
    arriving.current = true;
    setPhase('approach');
    setTimeout(() => nav.push('Arrived', { pid: next.pavilion_id }, 'moveIn'), 1100);
  };

  // ---------- derived display ----------
  const waitOf = (id: string, fallback: number) => crowd[id] ?? fallback;
  const inReroute = REROUTE.includes(phase);
  const focusId = inReroute && altId ? altId : next?.pavilion_id;
  const focusStop = inReroute && snap ? snap.route.stops[0] : next;
  // While the crowd is "rising" the card keeps the planned wait; the map shows the change (design: Reroute 1–2).
  const rising = phase === 'rising' || phase === 'searching';
  const focusWait = focusStop
    ? inReroute ? snap?.new?.[0]?.wait_min ?? focusStop.wait_min
      : rising ? focusStop.wait_min : waitOf(focusStop.pavilion_id, focusStop.wait_min)
    : 0;
  const focusLevel = levelFor(focusWait);

  const instruction = useMemo(() => {
    const landmark = next?.landmarks?.find((l) => l === 'icon' || l === 'plaza_south');
    const via = landmark ? nameOf(landmark) : 'الساحة المركزية';
    const viaName = via === nameOf('icon') ? 'الساحة المركزية' : via;
    if (phase === 'newRoute' || phase === 'approach') {
      const east = next ? placePoint(next.pavilion_id).x > 230 : false;
      return { title: east ? 'اتجه نحو ممر الحديقة' : `اتجه نحو ${viaName}`, detail: `مرّ بجانب ${nameOf(prev)}، ثم انعطف يسارًا بعد الحديقة.`, photo: photoOf(prev) };
    }
    if (phase === 'guidance') {
      return { title: `اتجه نحو ${viaName}`, detail: (next?.shaded_pct ?? 0) >= 50 ? 'سر على الممر المظلل، ثم اتجه يسارًا عند الساحة.' : 'اتبع المسار على الخريطة، ثم اتجه يسارًا عند الساحة.', photo: PHOTOS.tower_dusk };
    }
    const mins = next ? Math.max(1, Math.round(next.walk_from_prev_min * (1 - tVis))) : 2;
    return { title: `انعطف يسارًا عند ${viaName}`, detail: `${next ? nameOf(next.pavilion_id) : ''} أمامك بعد ${minutesAr(Math.min(mins, 2))}.`, photo: PHOTOS.tower_dusk };
  }, [phase, next?.pavilion_id, prev]);

  if (!route || !next) {
    return <View style={{ flex: 1, backgroundColor: C.mapBg }} />;
  }

  // Markers: completed stops, the destination (dark), the rest of today's stops (light).
  const markers: React.ReactNode[] = [];
  done.forEach((d, i) => markers.push(<StopDot key={`done-${d.id}-${i}`} at={placePoint(d.id)} state="done" />));
  stops.forEach((st, i) => {
    const id = st.pavilion_id;
    const w = waitOf(id, st.wait_min);
    if (inReroute && id === altId) return;
    if (inReroute && id === crowdedId) {
      const tw = snap?.trigger?.wait_min ?? w;
      markers.push(<PavilionMarker key={`mark-${id}`} at={placePoint(id)} name={nameOf(id)} meta={`${CROWD[levelFor(tw)].word} · ${tw} د`} level={levelFor(tw)} />);
      return;
    }
    if (i === 0) {
      const rising = (phase === 'rising' || phase === 'searching') && alert?.pavilion_id === id;
      const meta = rising ? `يرتفع · ${alert!.wait_min} د` : `${CROWD[levelFor(w)].word} · ${w} د`;
      markers.push(<NextMarker key={`next-${id}`} at={placePoint(id)} name={nameOf(id)} meta={meta} level={rising ? 'busy' : levelFor(w)} />);
    } else {
      const meta = anchor && i === 1 ? `المحطة ${stopNo + 1} · ${fmtTime(st.arrive_at)}` : `${w} د`;
      markers.push(<PavilionMarker key={`mark-${id}`} at={placePoint(id)} name={nameOf(id)} meta={meta} level={levelFor(w)} />);
    }
  });
  if (inReroute && altId) {
    const aw = snap?.new?.[0]?.wait_min ?? 10;
    markers.push(<NextMarker key={`alt-${altId}`} at={placePoint(altId)} name={nameOf(altId)} meta={`${CROWD[levelFor(aw)].word} · ${aw} د`} level={levelFor(aw)} />);
  }

  const heatIds = [...new Set([...stops.slice(0, 3).map((x) => x.pavilion_id), ...(altId ? [altId] : [])])];
  const showInstruction = GUIDING.includes(phase) || phase === 'newRoute' || phase === 'approach';
  const controlsTop = phase === 'active' ? 124 : phase === 'newRoute' || phase === 'approach' ? 330 : 300;
  // Pills that belong just above the bottom card follow its real height (Arabic lines make it grow).
  const aboveCard = s(40) + (cardH || s(250)) + s(12);

  return (
    <View style={{ flex: 1, backgroundColor: C.mapBg }}>
      <StatusBar style="dark" />
      <MapPlane camY={camY}>
        <HeatSpot key="heat-plaza" id="plaza" at={{ x: 201, y: 440 }} level="moderate" />
        {heatIds.map((id) => {
          const st = stops.find((x) => x.pavilion_id === id);
          const w = inReroute && id === crowdedId ? snap?.trigger?.wait_min ?? 0 : waitOf(id, st?.wait_min ?? 10);
          // "Crowd hotspot intensifies (800 ms)" as soon as the alert arrives
          const hot = (rising && alert?.pavilion_id === id) || (inReroute && id === crowdedId) || (anchor && id === crowdedId && phase !== 'approach');
          return <HeatSpot key={`heat-${id}`} id={id} at={placePoint(id)} level={hot ? 'busy' : levelFor(w)} />;
        })}
        {/* walked so far */}
        {completed.length > 1 && <PlainRoute pts={completed} kind="completed" />}
        {leg && !anchor && <PlainRoute pts={slice(leg, 0, tVis)} kind="completed" />}
        {leg && anchor && phase === 'approach' && <PlainRoute pts={slice(leg, 0, tVis)} kind="completed" />}
        {/* the route */}
        {inReroute && leg ? (
          <>
            <PlainRoute pts={slice(leg, tVis, 1)} kind="previous" fadeKey={snap?.offer_id} />
            {altWalk && <ActiveRoute pts={altWalk.pts} drawKey={`alt-${snap?.offer_id}`} shadeRuns={shadedRuns(altWalk)} />}
          </>
        ) : leg ? (
          <ActiveRoute
            pts={slice(leg, tVis, 1)}
            drawKey={`leg-${prev}-${next.pavilion_id}-${anchor ? 'a' : 'b'}`}
            draw={phase === 'active' && !anchor}
            shadeRuns={shadedRuns(leg, tVis)}
          />
        ) : null}
        {markers}
        <CurrentLocation x={vx} y={vy} angle={va} />
      </MapPlane>

      {/* scrim behind the reroute card */}
      {inReroute && <Animated.View entering={FadeIn.duration(M.sheet)} exiting={FadeOut.duration(M.sheet)} pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,32,30,0.10)' }]} />}

      {/* top: end journey + capsule (active) or the instruction card (guiding) */}
      {phase === 'active' && (
        <Animated.View entering={FadeIn.duration(M.standard)} exiting={FadeOut.duration(M.fast)} style={{ position: 'absolute', top: s(54), left: s(16), right: s(16), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <GlassButton icon="close" onPress={() => nav.push('Summary', undefined, 'dissolve')} />
          <JourneyCapsule label={`المحطة ${stopNo} من ${total}`} total={total} current={stopNo} />
        </Animated.View>
      )}
      {showInstruction && (
        <Animated.View entering={FadeInDown.duration(M.sheet).easing(M.flowOut)} exiting={FadeOut.duration(M.fast)} layout={layout} style={{ position: 'absolute', top: s(56), left: s(16), right: s(16) }}>
          <NavInstruction title={instruction.title} detail={instruction.detail} photo={instruction.photo} onPress={tapInstruction} />
        </Animated.View>
      )}

      {/* map controls */}
      {!inReroute && (
        <Animated.View layout={layout} style={{ position: 'absolute', left: s(16), top: s(controlsTop), gap: s(10) }}>
          <GlassButton icon="locate" />
          <GlassButton icon="crowd" />
          <GlassButton icon="shade" selected />
        </Animated.View>
      )}

      {/* live alert */}
      {(phase === 'rising' || phase === 'searching' || phase === 'drawing') && (
        <Animated.View key={phase === 'rising' ? 'r' : 's'} entering={FadeInDown.duration(M.standard)} exiting={FadeOut.duration(M.fast)} style={{ position: 'absolute', bottom: aboveCard, left: 0, right: 0, alignItems: 'center', zIndex: 10 }}>
          <LiveAlert kind={phase === 'rising' ? 'rising' : 'searching'} text={phase === 'rising' ? `الازدحام يرتفع في ${nameOf(next.pavilion_id)}` : 'نبحث عن مسار أفضل…'} />
        </Animated.View>
      )}

      {/* capsule above the card after a reroute / on approach */}
      {(phase === 'newRoute' || phase === 'approach') && (
        <Animated.View key={phase} entering={FadeIn.duration(M.standard)} exiting={FadeOut.duration(M.fast)} style={{ position: 'absolute', left: s(16), bottom: aboveCard, zIndex: 10 }}>
          <JourneyCapsule label={phase === 'approach' ? `وصلت تقريبًا · ${nameOf(next.pavilion_id)}` : `المحطة التالية: ${shortName(next.pavilion_id)}`} total={total} current={stopNo} />
        </Animated.View>
      )}

      {/* toast */}
      {toast && (
        <Animated.View entering={FadeInDown.duration(M.standard)} exiting={FadeOut.duration(M.standard)} style={[{ position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 10 }, phase === 'newRoute' ? { bottom: aboveCard + s(56) } : { top: s(160) }]}>
          <Toast text={toast} />
        </Animated.View>
      )}

      {/* bottom card */}
      {!inReroute && focusStop && (
        <Animated.View
          key={phase === 'active' ? 'full' : 'compact'}
          entering={FadeInDown.duration(M.sheet).easing(M.continuity)}
          exiting={FadeOutDown.duration(M.fast)}
          onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
          style={{ position: 'absolute', left: s(16), right: s(16), bottom: s(40) }}
        >
          <NextStopCard
            compact={phase !== 'active'}
            stopNo={stopNo}
            total={total}
            eta={fmtTime(focusStop.arrive_at)}
            name={nameOf(focusStop.pavilion_id)}
            category={categoryOf(focusStop.pavilion_id)}
            level={focusLevel}
            shadePct={focusStop.shaded_pct}
            walk={focusStop.walk_from_prev_min}
            wait={focusWait}
            visit={focusStop.visit_min}
            cta="ابدأ التوجيه"
            onCta={startGuidance}
            onPress={phase === 'active' ? () => nav.push('Pavilion', { pid: focusStop.pavilion_id }, 'moveIn') : arrive}
          />
        </Animated.View>
      )}

      {/* reroute card */}
      {(phase === 'offer' || phase === 'confirmed') && snap && (
        <Animated.View entering={SlideInDown.duration(380).easing(M.continuity)} exiting={SlideOutDown.duration(M.sheet)} style={{ position: 'absolute', left: s(16), right: s(16), bottom: s(40) }}>
          <RerouteCard
            message={`ارتفع الازدحام المتوقع في ${nameOf(crowdedId!)}. زيارة ${shortName(altId!)} أولًا قد توفر لك ${snap.saves_min} دقيقة.`}
            prev={[prev, ...snap.old.map((x) => x.pavilion_id)].slice(0, 3).map(shortName).join(' ← ')}
            next={[prev, ...snap.new.map((x) => x.pavilion_id)].slice(0, 3).map(shortName).join(' ← ')}
            oldWait={snap.trigger?.wait_min ?? snap.old[0]?.wait_min ?? 0}
            oldWaitName={shortName(crowdedId!)}
            newWait={snap.new[0]?.wait_min ?? 0}
            newWaitName={shortName(altId!)}
            saves={snap.saves_min}
            note={`نقترح هذا التعديل على عدد محدود من الزوار حتى يبقى ${nameOf(altId!)} هادئًا.`}
            confirmed={phase === 'confirmed'}
            onAccept={onAccept}
            onKeep={onKeep}
          />
        </Animated.View>
      )}
    </View>
  );
}
