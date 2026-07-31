import { useEffect, useMemo, useState } from "react";
import { PROFILES, type ProfileId } from "./profiles";

type Step = "welcome" | "profile" | "providers" | "review";

export default function App() {
  const [step, setStep] = useState<Step>("welcome");
  const [profile, setProfile] = useState<ProfileId>("assistant");
  // JARVIS, jamais « Hermes » : Hermes est le nom du moteur interne, pas
  // celui que l'assistant porte devant l'utilisateur (cf. core/dialogues/README.md).
  const [assistantName, setAssistantName] = useState("JARVIS");
  const [ollama, setOllama] = useState(true);
  const [homeAssistant, setHomeAssistant] = useState(false);
  const [hud, setHud] = useState(true);
  const [agentReach, setAgentReach] = useState(true);

  const selected = useMemo(
    () => PROFILES.find((p) => p.id === profile)!,
    [profile],
  );

  useEffect(() => {
    setAgentReach(selected.modules.includes("agent-reach"));
  }, [selected]);

  const manifest = {
    assistant: { name: assistantName },
    profile,
    modules: {
      hud,
      ollama,
      homeassistant: homeAssistant,
      whisper: selected.modules.includes("whisper"),
      piper: selected.modules.includes("piper"),
      "agent-reach": agentReach,
    },
  };

  return (
    <div className="shell">
      <header>
        <p className="eyebrow">JARVIS OS</p>
        <h1>Setup Center</h1>
        <p className="lede">
          Configure le profil, les providers et le manifeste avant déploiement
          sur le NUC.
        </p>
      </header>

      <nav className="steps">
        {(["welcome", "profile", "providers", "review"] as Step[]).map((s) => (
          <button
            key={s}
            type="button"
            className={step === s ? "active" : ""}
            onClick={() => setStep(s)}
          >
            {s}
          </button>
        ))}
      </nav>

      <main>
        {step === "welcome" && (
          <section>
            <h2>Bienvenue</h2>
            <p>
              Cet assistant génère un manifeste de déploiement (HUD React, Core,
              services). Les secrets API iront dans un coffre local — jamais dans
              le navigateur de prod.
            </p>
            <label>
              Nom de l’assistant
              <input
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
              />
            </label>
            <button type="button" className="primary" onClick={() => setStep("profile")}>
              Continuer
            </button>
          </section>
        )}

        {step === "profile" && (
          <section>
            <h2>Profil machine</h2>
            <div className="cards">
              {PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={profile === p.id ? "card active" : "card"}
                  onClick={() => setProfile(p.id)}
                >
                  <strong>{p.label}</strong>
                  <span>{p.blurb}</span>
                </button>
              ))}
            </div>
            <button type="button" className="primary" onClick={() => setStep("providers")}>
              Continuer
            </button>
          </section>
        )}

        {step === "providers" && (
          <section>
            <h2>Modules</h2>
            <label className="check">
              <input type="checkbox" checked={hud} onChange={(e) => setHud(e.target.checked)} />
              HUD React (kiosque Chromium)
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={ollama}
                onChange={(e) => setOllama(e.target.checked)}
              />
              Ollama (LLM local / distant)
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={homeAssistant}
                onChange={(e) => setHomeAssistant(e.target.checked)}
              />
              Home Assistant
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={agentReach}
                onChange={(e) => setAgentReach(e.target.checked)}
              />
              Agent-Reach (Internet Hermes — web / GitHub / YouTube)
            </label>
            <p className="hint">Profil « {selected.label} » suggère : {selected.modules.join(", ")}</p>
            <button type="button" className="primary" onClick={() => setStep("review")}>
              Voir le manifeste
            </button>
          </section>
        )}

        {step === "review" && (
          <section>
            <h2>Manifeste</h2>
            <pre>{JSON.stringify(manifest, null, 2)}</pre>
            <p className="hint">
              Prochaine étape : écrire ce JSON via l’API Core / script deploy vers
              <code> /etc/jarvis/</code> et <code>deploy/manifests/</code>.
            </p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                const blob = new Blob([JSON.stringify(manifest, null, 2)], {
                  type: "application/json",
                });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "jarvis-manifest.json";
                a.click();
              }}
            >
              Télécharger le manifeste
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
