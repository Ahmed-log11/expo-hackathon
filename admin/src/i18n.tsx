import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ApiError } from './api';

export type Lang = 'ar' | 'en';

// Numbers sit next to labels ("قُبل منها 3"), not before counted nouns, so the Arabic reads right for any count.
const AR = {
  brand: 'انسياب',
  title: 'لوحة التشغيل',
  live: 'مباشر',
  updatedAgo: 'قبل {s} ث',
  serverClock: 'توقيت الخادم {t}',
  connecting: 'جارٍ الاتصال بالخادم…',
  waking: 'الخادم يستيقظ، قد يستغرق ذلك دقيقة…',
  offline: 'انقطع الاتصال بالخادم',
  demo: 'التحكم بالعرض',
  switchLang: 'English',

  kpiSaved: 'دقائق انتظار وفّرناها للزوار',
  kpiSavedUnit: 'دقيقة',
  kpiSavedSub: 'من ترتيب الخطط: {plan} د · من إعادة التوجيه: {re} د',
  kpiActive: 'زوار في الموقع الآن',
  kpiActiveSub: 'لديهم خطة: {total} · على التطبيق الآن: {live}',
  kpiBooked: 'زيارات محجوزة خلال ساعتين',
  kpiBookedSub: 'موزّعة على {n} من {all} جناحًا',
  kpiOffers: 'عروض إعادة التوجيه',
  kpiOffersSub: 'قُبل منها {acc} · بانتظار الرد {open}',
  kpiWait: 'متوسط الانتظار الآن',
  kpiWaitSub: 'الأعلى: {name} · {w} د',
  statsMissing: 'هذا الخادم لا يوفّر ‎/admin/stats بعد، لذلك تظهر المؤشرات وسجل التوزيع بعد دمج الفرع في main. الازدحام والتوقعات تعمل الآن.',

  min: '{n} د',
  low: 'منخفض',
  medium: 'متوسط',
  high: 'مزدحم',
  legendLow: 'منخفض · أقل من 15 د',
  legendMedium: 'متوسط · 15–39 د',
  legendHigh: 'مزدحم · 40 د فأكثر',

  tablePavilions: 'الأجنحة',
  groupNow: 'الآن',
  groupForecast: 'توقع النموذج',
  groupLedger: 'سجل التوزيع: من سنرسلهم خلال الساعتين القادمتين',
  colPavilion: 'الجناح',
  colWait: 'الانتظار',
  colQueue: 'في الطابور',
  colForecast: 'حتى 90 د القادمة',
  colTotal: 'المجموع',
  heatLegend: 'زوار لكل 15 دقيقة',
  ledgerHint: 'كل خطة نرسلها تُحجز هنا مسبقًا، فلا نرسل الجميع إلى الجناح الهادئ نفسه في الوقت نفسه.',
  forecastTip: 'الآن {a} · بعد 30 د: {b} · بعد 60 د: {c} · بعد 90 د: {d}',
  cellTip: 'القادمون المتوقعون: {n}',
  loading: 'جارٍ التحميل…',

  mapTitle: 'خريطة الموقع',

  detailHint: 'اختر جناحًا من الجدول أو الخريطة لعرض توقعه وحجوزاته.',
  detailWait: 'الانتظار الآن',
  detailQueue: 'في الطابور',
  detailCapacity: 'السعة بالساعة',
  detailVisit: 'مدة الزيارة',
  detailForecast: 'توقع نموذج التعلم الآلي',
  detailForecastNote: 'نموذج XGBoost مع آخر قياس والزوار الموجَّهين',
  detailLedger: 'القادمون حسب سجل التوزيع',
  spikeHere: 'محاكاة ازدحام هنا',
  now: 'الآن',
  after: 'بعد {n} د',
  close: 'إغلاق',

  simTitle: 'محاكاة زوار',
  simHint: 'زوار جدد عبر POST /visitors، لكل منهم 3–5 أجنحة',
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
  errForbidden: 'الخادم يطلب رمز العرض الصحيح',
  errClosed: 'المعرض مغلق الآن (يفتح 10:00–24:00)، فلا يمكن بدء زيارات',
  errNetwork: 'تعذّر الوصول إلى الخادم',
  errGeneric: 'خطأ: {msg}',
};

type Key = keyof typeof AR;

