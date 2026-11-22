"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { TrackPoint } from "@/lib/route-points";

export default function RouteMap({ points }: { points: TrackPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    let map: LeafletMap | undefined;
    let resize: ResizeObserver | undefined;
    import("leaflet").then(L => {
      if (!active || !container.current) return;
      map = L.map(container.current, { scrollWheelZoom: false });
      map.attributionControl?.setPrefix(false);
      L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        maxZoom: 19,
      }).addTo(map);
      const route = L.polyline(points, { color: "#a2341a", weight: 5, opacity: .93 }).addTo(map);
      const first = points[0], last = points[points.length - 1];
      L.circleMarker(first, { radius: 6, color: "white", weight: 2, fillColor: "#146447", fillOpacity: 1 }).bindTooltip("Départ").addTo(map);
      L.circleMarker(last, { radius: 6, color: "white", weight: 2, fillColor: "#a2341a", fillOpacity: 1 }).bindTooltip("Arrivée").addTo(map);
      map.fitBounds(route.getBounds(), { padding: [28, 28], maxZoom: 16 });
      resize = new ResizeObserver(() => map?.invalidateSize());
      resize.observe(container.current);
    }).catch(() => {
      if (active) setMessage("La carte OpenStreetMap n’a pas pu être chargée.");
    });

    return () => {
      active = false;
      resize?.disconnect();
      map?.remove();
    };
  }, [points]);

  return <>
    <div ref={container} className="route-map" role="region" aria-label="Tracé de la course sur OpenStreetMap"/>
    {message && <p role="status">{message}</p>}
  </>;
}
