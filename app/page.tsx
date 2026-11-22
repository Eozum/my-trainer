"use client";

import Coach from "./components/coach";
import Garmin from "./components/garmin";
import Statistics from "./components/statistics";
import {useEffect, useState, type FormEvent} from "react";
import {addDays, day, defaultRace, stateSchema, type Race, type State} from "@/lib/model";
import {generate} from "@/lib/planner";
import {importActivities, restoreState, STORAGE_KEY} from "@/lib/local-state";

const freshState = (): State => ({planStart: day(), race: defaultRace, activities: [], sessions: []});
const format = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {day: "numeric", month: "short"});

const stravaResults: Record<string, string> = {
  denied: "Tu as annulé l’autorisation sur Strava. Tu peux réessayer.",
  expired: "La demande de connexion a expiré ou a été remplacée. Relance-la depuis cet onglet.",
  scope: "Autorise la lecture de toutes tes activités sur Strava, y compris les activités privées, pour activer l’import.",
  error: "La connexion a échoué. Si tu utilises ta propre application Strava, vérifie le Client ID, le Client Secret et le domaine de rappel.",
};

export default function Home() {
  const [state, setState] = useState<State>(freshState);
  const [draft, setDraft] = useState<Race>(defaultRace);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [stravaStatus, setStravaStatus] = useState<{defaultConfigured: boolean; callbackDomain?: string; error?: string} | null>(null);
  const [showStravaSetup, setShowStravaSetup] = useState(false);
  const [stravaMessage, setStravaMessage] = useState("");
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
    const result = params.get("strava");
    if (result !== null) {
      params.delete("strava");
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size ? `?${params}` : ""}#strava`);
      if (result !== "connected") {
        setStravaMessage(Object.hasOwn(stravaResults, result) ? stravaResults[result] : stravaResults.error);
      }
    }

    fetch("/api/strava/status", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw Error();
      const data = await response.json();
      setStravaStatus(data);
      setConnected(data.connected === true);
      if (result === "connected") {
        setStravaMessage(data.connected
          ? "Strava est connecté. Tu peux importer tes sorties."
          : "La connexion Strava n’a pas été enregistrée. Vérifie que ton navigateur accepte les cookies puis réessaie.");
      }
    }).catch(() => {
      setStravaStatus({ defaultConfigured: false, callbackDomain: window.location.hostname });
      setStravaMessage("Le statut de Strava est indisponible. Recharge la page ou réessaie la connexion.");
    });
    setReady(true);
  }, []);

  useEffect(() => {
    const navigate = () => setView(window.location.hash === "#statistiques" ? "statistiques" : "programme");
    navigate();
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);

  useEffect(() => {
    if (ready && window.location.hash === "#strava") document.getElementById("strava")?.focus();
  }, [ready]);

  function save(next: State) {
    const checked = stateSchema.parse(next);
    // Write first: never announce a saved plan when storage is full or unavailable.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
    setState(checked);
  }

  function build() {
    try {
      const next = {...state, coachPlanId: undefined, race: draft, planStart: JSON.stringify(draft) === JSON.stringify(state.race)
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

  async function strava(action: "connect" | "sync" | "disconnect", form?: HTMLFormElement) {
    setBusy(true);
    setStravaMessage("");
    try {
      const options: RequestInit = { method: "POST" };
      if (form) {
        const fields = new FormData(form);
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify({ clientId: fields.get("clientId"), clientSecret: fields.get("clientSecret") });
      }
      const response = await fetch(`/api/strava/${action}`, options).catch(() => null);
      const data = await response?.json().catch(() => null);
      if (!response?.ok || !data) {
        if (data?.setupRequired) setShowStravaSetup(true);
        throw Error(data?.error ?? "Impossible de joindre le service Strava. Réessaie.");
      }
      if (action === "connect") {
        form?.reset();
        window.location.assign(data.url);
        return;
      }
      if (action === "sync") {
        save(importActivities(state, data.activities));
        setStravaMessage("Sorties importées depuis Strava. Vérifie les correspondances avec les séances du même jour.");
      } else {
        setConnected(false);
        setShowStravaSetup(false);
        setStravaMessage("Strava est déconnecté de ce navigateur. Tu peux aussi révoquer l’accès dans les paramètres Strava.");
      }
    } catch (error) {
      setStravaMessage(error instanceof Error ? error.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  }

  function connectStrava() {
    if (stravaStatus?.defaultConfigured) void strava("connect");
    else setShowStravaSetup(true);
  }

  function submitStravaSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void strava("connect", event.currentTarget);
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
    </aside>
    <main id="main-content" className="notebook">
    <header className="masthead"><span>{view === "statistiques" ? "Mes sorties en chiffres" : "Mon entraînement"}</span><span className="storage-note">Enregistré sur cet appareil</span></header>
    {message && <div className="notice" role="status"><span>{message}</span><button aria-label="Fermer le message" onClick={() => setMessage("")}>×</button></div>}

    {view === "statistiques" ? <Statistics activities={state.activities}/> : <div id="programme">
    <section className="goal" aria-labelledby="goal-title">
      <p className="eyebrow">Course prévue</p>
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
      <div className="sessions">{sessions.map(session => <article className="session" data-status={session.status} key={session.id}>
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
      <details className="adjustments"><summary>Comprendre le programme</summary>{plan.reasons.map(reason => <p key={reason}>{reason}</p>)}<p>Ces repères ne tiennent pas compte des blessures ni de ton état de santé.</p></details>
    </section>

    <Coach state={state} disabled={busy} onBusy={setBusy} onState={next => {
      setState(next); setDraft(next.race); setWeek(0);
      try {localStorage.setItem(STORAGE_KEY, JSON.stringify(next));}
      catch {setMessage("Le programme est sauvegardé sur le serveur, mais le stockage local est indisponible.");}
    }}/>

    <section className="history" aria-labelledby="history-title">
      <div className="section-heading"><h2 id="history-title">Mes sorties</h2><span className="muted">{state.activities.length} {state.activities.length === 1 ? "enregistrée" : "enregistrées"}</span></div>
      <p>Importer des activités pour recalculer le programme.</p>
      <div id="strava" tabIndex={-1}>
        <div className="import-actions">
          {connected ? <>
            <button className="primary strava-button" disabled={busy} onClick={() => strava("sync")}>{busy ? "Patiente…" : "Importer depuis Strava"}</button>
            <button disabled={busy} onClick={() => strava("disconnect")}>Déconnecter Strava</button>
          </> : <>
            <button className="primary strava-button" disabled={busy || !stravaStatus || !!stravaStatus.error} onClick={connectStrava}>
              Connect with Strava
            </button>
            {stravaStatus?.defaultConfigured && !stravaStatus.error && <button disabled={busy} aria-expanded={showStravaSetup} onClick={() => setShowStravaSetup(!showStravaSetup)}>
              {showStravaSetup ? "Masquer le formulaire Strava" : "Utiliser ma propre application Strava"}
            </button>}
          </>}
          <label className="file-button">Importer un fichier JSON<input type="file" accept="application/json,.json" disabled={busy} onChange={event => {const file = event.target.files?.[0]; event.target.value = ""; void importFile(file);}}/></label>
        </div>
        {stravaStatus?.error && <p className="small" role="status">{stravaStatus.error}</p>}
        {!connected && showStravaSetup && <form method="post" onSubmit={submitStravaSetup} aria-labelledby="strava-setup-title">
          <h3 id="strava-setup-title">Configurer ma connexion Strava</h3>
          <p className="small">Crée ou ouvre <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer">ton application dans les paramètres Strava</a>. Indique <code>{stravaStatus?.callbackDomain}</code> comme domaine de rappel, puis copie les identifiants ci-dessous.</p>
          <div className="fields">
            <label>Client ID<input required name="clientId" inputMode="numeric" pattern="[0-9]+" maxLength={20}/></label>
            <label>Client Secret<input required name="clientSecret" type="password" maxLength={256} autoComplete="off"/></label>
          </div>
          <button className="primary strava-button" disabled={busy}>{busy ? "Patiente…" : "Autoriser sur Strava"}</button>
        </form>}
        {stravaMessage && <p role="status" className="notice">{stravaMessage}</p>}
      </div>
      <p className="small">Strava : courses des 90 derniers jours, à la demande. Aucun envoi à une IA. <a href="/example-activities.json" download>Exemple de fichier JSON</a></p>
      <Garmin busy={busy} onBusy={setBusy} onImport={activities => save(importActivities(state, activities))}/>
      <details><summary>Voir les dernières sorties</summary>{state.activities.length ? <ul className="activity-list">{state.activities.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(activity => <li key={activity.id}><time dateTime={activity.date}>{format(activity.date)}</time><span>{activity.distance.toFixed(1)} km</span><span>{Math.round(activity.minutes)} min</span><span>{Math.round(activity.elevation)} m D+</span></li>)}</ul> : <p>Aucune sortie importée pour le moment.</p>}</details>
    </section>
    </div>}
    <footer>Ton carnet est conservé dans ce navigateur. Le carnet privé permet aussi une sauvegarde manuelle en ligne. Effacer les données du navigateur efface la copie locale et peut déconnecter Strava.</footer>
  </main></div>;
}
