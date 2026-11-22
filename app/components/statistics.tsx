"use client";

import { useState } from "react";
import { day, type Activity } from "@/lib/model";
import { activityBuckets, formatDuration, formatPace, statistics, type Period } from "@/lib/statistics";
import ActivityCharts from "./activity-charts";
import ActivityDetail from "./activity-detail";

const number = (value: number) => value.toLocaleString("fr-FR", {maximumFractionDigits: 1});
const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("fr-FR", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"});
const pageSize = 12;

export default function Statistics({ activities }: { activities: Activity[] }) {
  const [period, setPeriod] = useState<Period>("30");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Activity | null>(null);
  const today = day();
  const stats = statistics(activities, period, today);
  const pageCount = Math.max(1, Math.ceil(stats.count / pageSize));
  const current = Math.min(page, pageCount - 1);
  const runs = stats.activities.slice(current * pageSize, (current + 1) * pageSize);

  return <section id="statistiques" className="statistics" aria-labelledby="statistics-title">
    <h1 id="statistics-title">Mes statistiques</h1>
    <div className="statistics-heading">
      <p>Distance, durée et allure des courses réalisées.</p>
      <label className="period-select">Période<select value={period} onChange={event => { setPeriod(event.target.value as Period); setPage(0); }}>
        <option value="7">7 derniers jours</option><option value="30">30 derniers jours</option><option value="all">Tout l’historique</option>
      </select></label>
    </div>
    <dl className="stats-grid" aria-live="polite">
      <div><dt>Distance totale</dt><dd>{number(stats.distance)} <span>km</span></dd></div>
      <div><dt>Courses réalisées</dt><dd>{stats.count}</dd></div>
      <div><dt>Distance moyenne</dt><dd>{stats.averageDistance === null ? "—" : number(stats.averageDistance)} <span>km / sortie</span></dd></div>
      <div><dt>Allure moyenne</dt><dd>{formatPace(stats.pace)} <span>min / km</span></dd></div>
    </dl>
    <p className="stats-extra">{formatDuration(stats.minutes)} de course · {number(stats.elevation)} m de dénivelé positif</p>
    <ActivityCharts buckets={activityBuckets(stats.activities, period, today)}/>
    <section className="recent-runs" aria-labelledby="recent-title">
      <div className="section-heading"><h2 id="recent-title">Courses</h2>
        {stats.count > 0 && <span className="small">{stats.count} {stats.count === 1 ? "sortie" : "sorties"}</span>}
      </div>
      {stats.count === 0 ? <div className="empty">
        <p>{activities.length ? "Aucune course sur cette période. Essaie une autre période." : "Aucune activité importée."}</p>
        <a href="#programme">Importer mes sorties depuis le programme</a>
      </div> : <>
        <div className="runs-table-wrap"><table className="runs-table">
          <caption className="sr-only">Courses réalisées pendant la période sélectionnée, de la plus récente à la plus ancienne</caption>
          <thead><tr><th scope="col">Course</th><th scope="col">Distance</th><th scope="col">Durée</th><th scope="col">Allure</th><th scope="col">D+</th></tr></thead>
          <tbody>{runs.map(activity => <tr key={activity.id}>
            <th scope="row">
              <button className="run-detail-button" type="button" onClick={() => setSelected(activity)}>
                {activity.name ?? "Sortie à pied"}
                <span className="sr-only"> · Voir le détail du {date(activity.date)}</span>
              </button>
              <time dateTime={activity.date}>{date(activity.date)}</time>
            </th>
            <td>{number(activity.distance)} km</td><td>{formatDuration(activity.minutes)}</td>
            <td>{formatPace(activity.minutes / activity.distance)} <span className="small">/ km</span></td><td>{number(activity.elevation)} m</td>
          </tr>)}</tbody>
        </table></div>
        {pageCount > 1 && <nav className="pager activity-pager" aria-label="Pages des courses">
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>Précédente</button>
          <span aria-live="polite">Page {current + 1} sur {pageCount}</span>
          <button disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)}>Suivante</button>
        </nav>}
      </>}
    </section>
    {selected && <ActivityDetail key={selected.id} activity={selected} onClose={() => setSelected(null)}/>}
  </section>;
}
