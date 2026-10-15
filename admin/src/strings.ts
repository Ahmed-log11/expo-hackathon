import type { ApiError } from './api';

/** Every piece of text on the dashboard. {name} placeholders are filled in by t(). */
const AR = {
  brand: 'انسياب',
  title: 'لوحة التشغيل',
  live: 'مباشر',
  connecting: 'جارٍ الاتصال بالخادم…',
  waking: 'الخادم يستيقظ، قد يستغرق ذلك دقيقة…',
  offline: 'انقطع الاتصال بالخادم',
  demo: 'أدوات المحاكاة',

  kpiSaved: 'دقائق انتظار وفّرناها للزوار',
  kpiUnit: 'دقيقة',
  kpiActive: 'زوار في الموقع الآن',
  kpiOffers: 'عروض إعادة التوجيه',
  kpiOffersSub: 'قُبل منها {acc}',
  kpiWait: 'متوسط الانتظار الآن',

  aiTitle: 'ملخص الذكاء الاصطناعي',
  aiFocusOverview: 'نظرة عامة',
  aiFocusHotspots: 'أين الازدحام؟',
  aiFocusNextHour: 'الساعة القادمة',
  aiFocusActions: 'ماذا أفعل الآن؟',
  aiFocusBalancing: 'أداء التوازن',
  aiRefresh: 'تحديث',
  aiWriting: 'يكتب الملخص…',
  aiSourceLlm: 'كتبه النموذج',
  aiSourceRules: 'ملخص تلقائي',
  aiUpdated: 'آخر تحديث {time}',
  aiAction: 'الإجراء',
  aiCritical: 'عاجل',
  aiWarning: 'انتبه',
  aiGood: 'جيد',
  aiInfo: 'معلومة',
  aiError: 'تعذّر تحميل الملخص',
  aiNoHistory: 'المقارنة بالمعتاد لهذه الساعة (السجل يبدأ بعد 30 دقيقة من تشغيل الخادم)',

  chartTitle: 'متوسط الانتظار في الموقع',
  chartSub: 'آخر ساعتين، ثم توقع النموذج لـ 90 دقيقة',
  chartMeasured: 'مقاس',
  chartEstimated: 'تقديري (بعد إعادة تشغيل الخادم)',
  chartForecast: 'توقع النموذج',
  chartNow: 'الآن',
  chartNowValue: 'الآن {n} د',
  chartIn: 'بعد {m} د',
  chartTip: '{time} · {n} د',
  trendUp: 'زاد {n} د خلال {m} دقيقة',
  trendDown: 'انخفض {n} د خلال {m} دقيقة',
  trendEst: ' (تقديري)',

  mapTitle: 'خريطة الموقع',
  mapSub: 'كل نقطة جناح، ولونها حسب الانتظار الآن',
  mapTipQueue: '{n} في الطابور',
  distTitle: 'المناطق',
  distAvg: 'متوسط الانتظار',
  distHottest: 'الأعلى: {name} ({n} د)',
  distRouted: 'موجّهون خلال ساعتين: {n}',
  distCounts: '{high} مزدحم · {medium} متوسط · {low} منخفض',
  distTrendUp: '▲{n} د',
  distTrendDown: '▼{n} د',

  min: '{n} د',
  low: 'منخفض',
  medium: 'متوسط',
  high: 'مزدحم',

  groupNow: 'الآن',
  groupForecast: 'توقع النموذج',
  groupLedger: 'سجل التوزيع: من سنرسلهم خلال الساعتين القادمتين',
  colPavilion: 'الجناح',
  colWait: 'الانتظار',
  colQueue: 'في الطابور',
  colForecast: 'حتى 90 د القادمة',
  colTotal: 'المجموع',
  forecastTip: 'الآن {a} · بعد 30 د: {b} · بعد 60 د: {c} · بعد 90 د: {d}',

  simTitle: 'محاكاة زوار',
  simProgress: '{done} من {total}',
  simFailed: 'تعذّر: {n}',
  simDone: 'اكتملت المحاكاة: {n}',
  stop: 'إيقاف',
  spikeTitle: 'ازدحام مفاجئ',
  spikeWait: 'دقائق الانتظار',
  spikeBtn: 'ارفع الانتظار',
  spikeDone: 'تم: تنبيهات {alerts} · عروض {offers}',
  resetTitle: 'إعادة الضبط',
  resetHint: 'يمسح القياسات والعروض والحجوزات، ويُبقي الزوار.',
  resetBtn: 'إعادة الضبط',
  resetConfirm: 'اضغط مرة أخرى للتأكيد',
  resetDone: 'تمت إعادة الضبط',
  token: 'رمز العرض',
  tokenPlaceholder: 'DEMO_TOKEN (اختياري)',
  close: 'إغلاق',

  errForbidden: 'الخادم يطلب رمز العرض الصحيح',
  errClosed: 'المعرض مغلق الآن (يفتح 10:00–24:00)، فلا يمكن بدء زيارات',
  errNetwork: 'تعذّر الوصول إلى الخادم',
  errGeneric: 'خطأ: {msg}',
};

export type Key = keyof typeof AR;

export const t = (key: Key, vars?: Record<string, string | number>): string =>
  AR[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''));

/** A friendly message for a failed request. */
export function errorText(e: ApiError): string {
  if (e.status === 403) return t('errForbidden');
  if (e.code === 'outside_opening_hours') return t('errClosed');
  if (e.status === 0) return t('errNetwork');
  return t('errGeneric', { msg: e.message });
}
