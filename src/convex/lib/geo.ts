import axios from "axios";

/**
 * لایه سرویس‌های نقشه و مکان‌یابی (بخش ۰۵).
 *
 * این لایه عمداً «قابل تعویض» طراحی شده است: هر سرویس پشت یک تابع استاندارد
 * پنهان شده و فهرست سرویس‌ها در `ROUTE_PROVIDERS` قابل تغییر است.
 * هیچ داده ساختگی‌ای در کار نیست؛ اگر هیچ سرویسی در دسترس نباشد، خطا برمی‌گردد
 * و رابط کاربری پیام خطای نقشه را نمایش می‌دهد.
 *
 * سرویس‌های استفاده‌شده همگی واقعی و رایگان هستند:
 * - مسیریابی: OSRM روی شبکه جاده‌ای واقعی OpenStreetMap (با پشتیبان FOSSGIS)
 * - جست‌وجوی آدرس: Nominatim (OpenStreetMap)
 * - آب‌وهوا: Open-Meteo
 * - ارتفاع مسیر: Open-Meteo Elevation
 * برای هر کدام در پنل مدیریت امکان ثبت کلید/جایگزین وجود دارد.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  /** هندس مسیر به‌صورت زوج‌های [lat, lng] */
  geometry: number[];
  provider: string;
  pointCount: number;
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
  provider: string;
}

const HTTP_TIMEOUT = 12000;
const USER_AGENT = "Safaryar/1.0 (ride-sharing; contact: admin@safaryar.local)";
const MAX_ROUTE_POINTS = 320;

/** سرویس‌های مسیریابی؛ اولین سرویس در دسترس برنده می‌شود. */
export const ROUTE_PROVIDERS: {
  id: string;
  name: string;
  url: string;
  kind: "osrm";
}[] = [
  {
    id: "osrm-public",
    name: "OSRM (OpenStreetMap)",
    url: "https://router.project-osrm.org",
    kind: "osrm",
  },
  {
    id: "fossgis-osrm",
    name: "FOSSGIS OSRM",
    url: "https://routing.openstreetmap.de/routed-car",
    kind: "osrm",
  },
];

export function routeProviderById(id: string | undefined) {
  return ROUTE_PROVIDERS.find((p) => p.id === id) ?? ROUTE_PROVIDERS[0];
}

/** کوتاه‌کردن هندس مسیر تا حجم ذخیره‌سازی معقول بماند */
function downsample(points: number[][]): number[] {
  const flat: number[] = [];
  if (points.length === 0) return flat;
  const step = Math.max(1, Math.ceil(points.length / MAX_ROUTE_POINTS));
  for (let i = 0; i < points.length; i += step) {
    flat.push(points[i][1], points[i][0]); // lat, lng
  }
  const last = points[points.length - 1];
  if (flat[flat.length - 2] !== last[1] || flat[flat.length - 1] !== last[0]) {
    flat.push(last[1], last[0]);
  }
  return flat;
}

/**
 * محاسبه مسیر قابل پیمایش بین دو نقطه.
 * مسافت از مسیر جاده‌ای محاسبه می‌شود، نه فاصله مستقیم (خطوط هوایی).
 */
export async function routeDriving(
  from: LatLng,
  to: LatLng,
  providerId?: string,
): Promise<RouteResult> {
  const preferred = providerId ? [routeProviderById(providerId)] : [];
  const ordered = [
    ...preferred,
    ...ROUTE_PROVIDERS.filter((p) => !preferred.includes(p)),
  ];
  const errors: string[] = [];

  for (const provider of ordered) {
    const url = `${provider.url}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`;
    try {
      const { data } = await axios.get(url, {
        timeout: HTTP_TIMEOUT,
        params: { overview: "full", geometries: "geojson", alternatives: false },
        headers: { "User-Agent": USER_AGENT },
      });
      const route = data?.routes?.[0];
      if (!route || !Array.isArray(route.geometry?.coordinates)) {
        errors.push(`${provider.name}: مسیری یافت نشد`);
        continue;
      }
      const geometry = downsample(route.geometry.coordinates as number[][]);
      return {
        distanceKm: Math.round((route.distance / 1000) * 100) / 100,
        durationMin: Math.max(1, Math.round(route.duration / 60)),
        geometry,
        provider: provider.id,
        pointCount: geometry.length / 2,
      };
    } catch (error) {
      errors.push(`${provider.name}: ${axiosErrorText(error)}`);
    }
  }

  throw new Error(
    `سرویس نقشه در دسترس نیست. ${errors.join(" | ") || "هیچ سرویسی پاسخ نداد."}`,
  );
}