const EN: Record<Key, string> = {
  brand: 'INSYAB',
  title: 'Operations dashboard',
  live: 'Live',
  updatedAgo: '{s}s ago',
  serverClock: 'Server time {t}',
  connecting: 'Connecting to the server…',
  waking: 'The server is waking up, this can take a minute…',
  offline: 'Lost connection to the server',
  demo: 'Demo controls',
  switchLang: 'العربية',

  kpiSaved: 'Waiting time saved for visitors',
  kpiSavedUnit: 'min',
  kpiSavedSub: '{plan} min from smarter plans · {re} min from reroutes',
  kpiActive: 'Visitors on site now',
  kpiActiveSub: '{total} with a plan · {live} live in the app',
  kpiBooked: 'Visits booked, next 2 h',
  kpiBookedSub: 'spread over {n} of {all} pavilions',
  kpiOffers: 'Reroute offers',
  kpiOffersSub: '{acc} accepted · {open} awaiting an answer',
  kpiWait: 'Average wait now',
  kpiWaitSub: 'Longest: {name} · {w} min',
  statsMissing: "This server doesn't have /admin/stats yet, so the KPIs and the ledger appear once the branch is merged into main. Crowd and forecasts work now.",

  min: '{n} min',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  legendLow: 'Low · under 15 min',
  legendMedium: 'Medium · 15–39 min',
  legendHigh: 'High · 40+ min',

  tablePavilions: 'Pavilions',
  groupNow: 'Now',
  groupForecast: 'Model forecast',
  groupLedger: 'Ledger: who we are sending, next 2 hours',
  colPavilion: 'Pavilion',
  colWait: 'Wait',
  colQueue: 'In line',
  colForecast: 'Up to +90 min',
  colTotal: 'Total',
  heatLegend: 'visitors per 15 min',
  ledgerHint: 'Every plan we hand out is booked here first, so we never send everyone to the same quiet pavilion at the same time.',
  forecastTip: 'Now {a} · +30: {b} · +60: {c} · +90: {d} min',
  cellTip: 'Expected arrivals: {n}',
  loading: 'Loading…',

  mapTitle: 'Site map',

  detailHint: 'Pick a pavilion in the table or on the map to see its forecast and bookings.',
  detailWait: 'Wait now',
  detailQueue: 'In line',
  detailCapacity: 'Capacity per hour',
  detailVisit: 'Visit length',
  detailForecast: 'Machine-learning forecast',
  detailForecastNote: 'XGBoost model + latest measurement + routed visitors',
  detailLedger: 'Arrivals booked in the ledger',
  spikeHere: 'Spike this pavilion',
  now: 'Now',
  after: '+{n}',
  close: 'Close',

  simTitle: 'Simulate visitors',
  simHint: 'New visitors via POST /visitors, 3–5 pavilions each',
  simProgress: '{done} of {total}',
  simFailed: '{n} failed',
  simDone: 'Done: {n} visitors added',
  stop: 'Stop',
  spikeTitle: 'Spike a pavilion',
  spikeWait: 'Wait (min)',
  spikeBtn: 'Spike',
  spikeDone: 'Done: {alerts} alerts · {offers} reroute offers',
  resetTitle: 'Reset',
  resetHint: 'Clears measurements, offers and ledger bookings. Visitors stay.',
  resetBtn: 'Reset',
  resetConfirm: 'Click again to confirm',
  resetDone: 'Reset done',
  token: 'Demo token',
  tokenPlaceholder: 'DEMO_TOKEN (optional)',
  errForbidden: 'The server needs the right demo token',
  errClosed: "The Expo is closed now (open 10:00–24:00), so visits can't start",
  errNetwork: 'Could not reach the server',
  errGeneric: 'Error: {msg}',
};

const STRINGS: Record<Lang, Record<Key, string>> = { ar: AR, en: EN };
const STORAGE_KEY = 'insyab-admin-lang';

function initialLang(): Lang {
  const q = new URLSearchParams(window.location.search).get('lang');
  if (q === 'ar' || q === 'en') return q;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch { /* storage blocked: default below */ }
  return 'ar';   // the pitch audience is Arabic-first
}

interface Named { name_ar: string; name_en: string }

export interface I18n {
  lang: Lang;
  rtl: boolean;
  setLang: (lang: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  /** A place's name in the current language. */
  name: (place: Named | undefined, fallback?: string) => string;
  /** A friendly message for a failed request. */
  errorText: (e: ApiError) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = `${STRINGS[lang].brand} · ${STRINGS[lang].title}`;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* not remembered, still switches */ }
  }, []);

  const value = useMemo<I18n>(() => {
    const t: I18n['t'] = (key, vars) =>
      STRINGS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ''));
    return {
      lang,
      rtl: lang === 'ar',
      setLang,
      t,
      name: (place, fallback = '') => (place ? (lang === 'ar' ? place.name_ar : place.name_en) : fallback),
      errorText: (e) => {
        if (e.status === 403) return t('errForbidden');
        if (e.code === 'outside_opening_hours') return t('errClosed');
        if (e.status === 0) return t('errNetwork');
        return t('errGeneric', { msg: e.message });
      },
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
