/**
 * "+ إضافة محطة" (Live Journey): add a known pavilion to the rest of today's plan, or swipe a planned
 * stop away. Uses the existing "adjust my plan" endpoint with a fixed phrase ("add {name}" / "remove {name}",
 * which the server's keyword reader handles for every pavilion), so the engine re-orders only the remaining
 * stops and the crowd balancing stays on. Nothing changes until the visitor confirms, and the preview is only
 * shown when the server made exactly the change that was asked for.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, FadeOut, LinearTransition, SlideInDown, SlideOutDown, ZoomIn } from 'react-native-reanimated';
import { C, M, ar, s, useSafe } from '../theme';
import { Button, CrowdStatus, Glass, Icon, Pressy, Txt, levelFor } from './ui';
import { useStore } from '../data/store';
import { PAVILION_IDS, PLACES, categoryOf, nameOf, shortName } from '../data/places';
import type { AdjustPreview } from '../data/api';

/** Compact pill that opens the sheet; sits just above the bottom card. */
export function AddStopButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressy onPress={onPress} scaleTo={0.96}>
      <Glass level="regular" radius={22} fill="rgba(255,255,255,0.86)" border="rgba(255,255,255,0.95)"
        style={{ minHeight: s(44), paddingHorizontal: s(14), flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
        <Txt style={[ar(600, 15, 22), { color: C.deep }]}>إضافة محطة</Txt>
        <View style={{ width: s(22), height: s(22), borderRadius: s(11), backgroundColor: C.aqua, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={15} color={C.deep} />
        </View>
      </Glass>
    </Pressy>
  );
}

/** Loose Arabic/English matching: no "جناح", alef/taa-marbuta/yaa variants folded, case-insensitive. */
function fold(t: string) {
  return t.toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/جناح|pavilion/g, '')
    .replace(/\s+/g, ' ').trim();
}

const minutes = (n: number) => `${Math.max(0, Math.round(n))} د`;
// Content swaps inside the sheet: a short fade-through, and the sheet's height follows smoothly.
const SWAP_OUT_MS = 120;
const swapOut = FadeOut.duration(SWAP_OUT_MS);
// Fade-through: the new content waits for the old one to be gone, so the two never overlap.
const swapIn = FadeIn.delay(SWAP_OUT_MS).duration(M.quick).easing(M.flowOut);
const resize = LinearTransition.duration(M.step).easing(M.flowOut);
const CONFIRM_MS = 650;
const ROW_R = 16;
const DELETE_W = 92;

/** Shown the first time the sheet opens with a removable stop (once per app session). */
let swipeHintShown = false;

type Mode = 'add' | 'remove';

export function AddStopSheet({ visible, plannedIds, doneIds, onClose, onApplied }: {
  visible: boolean;
  plannedIds: string[];          // remaining stops, in order (the first one is where the visitor is heading now)
  doneIds: string[];             // stops already completed today
  onClose: () => void;
  onApplied: (message: string) => void;
}) {
  const safe = useSafe();
  const { adjustPlan, acceptAdjust, cancelAdjust } = useStore();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string>();
  const [mode, setMode] = useState<Mode>('add');
  const [preview, setPreview] = useState<AdjustPreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [done, setDone] = useState<string>();   // brief confirmation before the sheet closes
  const [showHint] = useState(() => !swipeHintShown);
  const rowRefs = useRef<Record<string, SwipeableMethods | null>>({});
  const openId = useRef<string | null>(null);
  const closeOpenRow = () => { if (openId.current) rowRefs.current[openId.current]?.close(); openId.current = null; };

  const currentId = plannedIds[0];
  const removable = (id: string) => plannedIds.includes(id) && id !== currentId;

  const results = useMemo(() => {
    const q = fold(query);
    return PAVILION_IDS
      .filter((id) => !doneIds.includes(id))
      .filter((id) => {
        if (!q) return true;
        const p = PLACES[id];
        return [nameOf(id), p.name_ar, p.name_en, categoryOf(id)].some((n) => fold(n ?? '').includes(q));
      })
      // Today's remaining stops first (in route order), then everything else.
      .sort((a, b) => {
        const ia = plannedIds.indexOf(a), ib = plannedIds.indexOf(b);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
  }, [query, doneIds.join(','), plannedIds.join(',')]);

  const reset = () => {
    setQuery(''); setPicked(undefined); setMode('add'); setPreview(undefined); setBusy(false); setError(undefined); setNotice(undefined); setDone(undefined);
    closeOpenRow();
  };
  const close = () => {
    if (preview?.preview_id) cancelAdjust(preview.preview_id);   // keep the plan as it was
    swipeHintShown = true;
    reset();
    onClose();
  };

  const choose = (id: string) => {
    setError(undefined);
    closeOpenRow();
    if (plannedIds.includes(id)) {
      setPicked(undefined);
      setNotice(id === currentId ? 'هذا المكان موجود بالفعل في خطتك، وهو وجهتك الحالية' : 'هذا المكان موجود بالفعل في خطتك، اسحبه لحذفه');
      return;
    }
    setNotice(undefined);
    setPicked(id);
  };

  /** Ask the server for the change; only show the preview when it did exactly that and nothing else. */
  const request = async (id: string, m: Mode) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    setPicked(id);
    setMode(m);
    try {
      const name = PLACES[id]?.name_en ?? id;
      const p = await adjustPlan(`${m} ${name}`);
      const newIds = p.new.map((x) => x.pavilion_id);
      const exact = !!p.preview_id && !!p.route
        && p.changes.length === 1 && p.changes[0].action === m && p.changes[0].pavilion_id === id
        && (m === 'add' ? newIds.includes(id) : !newIds.includes(id))
        && newIds.length > 0;
      if (!exact) {
        if (p.preview_id) cancelAdjust(p.preview_id);
        setError(m === 'add' ? 'تعذّر إضافة هذا المكان الآن، ولم تتغير رحلتك.' : 'تعذّر حذف هذه المحطة الآن، ولم تتغير رحلتك.');
        if (m === 'remove') setPicked(undefined);
        return;
      }
      setPreview(p);
    } catch {
      setError('تعذّر الوصول للخادم، ولم تتغير رحلتك.');
      if (m === 'remove') setPicked(undefined);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview?.preview_id || busy || !picked) return;
    setBusy(true);
    const r = await acceptAdjust(preview.preview_id);
    setBusy(false);
    if (r === 'ok') {
      const name = shortName(picked);
      const msg = mode === 'add' ? `أضفنا ${name} إلى خطتك` : `أزلنا ${name} من خطتك`;
      swipeHintShown = true;
      setDone(msg);                       // a beat of confirmation in place, then the sheet hands back to the map
      setTimeout(() => { reset(); onApplied(msg); }, CONFIRM_MS);
    } else {
      setPreview(undefined);
      if (mode === 'remove') setPicked(undefined);
      setError(r === 'expired' ? 'انتهت صلاحية المعاينة أو تغيّرت الخطة، حاول مرة أخرى.' : 'تعذّر تعديل الخطة، ولم تتغير رحلتك.');
    }
  };

  /** Back from the preview to the list without changing anything. */
  const backToList = () => {
    if (preview?.preview_id) cancelAdjust(preview.preview_id);
    setPreview(undefined);
    if (mode === 'remove') setPicked(undefined);
    setMode('add');
  };

  if (!visible) return null;

  // ---------- preview numbers (all from the server's preview) ----------
  const stop = mode === 'add' ? preview?.route?.stops.find((x) => x.pavilion_id === picked) : undefined;
  const newIds = preview?.new.map((x) => x.pavilion_id) ?? [];
  const oldIds = preview?.old.map((x) => x.pavilion_id) ?? [];
  const dropped = oldIds.filter((id) => !newIds.includes(id) && id !== picked);
  const cameBack = newIds.filter((id) => id !== picked && !oldIds.includes(id));   // earlier wishes the engine fits back in
  const oldWait = preview?.old.reduce((a, x) => a + x.wait_min, 0) ?? 0;
  const newWait = preview?.route?.totals.wait_min ?? preview?.new.reduce((a, x) => a + x.wait_min, 0) ?? 0;
  const newWalk = preview?.route?.totals.walk_min;
  const hasRemovable = plannedIds.some((id) => id !== currentId);

  const row = (id: string) => {
    const inPlan = plannedIds.includes(id);
    const sel = picked === id && mode === 'add';
    const tag = id === currentId ? 'وجهتك الحالية' : inPlan ? 'في خطتك' : null;
    const body = (
      <Pressy onPress={() => choose(id)} disabled={busy}>
        <View style={{
          flexDirection: 'row-reverse', alignItems: 'center', gap: s(10), minHeight: s(56), paddingHorizontal: s(12), borderRadius: s(ROW_R),
          backgroundColor: sel ? C.mintSoft : C.white, borderWidth: s(sel ? 1.5 : 1), borderColor: sel ? C.aqua : C.lineSoft,
        }}>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Txt style={[ar(600, 16, 24), { color: C.ink }]} numberOfLines={1}>{nameOf(id)}</Txt>
            <Txt style={[ar(400, 12, 18), { color: C.slate2 }]} numberOfLines={1}>{categoryOf(id) || ' '}</Txt>
          </View>
          {tag
            ? <Txt style={[ar(600, 12, 18), { color: C.aquaText, backgroundColor: C.mintSoft, borderRadius: s(10), paddingHorizontal: s(8), overflow: 'hidden' }]}>{tag}</Txt>
            : sel ? <Icon name="check" size={20} color={C.aquaText} /> : null}
        </View>
      </Pressy>
    );
    if (!removable(id)) return <View key={id}>{body}</View>;
    // Remaining future stops: swipe right (RTL: toward the reading end) to reveal "حذف" on the left.
    return (
      <Swipeable
        key={id}
        friction={1.6}
        leftThreshold={DELETE_W / 2}
        overshootLeft={false}
        enabled={!busy}
        containerStyle={{ borderRadius: s(ROW_R) }}
        onSwipeableWillOpen={() => {   // keep a single row open
          if (openId.current && openId.current !== id) rowRefs.current[openId.current]?.close();
          openId.current = id;
        }}
        onSwipeableClose={() => { if (openId.current === id) openId.current = null; }}
        renderLeftActions={(_p, _t, methods) => (
          <Pressy onPress={() => { methods.close(); request(id, 'remove'); }} scaleTo={0.97}>
            <View style={{ width: s(DELETE_W), height: '100%', minHeight: s(56), marginRight: s(8), borderRadius: s(ROW_R), backgroundColor: C.critical, alignItems: 'center', justifyContent: 'center', gap: s(2) }}>
              <Icon name="trash" size={20} color={C.white} />
              <Txt style={[ar(600, 13, 18), { color: C.white }]}>حذف</Txt>
            </View>
          </Pressy>
        )}
        ref={(r) => { rowRefs.current[id] = r; }}
      >
        {body}
      </Swipeable>
    );
  };

  return (
    <>
      <Animated.View entering={FadeIn.duration(M.sheet)} exiting={FadeOut.duration(M.sheet)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,32,30,0.28)', zIndex: 20 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="إغلاق" />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex: 21 }]}>
        <Animated.View entering={SlideInDown.duration(M.emphasized).easing(M.continuity)} exiting={SlideOutDown.duration(M.step).easing(M.easeInOut)} layout={resize}
          style={{ overflow: 'hidden', marginHorizontal: s(16), marginBottom: safe.cardBottom, backgroundColor: C.white, borderRadius: s(30), paddingHorizontal: s(20), paddingTop: s(18), paddingBottom: s(16), gap: s(12), boxShadow: `0px ${s(12)}px ${s(40)}px rgba(8,38,36,0.16)` }}>
          {/* heading (RTL) */}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(12) }}>
            <View style={{ width: s(40), height: s(40), borderRadius: s(20), backgroundColor: mode === 'remove' && preview ? C.busyBg : C.mint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={mode === 'remove' && preview ? 'trash' : 'plus'} size={22} color={mode === 'remove' && preview ? C.busyText : C.aquaText} />
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Txt style={[ar(600, 12, 18), { color: C.aquaText }]}>رحلتك الحالية</Txt>
              <Txt style={ar(700, 22, 31)}>إضافة محطة</Txt>
            </View>
          </View>

          {done && (
            <Animated.View key="done" entering={swapIn} style={{ alignItems: 'center', gap: s(10), paddingVertical: s(18) }}>
              <Animated.View entering={ZoomIn.duration(M.step).easing(M.flowOut)} style={{ width: s(52), height: s(52), borderRadius: s(26), backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={28} color={C.aquaText} />
              </Animated.View>
              <Txt style={[ar(600, 16, 24), { color: C.ink, textAlign: 'center' }]}>{done}</Txt>
            </Animated.View>
          )}

          {!preview && !done && (
            <Animated.View key="list" entering={swapIn} exiting={swapOut} style={{ gap: s(12) }}>
              <Txt style={[ar(400, 14, 21), { color: C.slate }]}>أضف محطة جديدة، أو اسحب محطة من خطتك لحذفها.</Txt>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(8), backgroundColor: C.canvas, borderRadius: s(18), borderWidth: s(1), borderColor: C.line, paddingHorizontal: s(14), minHeight: s(50) }}>
                <Icon name="search" size={20} color={C.slate2} />
                <TextInput
                  value={query}
                  onChangeText={(t) => { setQuery(t); setNotice(undefined); }}
                  placeholder="ابحث عن جناح أو تجربة"
                  placeholderTextColor={C.muted}
                  editable={!busy}
                  returnKeyType="search"
                  style={{ flex: 1, fontFamily: ar(400, 16).fontFamily, fontSize: s(16), textAlign: 'right', writingDirection: 'rtl', color: C.ink, paddingVertical: s(10) }}
                />
              </View>

              {showHint && hasRemovable && (
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(6) }}>
                  <Icon name="chevron-left" size={16} color={C.slate2} />
                  <Txt style={[ar(500, 12, 18), { color: C.slate2 }]}>اسحب محطة من خطتك للحذف</Txt>
                </View>
              )}

              <ScrollView style={{ maxHeight: s(270) }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={{ gap: s(6) }}>
                  {results.length === 0 && (
                    <Txt style={[ar(500, 14, 21), { color: C.slate2, textAlign: 'center', paddingVertical: s(16) }]}>لا يوجد مكان بهذا الاسم</Txt>
                  )}
                  {results.map(row)}
                </View>
              </ScrollView>

              {notice && (
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(8), backgroundColor: C.canvas, borderRadius: s(14), padding: s(10) }}>
                  <Icon name="info" size={18} color={C.aquaText} />
                  <Txt style={[ar(500, 14, 21), { color: C.ink, flex: 1 }]}>{notice}</Txt>
                </View>
              )}
              {error && <Txt style={[ar(500, 13, 20), { color: C.busyText }]}>{error}</Txt>}

              <View style={{ flexDirection: 'row', gap: s(8), alignItems: 'stretch' }}>
                <Button label="إلغاء" variant="tertiary" size="medium" height={56} style={{ flex: 1 }} onPress={close} />
                <Button label={busy ? 'نرتّب رحلتك…' : 'إضافة إلى رحلتي'} size="medium" height={56} padX={10} style={{ flex: 1.4 }}
                  disabled={busy || !picked || mode !== 'add'} onPress={() => picked && request(picked, 'add')} />
              </View>
              {busy && <ActivityIndicator color={C.aquaText} />}
            </Animated.View>
          )}

          {preview && picked && !done && (
            <Animated.View key={`preview-${mode}-${picked}`} entering={swapIn} exiting={swapOut} style={{ gap: s(12) }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: s(8), backgroundColor: C.canvas, borderRadius: s(16), padding: s(12) }}>
                <Icon name="info" size={18} color={C.aquaText} />
                <Txt style={[ar(500, 15, 24), { color: C.ink, flex: 1 }]}>
                  {mode === 'add' ? 'أضفنا المكان إلى خطتك، ورتبنا باقي الرحلة حسب الازدحام.' : 'سنحذف المحطة من خطتك، ونرتب باقي الرحلة حسب الازدحام.'}
                </Txt>
              </View>

              {/* the place being added / removed */}
              {mode === 'add' ? (
                <View style={{ borderRadius: s(18), backgroundColor: C.mintSoft, borderWidth: s(1), borderColor: 'rgba(32,205,184,0.45)', padding: s(12), gap: s(8) }}>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(8) }}>
                    <Txt style={[ar(600, 12, 18), { color: C.aquaText }]}>المكان المضاف</Txt>
                    <Txt style={[ar(700, 16, 24), { color: C.ink, flex: 1 }]} numberOfLines={1}>{nameOf(picked)}</Txt>
                  </View>
                  {stop && (
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(14), flexWrap: 'wrap' }}>
                      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(4) }}>
                        <Icon name="walk" size={16} color={C.slate} />
                        <Txt style={[ar(500, 13, 19), { color: C.slate }]}>مشي {minutes(stop.walk_from_prev_min)}</Txt>
                      </View>
                      <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(4) }}>
                        <Icon name="wait" size={16} color={C.slate} />
                        <Txt style={[ar(500, 13, 19), { color: C.slate }]}>انتظار متوقع {minutes(stop.wait_min)}</Txt>
                      </View>
                      <CrowdStatus wait={stop.wait_min} level={levelFor(stop.wait_min)} />
                      <Txt style={[ar(500, 13, 19), { color: C.slate }]}>المحطة {doneIds.length + stop.order} من {doneIds.length + newIds.length}</Txt>
                    </View>
                  )}
                </View>
              ) : (
                <View style={{ borderRadius: s(18), backgroundColor: C.busyBg, borderWidth: s(1), borderColor: 'rgba(228,81,81,0.35)', padding: s(12), flexDirection: 'row-reverse', alignItems: 'center', gap: s(8) }}>
                  <Icon name="trash" size={18} color={C.busyText} />
                  <Txt style={[ar(600, 12, 18), { color: C.busyText }]}>المحطة المحذوفة</Txt>
                  <Txt style={[ar(700, 16, 24), { color: C.ink, flex: 1, textDecorationLine: 'line-through' }]} numberOfLines={1}>{nameOf(picked)}</Txt>
                </View>
              )}

              {/* remaining route after the update */}
              <View style={{ gap: s(6) }}>
                <Txt style={[ar(600, 13, 19), { color: C.slate2 }]}>المسار المتبقي بعد التحديث ({newIds.length} {newIds.length <= 2 ? (newIds.length === 1 ? 'محطة' : 'محطتان') : 'محطات'})</Txt>
                <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', alignItems: 'center', gap: s(4) }}>
                  {newIds.map((id, i) => (
                    <React.Fragment key={id}>
                      {i > 0 && <Txt style={[ar(400, 13, 19), { color: C.muted }]}>←</Txt>}
                      <Txt style={[id === picked ? ar(700, 14, 20) : ar(500, 14, 20), { color: id === picked ? C.aquaText : C.ink }]}>{shortName(id)}</Txt>
                    </React.Fragment>
                  ))}
                </View>
                <Txt style={[ar(400, 13, 19), { color: C.slate2 }]}>
                  إجمالي الانتظار المتوقع للمحطات المتبقية: {minutes(newWait)} (كان {minutes(oldWait)}){newWalk != null ? ` · المشي ${minutes(newWalk)}` : ''}
                </Txt>
                {cameBack.length > 0 && (
                  <Txt style={[ar(500, 13, 19), { color: C.slate }]}>وأعدنا إلى خطتك: {cameBack.map(shortName).join('، ')} (من اهتماماتك السابقة، ويتسع لها وقتك الآن)</Txt>
                )}
                {dropped.length > 0 && (
                  <Txt style={[ar(500, 13, 19), { color: C.busyText }]}>لن يتسع وقتك لـ: {dropped.map(shortName).join('، ')}</Txt>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: s(8), alignItems: 'stretch' }}>
                <Button label="إلغاء" variant="tertiary" size="medium" height={56} style={{ flex: 1 }} onPress={mode === 'remove' ? backToList : close} />
                <Button label={busy ? 'نحدّث…' : mode === 'add' ? 'تأكيد التعديل' : 'تأكيد الإزالة'} size="medium" height={56} padX={10} style={{ flex: 1.4 }} disabled={busy} onPress={confirm} />
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  );
}
