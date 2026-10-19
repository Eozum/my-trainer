"use client";

import {useEffect, useRef, useState} from "react";
import {stateSchema, type State} from "@/lib/model";

type Proposal = {id: string; explanation: string; sessions: {date: string; kind: string; km: number; minutes: number; note: string}[]};
type Props = {state: State; disabled: boolean; onBusy: (busy: boolean) => void; onState: (state: State) => void};

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/coach/${path}`, {
    method, ...(body === undefined ? {} : {headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)}),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error ?? "Service indisponible.");
  return data;
}

export default function Coach({state, disabled, onBusy, onState}: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [key, setKey] = useState("");
  const [revision, setRevision] = useState<number | null>(null);
  const [backup, setBackup] = useState<State | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const current = useRef(state);
  const proposalSource = useRef("");
  current.current = state;

  useEffect(() => {
    let active = true;
    request("access").then(() => request("state")).then(data => {
      if (active) {setUnlocked(true); setRevision(data.revision); setBackup(data.data ? stateSchema.parse(data.data) : null);}
    }).catch(() => {});
    return () => {active = false;};
  }, []);

  useEffect(() => {setProposal(null);}, [state]);

  async function load() {
    const data = await request("state");
    setRevision(data.revision);
    setBackup(data.data ? stateSchema.parse(data.data) : null);
    return data;
  }

  async function run(operation: () => Promise<void>) {
    setPending(true); onBusy(true); setMessage("");
    try {await operation();}
    catch (error) {setMessage(error instanceof Error ? error.message : "Opération impossible.");}
    finally {setPending(false); onBusy(false);}
  }
  const busy = pending || disabled;

  return <section className="coach-tools" aria-labelledby="adapt-title">
    <h2 id="adapt-title">Adapter mes prochaines séances</h2>
    <p>Une proposition pour les 14 prochains jours, à vérifier avant de l’appliquer.</p>
    {!unlocked ? <details><summary>Ouvrir mon carnet privé</summary>
      <p className="small">Utilise la clé privée définie pour ton installation EoTrainer. Aucun compte à créer. Le programme local reste disponible sans elle.</p>
      <form className="coach-unlock" onSubmit={event => {event.preventDefault(); void run(async () => {
        await request("access", "POST", {key}); setKey(""); setUnlocked(true); await load();
      });}}><label>Clé privée<input type="password" required autoComplete="off" value={key} maxLength={256} onChange={event => setKey(event.target.value)}/></label><button disabled={busy || !key} className="primary">Déverrouiller</button></form>
    </details> : <>
      <p className="small">{revision === null ? "Chargement de la sauvegarde nécessaire." : revision ? "Sauvegarde en ligne disponible." : "Aucune sauvegarde serveur pour le moment."} Les modifications locales ne sont pas envoyées automatiquement.</p>
      <div className="coach-actions">
        <button disabled={busy} onClick={() => void run(async () => {setProposal(null); await load(); setMessage("Sauvegarde serveur actualisée. Tu peux la charger ou sauvegarder ce carnet.");})}>Vérifier la sauvegarde</button>
        {backup && <button disabled={busy} onClick={() => {onState(backup); setMessage("Sauvegarde serveur chargée sur cet appareil.");}}>Charger la sauvegarde serveur</button>}
        <button disabled={busy || revision === null} onClick={() => void run(async () => {
          const snapshot = current.current;
          const data = await request("state", "PUT", {state: snapshot, revision});
          setRevision(data.revision); setBackup(snapshot); setProposal(null);
          setMessage("Ce carnet est sauvegardé en ligne.");
        })}>Sauvegarder ce carnet</button>
        <button disabled={busy} onClick={() => void run(async () => {await request("access", "DELETE"); setUnlocked(false); setRevision(null); setBackup(null); setProposal(null);})}>Verrouiller</button>
      </div>
      <p className="small">L’adaptation sauvegarde d’abord ce carnet en ligne, puis envoie à OpenAI l’objectif et un résumé des sorties hors Strava. Les imports identifiés Strava, les noms de courses et les notes ne sont pas envoyés. Les jours restent fixes et le volume ne peut pas dépasser la référence calculée.</p>
      <button className="primary" disabled={busy || revision === null} onClick={() => void run(async () => {
        setProposal(null);
        const snapshot = current.current;
        const fingerprint = JSON.stringify(snapshot);
        const saved = await request("state", "PUT", {state: snapshot, revision});
        setRevision(saved.revision); setBackup(snapshot);
        const result = await request("propose", "POST", {revision: saved.revision});
        if (JSON.stringify(current.current) !== fingerprint) throw Error("Ton carnet local a changé pendant la génération. Demande une nouvelle proposition.");
        proposalSource.current = fingerprint; setProposal(result);
        setMessage("Proposition prête. Aucune séance n’a encore été remplacée.");
      })}>{pending ? "Patiente…" : "Proposer une adaptation avec OpenAI"}</button>
      {proposal && <div className="coach-proposal">
        <h3>Proposition à vérifier</h3><p>{proposal.explanation}</p>
        <ul>{proposal.sessions.map(session => <li key={session.date}><strong>{new Date(`${session.date}T12:00:00`).toLocaleDateString("fr-FR")} · {session.kind}</strong><span>{session.km} km · {session.minutes} min</span><p>{session.note}</p></li>)}</ul>
        <p className="small">L’IA peut se tromper. En cas de douleur ou de problème de santé, adapte ton activité avec un professionnel. La proposition expire à la fin de la journée UTC.</p>
        <div className="coach-actions"><button className="primary" disabled={busy} onClick={() => void run(async () => {
          if (JSON.stringify(current.current) !== proposalSource.current) {setProposal(null); throw Error("Le carnet a changé. Demande une nouvelle proposition.");}
          const result = await request("apply", "POST", {id: proposal.id});
          const next = stateSchema.parse(result.data);
          onState(next); setRevision(result.revision); setBackup(next); setProposal(null);
          setMessage("Programme appliqué et sauvegardé en ligne.");
        })}>Appliquer ce programme</button><button disabled={busy} onClick={() => setProposal(null)}>Garder mon programme actuel</button></div>
      </div>}
    </>}
    {message && <p className="coach-message" role="status">{message}</p>}
  </section>;
}