/** جست‌وجوی آدرس و تبدیل به مختصات */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const { data } = await axios.get("https://nominatim.openstreetmap.org/search", {
    timeout: HTTP_TIMEOUT,
    params: {
      format: "jsonv2",
      q: query,
      limit: 6,
      "accept-language": "fa",
    },
    headers: { "User-Agent": USER_AGENT },
  });
  if (!Array.isArray(data)) throw new Error("سرویس جست‌وجوی آدرس پاسخ نامعتبر داد.");
  return data.map((item: Record<string, string>) => ({
    label: item.display_name ?? query,
    lat: Number(item.lat),
    lng: Number(item.lon),
    provider: "nominatim",
  }));
}

/** تبدیل مختصات به آدرس (برای انتخاب نقطه روی نقشه) */
export async function reverseGeocode(point: LatLng): Promise<GeocodeResult | null> {
  try {
    const { data } = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      timeout: HTTP_TIMEOUT,
      params: {
        format: "jsonv2",
        lat: point.lat,
        lon: point.lng,
        "accept-language": "fa",
      },
      headers: { "User-Agent": USER_AGENT },
    });
    if (!data?.display_name) return null;
    return {
      label: data.display_name as string,
      lat: point.lat,
      lng: point.lng,
      provider: "nominatim",
    };
  } catch {
    return null;
  }
}

export interface WeatherReading {
  precipitationMm: number;
  snowfallMm: number;
  observedAt: number;
}

/**
 * آب‌وهوا در ساعت حرکت از منبع معتبر (Open-Meteo).
 * اگر داده در دسترس نباشد null برمی‌گردد و سامانه شرط را حدس نمی‌زند.
 */
export async function fetchWeather(
  point: LatLng,
  departureAt: number,
): Promise<WeatherReading | null> {
  const date = new Date(departureAt);
  const day = date.toISOString().slice(0, 10);
  const hourKey = date.toISOString().slice(0, 13);
  try {
    const { data } = await axios.get("https://api.open-meteo.com/v1/forecast", {
      timeout: HTTP_TIMEOUT,
      params: {
        latitude: point.lat,
        longitude: point.lng,
        hourly: "precipitation,rain,snowfall",
        timezone: "UTC",
        start_date: day,
        end_date: day,
      },
    });
    const times: string[] = data?.hourly?.time ?? [];
    const index = times.findIndex((t) => t.slice(0, 13) === hourKey);
    if (index < 0) return null;
    const precipitation = Number(data.hourly.precipitation?.[index] ?? 0);
    const snowfall = Number(data.hourly.snowfall?.[index] ?? 0);
    if (!Number.isFinite(precipitation) || !Number.isFinite(snowfall)) return null;
    return {
      precipitationMm: precipitation,
      snowfallMm: snowfall,
      observedAt: departureAt,
    };
  } catch {
    return null;
  }
}

export interface ElevationReading {
  minM: number;
  maxM: number;
  ascentM: number;
  samples: number;
}

/**
 * ارتفاع مسیر از منبع معتبر (Open-Meteo Elevation) برای تشخیص مسیر کوهستانی.
 * اگر داده در دسترس نباشد null برمی‌گردد و شرط «کوهستانی» اعمال نمی‌شود.
 */
export async function fetchElevation(
  geometry: number[],
): Promise<ElevationReading | null> {
  const points: number[] = [];
  const total = geometry.length / 2;
  if (total < 2) return null;
  const sampleCount = Math.min(24, total);
  const coords: string[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const idx = Math.round((i * (total - 1)) / (sampleCount - 1));
    const lat = geometry[idx * 2];
    const lng = geometry[idx * 2 + 1];
    coords.push(`${lat.toFixed(5)},${lng.toFixed(5)}`);
    points.push(lat);
  }
  try {
    const { data } = await axios.get("https://api.open-meteo.com/v1/elevation", {
      timeout: HTTP_TIMEOUT,
      params: { elevation: coords.join(",") },
    });
    const values: number[] = data?.elevation ?? [];
    if (!Array.isArray(values) || values.length < 2) return null;
    let min = Infinity;
    let max = -Infinity;
    let ascent = 0;
    for (let i = 0; i < values.length; i++) {
      const value = Number(values[i]);
      if (!Number.isFinite(value)) return null;
      min = Math.min(min, value);
      max = Math.max(max, value);
      if (i > 0) {
        const delta = value - Number(values[i - 1]);
        if (delta > 0) ascent += delta;
      }
    }
    return { minM: Math.round(min), maxM: Math.round(max), ascentM: Math.round(ascent), samples: values.length };
  } catch {
    return null;
  }
}

export function axiosErrorText(error: unknown): string {
  const err = error as { code?: string; message?: string; response?: { status?: number } };
  if (err.response?.status) return `HTTP ${err.response.status}`;
  if (err.code) return err.code;
  return err.message ?? "خطای ناشناخته";
}
