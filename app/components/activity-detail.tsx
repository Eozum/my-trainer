"use client";

import { useEffect, useRef, useState } from "react";
import type { Activity } from "@/lib/model";
import { routePoints, type TrackPoint } from "@/lib/route-points";
import { formatDuration, formatPace } from "@/lib/statistics";
import RouteMap from "./route-map";

const number = (value: number) => value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function fileCoordinates(source: string) {
  const xml = new DOMParser().parseFromString(source, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw Error("Le fichier GPX ou TCX est illisible.");
  const elements = (tag: string) => Array.from(xml.getElementsByTagNameNS("*", tag));
  const value = (text: string | null | undefined) => text?.trim() ? Number(text) : NaN;
  if (xml.documentElement.localName.toLowerCase() === "gpx") {
    const track = elements("trkpt");
    return routePoints((track.length ? track : elements("rtept")).map(point => [
      value(point.getAttribute("lat")), value(point.getAttribute("lon")),
    ]));
  }
  if (xml.documentElement.localName !== "TrainingCenterDatabase") throw Error("Choisis un fichier GPX ou TCX.");
  return routePoints(elements("Position").map(point => [
    value(point.getElementsByTagNameNS("*", "LatitudeDegrees")[0]?.textContent),
    value(point.getElementsByTagNameNS("*", "LongitudeDegrees")[0]?.textContent),
  ]));
}

export default function ActivityDetail({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [message, setMessage] = useState("");
  const [manualTrack, setManualTrack] = useState(false);
  const source = activity.id.startsWith("garmin:") ? "garmin" : activity.id.startsWith("strava:") ? "strava" : null;
  const provider = source === "garmin" ? "Garmin Connect" : source === "strava" ? "Strava" : "Import de fichier";

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  useEffect(() => {
    if (!source || manualTrack) return;
    const controller = new AbortController();
    fetch(`/api/${source}/track?id=${encodeURIComponent(activity.id.slice(source.length + 1))}`, {
      method: "POST", cache: "no-store", signal: controller.signal,
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? "Impossible de récupérer le tracé.");
      if (controller.signal.aborted) return;
      const track = routePoints(data.points);
      setPoints(track);
      setMessage(track.length ? "" : "Aucun tracé GPS disponible pour cette sortie.");
    }).catch(error => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Impossible de récupérer le tracé.");
    });
    return () => controller.abort();
  }, [activity.id, manualTrack, source]);

  async function loadFile(file?: File) {
    if (!file) return;
    setManualTrack(true);
    try {
      if (file.size > 8 * 1024 * 1024) throw Error("Le fichier GPS dépasse 8 Mo.");
      const track = fileCoordinates(await file.text());
      if (!track.length) throw Error("Ce fichier ne contient pas de tracé GPS exploitable.");
      setPoints(track);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de lire le fichier GPS.");
    }
  }

  const period = new Date(`${activity.date}T12:00:00Z`).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "UTC" });

  return <dialog ref={dialog} className="activity-dialog" aria-labelledby="activity-title" onClose={onClose}>
    <div className="activity-dialog-heading">
      <div>
        <p className="small"><time dateTime={activity.date}>{period}</time> · {provider}</p>
        <h2 id="activity-title">{activity.name ?? "Sortie à pied"}</h2>
      </div>
      <form method="dialog"><button>Fermer</button></form>
    </div>
    <dl className="activity-metrics">
      <div><dt>Distance</dt><dd>{number(activity.distance)} km</dd></div>
      <div><dt>Durée</dt><dd>{formatDuration(activity.minutes)}</dd></div>
      <div><dt>Allure moyenne</dt><dd>{formatPace(activity.minutes / activity.distance)} min/km</dd></div>
      <div><dt>Dénivelé positif</dt><dd>{number(activity.elevation)} m</dd></div>
    </dl>
    <h3>Tracé GPS</h3>
    {points.length ? <RouteMap points={points}/> : <>
      <p role="status">{message || (source && !manualTrack ? "Chargement du tracé…" : "Ajoute un GPX ou TCX pour afficher le parcours de cette course.")}</p>
      <label className="file-button route-file-button">Ouvrir un fichier GPX ou TCX<input
        type="file" accept=".gpx,.tcx,application/gpx+xml,application/xml"
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void loadFile(file);
        }}/></label>
    </>}
  </dialog>;
}
