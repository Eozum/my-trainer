import { activityBuckets, formatPace } from "@/lib/statistics";

type Bucket = ReturnType<typeof activityBuckets>[number];
const shortDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", {day: "numeric", month: "short", timeZone: "UTC"});
const number = (value: number) => value.toLocaleString("fr-FR", {maximumFractionDigits: 1});
const range = ({ start, end }: Bucket) => start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`;

function Chart({ buckets, metric, title, unit }: {
  buckets: Bucket[];
  metric: "distance" | "elevation" | "pace";
  title: string;
  unit: string;
}) {
  const pace = metric === "pace";
  const values = buckets.flatMap(bucket => bucket[metric] === null ? [] : [bucket[metric]!]);
  const low = pace ? Math.max(0, Math.floor(Math.min(...values) - .5)) : 0;
  const high = Math.max(low + 1, Math.ceil(Math.max(...values) + (pace ? .5 : 0)));
  const format = pace ? formatPace : number;
  const width = 392, left = 49, right = 14, top = 16, bottom = 123;
  const step = (width - left - right) / buckets.length;
  const x = (index: number) => left + (index + .5) * step;
  const y = (value: number) => pace
    ? top + (value - low) * (bottom - top) / (high - low)
    : bottom - value * (bottom - top) / high;
  const plot = buckets.flatMap((bucket, index) => bucket[metric] === null ? [] : [{ x: x(index), y: y(bucket[metric]!), value: bucket[metric]!, label: range(bucket) }]);
  const ticks = [low, (low + high) / 2, high];
  const captions = [...new Set([0, Math.floor((buckets.length - 1) / 2), buckets.length - 1])];

  return <figure className={`activity-chart activity-chart-${metric}`}>
    <figcaption>{title} <span>{unit}</span></figcaption>
    <svg viewBox={`0 0 ${width} 151`} aria-hidden="true">
      {ticks.map(value => <g key={value}>
        <line x1={left} y1={y(value)} x2={width - right} y2={y(value)} className="chart-grid"/>
        <text x={left - 7} y={y(value) + 3} textAnchor="end">{format(value)}</text>
      </g>)}
      {pace && <polyline points={plot.map(point => `${point.x},${point.y}`).join(" ")} className="chart-line"/>}
      {plot.map((point, index) => pace
        ? <circle key={index} cx={point.x} cy={point.y} r="3.7" className="chart-mark"><title>{point.label} · {format(point.value)} {unit}</title></circle>
        : <rect key={index} x={point.x - Math.min(step * .3, 28)} y={point.y}
          width={Math.min(step * .6, 56)} height={bottom - point.y} rx="2" className="chart-mark">
          <title>{point.label} · {format(point.value)} {unit}</title>
        </rect>)}
      {captions.map((index, i) => <text key={index}
        x={captions.length === 1 ? x(index) : i === 0 ? left : i === captions.length - 1 ? width - right : x(index)}
        y="143" textAnchor={captions.length === 1 ? "middle" : i === 0 ? "start" : i === captions.length - 1 ? "end" : "middle"}>
        {shortDate(buckets[index].start)}
      </text>)}
    </svg>
  </figure>;
}

export default function ActivityCharts({ buckets }: { buckets: Bucket[] }) {
  if (!buckets.length) return null;
  return <section aria-labelledby="trends-title" className="activity-trends">
    <h2 id="trends-title">Évolution</h2>
    <div className="activity-charts">
      <Chart buckets={buckets} metric="distance" title="Distance" unit="km"/>
      <Chart buckets={buckets} metric="elevation" title="Dénivelé positif" unit="m"/>
      <Chart buckets={buckets} metric="pace" title="Allure moyenne" unit="min/km"/>
    </div>
    <details className="chart-data"><summary>Voir les données des graphiques</summary>
      <div className="runs-table-wrap"><table className="runs-table">
        <caption className="sr-only">Valeurs des graphiques par intervalle</caption>
        <thead><tr><th scope="col">Période</th><th scope="col">Distance (km)</th><th scope="col">D+ (m)</th><th scope="col">Allure (min/km)</th></tr></thead>
        <tbody>{buckets.map(bucket => <tr key={bucket.start}><th scope="row">{range(bucket)}</th><td>{number(bucket.distance)}</td><td>{number(bucket.elevation)}</td><td>{formatPace(bucket.pace)}</td></tr>)}</tbody>
      </table></div>
    </details>
  </section>;
}
