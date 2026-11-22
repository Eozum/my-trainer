"use client";

import { useEffect, useState, type FormEvent } from "react";

type Status = { connected: boolean; error: string | null };
type Props = {
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onImport: (activities: unknown) => void;
};

export default function Garmin({ busy, onBusy, onImport }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/garmin", { cache: "no-store", signal: controller.signal })
      .then(response => {
        if (!response.ok) throw Error();
        return response.json();
      })
      .then(setStatus)
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus({ connected: false, error: "Le statut Garmin est indisponible. Recharge la page pour réessayer." });
        }
      });
    return () => controller.abort();
  }, []);

  async function request(action: "connect" | "import" | "disconnect", form?: HTMLFormElement) {
    onBusy(true);
    setMessage("");
    try {
      const options: RequestInit = { method: action === "disconnect" ? "DELETE" : "POST" };
      if (form) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify({ key: new FormData(form).get("key") });
      }
      const response = await fetch(action === "import" ? "/api/garmin/sync" : "/api/garmin", options).catch(() => null);
      const data = await response?.json().catch(() => null);
      if (!response?.ok || !data) {
        if (action === "import" && response?.status === 401) setShowSetup(true);
        if (action === "import" && response?.status === 409) {
          setStatus({ connected: false, error: null });
          setShowSetup(true);
        }
        throw Error(data?.error ?? "Impossible de joindre MyTrainer. Réessaie.");
      }
      if (action === "import") {
        if (Array.isArray(data.activities) && data.activities.length === 0) {
          setMessage("Aucune sortie de course à pied dans Garmin Connect sur les 90 derniers jours.");
          return;
        }
        onImport(data.activities);
        setMessage("Sorties synchronisées depuis Garmin. Vérifie les correspondances avec les séances du même jour.");
        return;
      }

      form?.reset();
      setStatus({ connected: data.connected, error: null });
      setShowSetup(false);
      setMessage(data.connected
        ? "Garmin est connecté. Tu peux importer tes sorties."
        : "Garmin est déconnecté de ce navigateur.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opération impossible.");
    } finally {
      onBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void request("connect", event.currentTarget);
  }

  return <section aria-labelledby="garmin-title">
    <h3 id="garmin-title">Garmin Connect</h3>
    <div className="import-actions">
      {status?.connected && <>
        <button className="primary" disabled={busy || !!status.error} onClick={() => request("import")}>Importer depuis Garmin</button>
        <button disabled={busy} onClick={() => request("disconnect")}>Déconnecter Garmin</button>
      </>}
      <button type="button" disabled={busy || !status || !!status.error} aria-expanded={showSetup} onClick={() => setShowSetup(!showSetup)}>
        {showSetup ? "Masquer le formulaire Garmin" : status?.connected ? "Modifier la clé Garmin" : "Connecter Garmin"}
      </button>
    </div>
    {status?.error && <p className="small" role="status">{status.error}</p>}
    {showSetup && <form method="post" onSubmit={submit} aria-label="Configurer Garmin Connect">
      <p className="small">Génère une <a href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noreferrer">clé API personnelle dans Garmin Connect</a>, puis colle-la ici.</p>
      <div className="fields">
        <label className="wide">Clé API personnelle Garmin<input name="key" type="password" required maxLength={768} autoComplete="off" spellCheck={false}/></label>
      </div>
      <button className="primary" disabled={busy}>{busy ? "Patiente…" : "Enregistrer la connexion Garmin"}</button>
    </form>}
    {message && <p className="notice" role="status">{message}</p>}
    <p className="small">Import à la demande des courses des 90 derniers jours.</p>
  </section>;
}
