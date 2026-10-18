"use client";

import {useState} from "react";
import {day, type Activity} from "@/lib/model";
import {formatDuration, formatPace, statistics, type Period} from "@/lib/statistics";

const number = (value: number) => value.toLocaleString("fr-FR", {maximumFractionDigits: 1});
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {day: "numeric", month: "short", year: "numeric"});

export default function Statistics({activities}: {activities: Activity[]}) {
  const [period, setPeriod] = useState<Period>("30");
  const stats = statistics(activities, period, day());
  return <section id="statistiques" className="statistics" aria-labelledby="statistics-title">
    <p className="eyebrow">Au fil des sorties</p>
    <h1 id="statistics-title">Mes statistiques</h1>
    <div className="statistics-heading"><p>Un regard sur tes courses réalisées.</p><label className="period-select">Période<select value={period} onChange={event => setPeriod(event.target.value as Period)}><option value="7">7 derniers jours</option><option value="30">30 derniers jours</option><option value="all">Tout l’historique</option></select></label></div>
    <p className="small">Calculé sur les activités importées, jusqu’à aujourd’hui. Les séances prévues ne sont pas comptées.</p>
    <dl className="stats-grid" aria-live="polite">
      <div><dt>Distance totale</dt><dd>{number(stats.distance)} <span>km</span></dd></div>
      <div><dt>Courses réalisées</dt><dd>{stats.count}</dd></div>
      <div><dt>Distance moyenne</dt><dd>{stats.averageDistance === null ? "—" : number(stats.averageDistance)} <span>km / sortie</span></dd></div>
      <div><dt>Allure moyenne</dt><dd>{formatPace(stats.pace)} <span>min / km</span></dd></div>
    </dl>
    <p className="stats-extra">{formatDuration(stats.minutes)} de course · {number(stats.elevation)} m de dénivelé positif</p>
    <p className="small">L’allure moyenne correspond à la durée cumulée divisée par la distance totale.</p>
    <section className="recent-runs" aria-labelledby="recent-title">
      <div className="section-heading"><h2 id="recent-title">Dernières courses</h2><span className="small">Les 20 dernières de la période</span></div>
      {!stats.count ? <div className="empty"><p>{activities.length ? "Aucune course sur cette période. Essaie une autre période." : "Tes statistiques commencent avec ta première sortie."}</p><a href="#programme">Importer mes sorties depuis le programme</a></div> : <div className="runs-table-wrap"><table className="runs-table"><caption className="sr-only">Courses réalisées pendant la période sélectionnée, de la plus récente à la plus ancienne</caption><thead><tr><th scope="col">Course</th><th scope="col">Distance</th><th scope="col">Durée</th><th scope="col">Allure</th><th scope="col">D+</th></tr></thead><tbody>{stats.activities.slice(0, 20).map(activity => <tr key={activity.id}><th scope="row">{activity.name ?? "Sortie à pied"}<time dateTime={activity.date}>{date(activity.date)}</time></th><td>{number(activity.distance)} km</td><td>{formatDuration(activity.minutes)}</td><td>{formatPace(activity.minutes / activity.distance)} <span className="small">/ km</span></td><td>{number(activity.elevation)} m</td></tr>)}</tbody></table></div>}
    </section>
  </section>;
}
