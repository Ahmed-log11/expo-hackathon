/**
 * "Adjust my plan" sheet (Live Journey). The visitor types or taps a request ("I'm tired, something
 * indoor"), the AI reads it, the engine builds the new plan, and nothing changes until they accept.
 * Styled like the reroute card: white sheet, old route quiet, new route highlighted in mint.
 */
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { C, M, ar, s, useSafe } from '../theme';
import { Button, Chip, Icon, RtlScrollRow, Txt } from './ui';
import { useStore } from '../data/store';
import { shortName } from '../data/places';
import type { AdjustPreview } from '../data/api';

export function AdjustSheet({ visible, nextId, onClose, onApplied }: {
  visible: boolean; nextId?: string; onClose: () => void; onApplied: (message: string) => void;
}) {
  const safe = useSafe();
  const { adjustPlan, acceptAdjust, cancelAdjust } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<AdjustPreview>();
  const [error, setError] = useState<string>();

  const quick = [
    'أنا تعبان، أبي مكان داخلي قريب',
    ...(nextId ? [`ما أبي ${shortName(nextId)}`] : []),
    'أبي مكان هادئ بدون زحمة',
    'أبي أطلع الساعة 10',
  ];

  const reset = () => { setText(''); setPreview(undefined); setError(undefined); setBusy(false); };
  const close = async () => {
    if (preview?.preview_id) cancelAdjust(preview.preview_id);
    reset();
    onClose();
  };
  const send = async (value = text) => {
    if (!value.trim() || busy) return;
    setText(value);
    setBusy(true);
    setError(undefined);
    try {
      setPreview(await adjustPlan(value.trim()));
    } catch {
      setError('تعذّر الوصول للخادم، حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!preview?.preview_id || busy) return;
    setBusy(true);
    const r = await acceptAdjust(preview.preview_id);
    setBusy(false);
    if (r === 'ok') {
      reset();
      onApplied('تم تعديل خطتك');
    } else {
      setPreview(undefined);
      setError(r === 'expired' ? 'انتهت صلاحية المعاينة أو تغيّرت الخطة، اطلب التعديل مرة أخرى' : 'تعذّر تعديل الخطة');
    }
  };

  if (!visible) return null;
  const order = (ids: string[]) => ids.map(shortName).filter(Boolean).join(' ← ') || '—';

  return (
    <>
      <Animated.View entering={FadeIn.duration(M.sheet)} exiting={FadeOut.duration(M.sheet)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,32,30,0.28)', zIndex: 20 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', zIndex: 21 }]}>
        <Animated.View entering={SlideInDown.duration(380).easing(M.continuity)} exiting={SlideOutDown.duration(M.sheet)}
          style={{ marginHorizontal: s(16), marginBottom: safe.cardBottom, backgroundColor: C.white, borderRadius: s(30), paddingHorizontal: s(20), paddingTop: s(18), paddingBottom: s(16), gap: s(12), boxShadow: `0px ${s(12)}px ${s(40)}px rgba(8,38,36,0.16)` }}>
          {/* heading (RTL) */}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(12) }}>
            <View style={{ width: s(40), height: s(40), borderRadius: s(20), backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plan" size={22} color={C.aquaText} />
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Txt style={[ar(600, 12, 18), { color: C.aquaText }]}>مساعد الخطة</Txt>
              <Txt style={ar(700, 22, 31)}>عدّل خطتك</Txt>
            </View>
          </View>

          {!preview && (
            <>
              <Txt style={[ar(400, 15, 24), { color: C.slate }]}>اكتب ما تريد بكلماتك، ونعدّل خطتك لك.</Txt>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="مثلًا: أنا تعبان، أبي مكان داخلي قريب"
                placeholderTextColor={C.muted}
                multiline
                maxLength={300}
                editable={!busy}
                onSubmitEditing={() => send()}
                style={{ fontFamily: ar(400, 16).fontFamily, fontSize: s(16), minHeight: s(64), maxHeight: s(110), textAlign: 'right', writingDirection: 'rtl', color: C.ink, backgroundColor: C.canvas, borderRadius: s(18), borderWidth: s(1), borderColor: C.line, paddingHorizontal: s(14), paddingVertical: s(10) }}
              />
              <RtlScrollRow gap={8}>
                {quick.map((q) => <Chip key={q} label={q} onPress={() => send(q)} />)}
              </RtlScrollRow>
              {error && <Txt style={[ar(500, 13, 20), { color: C.busyText }]}>{error}</Txt>}
              <View style={{ flexDirection: 'row', gap: s(8), alignItems: 'stretch' }}>
                <Button label="إلغاء" variant="tertiary" size="medium" height={56} style={{ flex: 1 }} onPress={close} />
                <Button label={busy ? 'نفهم طلبك…' : 'عدّل الخطة'} size="medium" height={56} style={{ flex: 1.4 }} disabled={busy || !text.trim()} onPress={() => send()} />
              </View>
              {busy && <ActivityIndicator color={C.aquaText} />}
            </>
          )}

          {preview && (
            <>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', gap: s(8), backgroundColor: C.canvas, borderRadius: s(16), padding: s(12) }}>
                <Icon name="info" size={18} color={C.aquaText} />
                <Txt style={[ar(500, 15, 24), { color: C.ink, flex: 1 }]}>{preview.reply}</Txt>
              </View>
              {preview.preview_id && (
                <View style={{ gap: s(6) }}>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(6), paddingHorizontal: s(10), minHeight: s(40) }}>
                    <Txt style={[ar(500, 13, 19), { color: C.slate2 }]}>الحالية</Txt>
                    <Txt style={[ar(400, 13, 20), { color: C.slate2, flex: 1 }]} numberOfLines={2}>{order(preview.old.map((x) => x.pavilion_id))}</Txt>
                  </View>
                  <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: s(6), paddingHorizontal: s(10), minHeight: s(46), borderRadius: s(16), backgroundColor: C.mintSoft, borderWidth: s(1), borderColor: 'rgba(32,205,184,0.45)' }}>
                    <Txt style={[ar(700, 13, 19), { color: C.aquaText }]}>الجديدة</Txt>
                    <Txt style={[ar(700, 13, 20), { color: C.ink, flex: 1 }]} numberOfLines={2}>{order(preview.new.map((x) => x.pavilion_id))}</Txt>
                  </View>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: s(8), alignItems: 'stretch' }}>
                <Button label={preview.preview_id ? 'الإبقاء على خطتي' : 'إغلاق'} variant="tertiary" size="medium" height={56} padX={8} style={{ flex: 151 }} onPress={close} />
                {preview.preview_id
                  ? <Button label={busy ? 'نحدّث…' : 'اعتمد التعديل'} size="medium" height={56} padX={10} style={{ flex: 171 }} disabled={busy} onPress={apply} />
                  : <Button label="جرّب طلبًا آخر" size="medium" height={56} padX={10} style={{ flex: 171 }} onPress={() => { setPreview(undefined); setText(''); }} />}
              </View>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </>
  );
}
