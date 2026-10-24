import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";

export type MapPoint = { lat: number; lng: number; label?: string };

type Props = {
  origin: MapPoint | null;
  destination: MapPoint | null;
  /** هندس مسیر به‌صورت زوج‌های [lat, lng, lat, lng, …] */
  route?: number[];
  className?: string;
  height?: number;
  /** امکان انتخاب نقطه روی نقشه با کلیک */
  onPick?: (point: { lat: number; lng: number }) => void;
};

function markerIcon(kind: "origin" | "destination") {
  return L.divIcon({
    className: "",
    html: `<span style="
      display:block;width:18px;height:18px;border-radius:50%;
      background:${kind === "origin" ? "var(--color-brand-teal)" : "var(--color-brand-saffron-deep)"};
      border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * نقشه مسیر سفریار: فقط نمایش مبدأ، مقصد و مسیر واقعی جاده.
 * برگ‌های leaflet در جهت راست‌چین تأثیری نمی‌پذیرند (استایل در index.css).
 */
export function RouteMap({
  origin,
  destination,
  route,
  className,
  height = 280,
  onPick,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    }).setView([32.4279, 53.688], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; نقشه OpenStreetMap",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    if (onPick) {
      map.on("click", (e: L.LeafletMouseEvent) => {
        onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    }

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      routeLineRef.current = null;
    };
    // فقط یک‌بار اجرا می‌شود؛ تغییرات بعدی در افکت‌های زیر اعمال می‌شوند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // مبدأ و مقصد
  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();
    routeLineRef.current = null;

    const points: { point: MapPoint; kind: "origin" | "destination" }[] = [];
    if (origin) points.push({ point: origin, kind: "origin" });
    if (destination) points.push({ point: destination, kind: "destination" });

    for (const { point, kind } of points) {
      L.marker([point.lat, point.lng], { icon: markerIcon(kind) })
        .addTo(layer)
        .bindPopup(point.label ?? (kind === "origin" ? "مبدأ" : "مقصد"));
    }
    if (points.length === 2) {
      map.fitBounds(
        L.latLngBounds(points.map((p) => [p.point.lat, p.point.lng] as [number, number])),
        { padding: [36, 36], maxZoom: 12 },
      );
    } else if (points.length === 1) {
      map.setView([points[0].point.lat, points[0].point.lng], 11);
    }
  }, [origin, destination]);

  // مسیر واقعی جاده
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !route || route.length < 4) return;
    if (routeLineRef.current) {
      layer.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }
    const coords: [number, number][] = [];
    for (let i = 0; i < route.length; i += 2) {
      coords.push([route[i], route[i + 1]]);
    }
    routeLineRef.current = L.polyline(coords, {
      color: "var(--color-brand-teal)",
      weight: 4,
      opacity: 0.85,
    }).addTo(layer);
  }, [route]);

  return <div ref={containerRef} className={className} style={{ height }} dir="ltr" />;
}
