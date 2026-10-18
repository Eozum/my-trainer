"use client";

import Statistics from "./components/statistics";
import {useEffect, useState} from "react";
import {addDays, day, defaultRace, stateSchema, type Race, type State} from "@/lib/model";
import {generate} from "@/lib/planner";
import {importActivities, restoreState, STORAGE_KEY} from "@/lib/local-state";

const freshState = (): State => ({planStart: day(), race: defaultRace, activities: [], sessions: []});
const format = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {day: "numeric", month: "short"});

export default function Home() {
  const [state, setState] = useState<State>(freshState);
  const [draft, setDraft] = useState<Race>(defaultRace);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState("programme");
  const [week, setWeek] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = restoreState(raw);
        setState(saved);
        setDraft(saved.race);
      }
    } catch {
      setMessage("La sauvegarde locale est indisponible ou illisible. Elle n’a pas été remplacée.");
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has("strava")) {
      setMessage(params.get("strava") === "connected"
        ? "Strava est connecté. Tu peux importer tes sorties."
        : "La connexion Strava n’a pas abouti. Tu peux réessayer.");
      params.delete("strava");
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    }
    fetch("/api/strava/status").then(r => r.ok ? r.json() : null)
      .then(data => setConnected(data?.connected === true)).catch(() => {});
    setReady(true);
  }, []);

  useEffect(() => {
    const navigate = () => setView(window.location.hash === "#statistiques" ? "statistiques" : "programme");
    navigate();
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);

  function save(next: State) {
    const checked = stateSchema.parse(next);
    // Write first: never announce a saved plan when storage is full or unavailable.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
    setState(checked);
  }

  function build() {
    try {
      const next = {...state, race: draft, planStart: JSON.stringify(draft) === JSON.stringify(state.race)
        ? state.planStart ?? day() : day()};
      save({...next, sessions: generate(next).sessions});
      setWeek(0);
      setMessage("Ton programme est enregistré.");
    } catch {
      setMessage("Vérifie la date et les valeurs de ta course, ainsi que l’espace disponible dans ton navigateur.");
    }
  }

  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 400000) throw Error("Le fichier dépasse 400 Ko.");
      save(importActivities(state, JSON.parse(await file.text())));
      setMessage("Sorties importées. Vérifie les séances marquées réalisées le même jour.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import impossible.");
    } finally {setBusy(false);}
  }

  async function strava(action: "connect" | "sync" | "disconnect") {
    setBusy(true);
    try {
      const response = await fetch(`/api/strava/${action}`, {method: "POST"});
      const data = await response.json();
      if (!response.ok) throw Error(data.error ?? "Strava est indisponible.");
      if (action === "connect") {window.location.assign(data.url); return;}
      if (action === "sync") {
        save(importActivities(state, data.activities));
        setMessage("Sorties importées depuis Strava. Vérifie les correspondances avec les séances du même jour.");
      } else {
        setConnected(false);
        setMessage("Strava déconnecté de cet appareil. Tu peux aussi révoquer l’accès dans les paramètres Strava.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opération impossible.");
    } finally {setBusy(false);}
  }

  function field<K extends keyof Race>(key: K, value: Race[K]) {setDraft({...draft, [key]: value});}
  const plan = (() => {
    try {return generate(state);}
    catch {return {sessions: state.sessions, reasons: ["La date de ta course est passée. Choisis un nouvel objectif."], base: 0};}
  })();
  const start = addDays(day(), week * 7);
  const sessions = plan.sessions.filter(session => session.date >= start && session.date < addDays(start, 7));
  const distance = sessions.reduce((sum, session) => sum + session.km, 0);

  if (!ready) return <main className="loading" aria-busy="true">Chargement…</main>;
  return <div className="app-layout">
    <a href="#main-content" className="skip-link">Aller au contenu</a>
    <aside className="sidebar">
      <a href="#programme" className="brand">EoTrainer<span>Mon carnet de course</span></a>
      <nav aria-label="Navigation principale">
        <a href="#programme" aria-current={view === "programme" ? "page" : undefined}><span aria-hidden="true">☷</span> Mon programme</a>
        <a href="#statistiques" aria-current={view === "statistiques" ? "page" : undefined}><span aria-hidden="true">▥</span> Statistiques</a>
      </nav>
      <p className="sidebar-note">Une sortie après l’autre.</p>
    </aside>
    <main id="main-content" className="notebook">
    <header className="masthead"><span>{view === "statistiques" ? "Mes sorties en chiffres" : "Mon entraînement"}</span><span className="storage-note">Enregistré sur cet appareil</span></header>
    {message && <div className="notice" role="status"><span>{message}</span><button aria-label="Fermer le message" onClick={() => setMessage("")}>×</button></div>}

    {view === "statistiques" ? <Statistics activities={state.activities}/> : <div id="programme">
    <section className="goal" aria-labelledby="goal-title">
      <p className="eyebrow">Le prochain départ</p>
      <h1 id="goal-title">{state.race.name}</h1>
      <p>{format(state.race.date)} · {state.race.distance} km · {state.race.elevation} m D+</p>
      <details className="goal-editor"><summary>Modifier ma course</summary>
        <form onSubmit={event => {event.preventDefault(); build();}}>
          <div className="fields">
            <label className="wide">Nom de la course<input required maxLength={80} value={draft.name} onChange={e => field("name", e.target.value)}/></label>
            <label>Date<input required type="date" min={addDays(day(), 1)} max={addDays(day(), 365)} value={draft.date} onChange={e => field("date", e.target.value)}/></label>
            <label>Terrain<select value={draft.terrain} onChange={e => field("terrain", e.target.value as Race["terrain"])}><option value="trail">Trail</option><option value="urban">Urban trail</option><option value="route">Route</option></select></label>
            <label>Distance (km)<input required type="number" min="3" max="100" step="0.1" value={draft.distance} onChange={e => field("distance", +e.target.value)}/></label>
            <label>Dénivelé positif (m)<input required type="number" min="0" max="10000" value={draft.elevation} onChange={e => field("elevation", +e.target.value)}/></label>
            <label>Objectif<select value={draft.goal} onChange={e => field("goal", e.target.value as Race["goal"])}><option value="finish">Finir</option><option value="progress">Progresser</option><option value="time">Viser un chrono</option></select></label>
            <label>Temps estimé (min)<input required type="number" min="10" max="1800" value={draft.targetMinutes} onChange={e => field("targetMinutes", +e.target.value)}/></label>
            <label>Volume habituel (km/semaine)<input required type="number" min="5" max="150" value={draft.weeklyKm} onChange={e => field("weeklyKm", +e.target.value)}/></label>
            <label>Sorties par semaine<select value={draft.days} onChange={e => field("days", +e.target.value)}>{[2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>
          </div>
          <button className="primary" disabled={busy}>Enregistrer et adapter le programme</button>
        </form>
      </details>
    </section>

    <section className="week" aria-labelledby="week-title">
      <div className="section-heading"><h2 id="week-title">{week === 0 ? "Cette semaine" : "La suite"}</h2><div className="pager"><button disabled={week === 0} aria-label="Semaine précédente" onClick={() => setWeek(week - 1)}>←</button><span>{format(start)} – {format(addDays(start, 6))}</span><button disabled={addDays(start, 7) > state.race.date} aria-label="Semaine suivante" onClick={() => setWeek(week + 1)}>→</button></div></div>
      <p className="muted">{sessions.length} sorties · {distance.toFixed(1)} km prévus</p>
      <div className="sessions">{sessions.map(session => <article className="session" key={session.id}>
        <time dateTime={session.date}>{new Date(`${session.date}T12:00:00`).toLocaleDateString("fr-FR", {weekday: "short", day: "numeric"})}</time>
        <div className="session-copy"><h3>{session.kind}</h3><p>{session.km} km · {session.minutes} min{session.elevation > 0 && ` · ${session.elevation} m D+`}</p><details><summary>Détail de la séance</summary><p>{session.note}</p></details></div>
        <select aria-label={`Statut du ${format(session.date)}`} disabled={busy} value={session.status} onChange={event => {
          try {
            const next = {...state, sessions: plan.sessions.map(s => s.id === session.id ? {...s, status: event.target.value as typeof s.status} : s)};
            save({...next, sessions: generate(next).sessions});
          } catch {setMessage("Modification impossible. Vérifie la sauvegarde du navigateur.");}
        }}><option value="planned">À venir</option>{session.date <= day() && <option value="done">Réalisée</option>}<option value="missed">Manquée</option></select>
      </article>)}</div>
      {!sessions.length && <p className="empty">Pas de séance prévue. Modifie ta course pour préparer la suite.</p>}
      <p className="rest">Entre les sorties, place à la récupération.</p>
      <details className="adjustments"><summary>Comprendre le programme</summary>{plan.reasons.map(reason => <p key={reason}>{reason}</p>)}<p>Ces repères ne tiennent pas compte des blessures ni de ton état de santé.</p></details>
    </section>

    <section className="history" aria-labelledby="history-title">
      <div className="section-heading"><h2 id="history-title">Mes sorties</h2><span className="muted">{state.activities.length} {state.activities.length === 1 ? "enregistrée" : "enregistrées"}</span></div>
      <p>Importe tes courses pour ajuster le programme à ce que tu fais vraiment.</p>
      <div className="import-actions">{connected ? <><button className="primary strava-button" disabled={busy} onClick={() => strava("sync")}>{busy ? "Patiente…" : "Importer depuis Strava"}</button><button disabled={busy} onClick={() => strava("disconnect")}>Déconnecter Strava</button></> : <button className="primary strava-button" disabled={busy} onClick={() => strava("connect")}>Connect with Strava</button>}
        <label className="file-button">Importer un fichier JSON<input type="file" accept="application/json,.json" disabled={busy} onChange={event => {const file = event.target.files?.[0]; event.target.value = ""; void importFile(file);}}/></label>
      </div>
      <p className="small">Strava : courses des 90 derniers jours, à la demande. Aucun envoi à une IA. <a href="/example-activities.json" download>Exemple de fichier JSON</a></p>
      <details><summary>Voir les dernières sorties</summary>{state.activities.length ? <ul className="activity-list">{state.activities.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(activity => <li key={activity.id}><time dateTime={activity.date}>{format(activity.date)}</time><span>{activity.distance.toFixed(1)} km</span><span>{Math.round(activity.minutes)} min</span><span>{Math.round(activity.elevation)} m D+</span></li>)}</ul> : <p>Aucune sortie importée pour le moment.</p>}</details>
    </section>
    </div>}
    <footer>Ton carnet reste dans ce navigateur. Il n’est pas synchronisé entre appareils. Effacer les données du navigateur efface le carnet et peut déconnecter Strava.</footer>
  </main></div>;
}
