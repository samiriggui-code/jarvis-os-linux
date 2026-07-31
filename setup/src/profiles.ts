export type ProfileId =
  | "minimal"
  | "assistant"
  | "maison"
  | "media"
  | "vps"
  | "complet";

export const PROFILES: {
  id: ProfileId;
  label: string;
  blurb: string;
  modules: string[];
}[] = [
  {
    id: "minimal",
    label: "JARVIS Minimal",
    blurb: "BASE uniquement — diag + maintenance",
    modules: ["base"],
  },
  {
    id: "assistant",
    label: "Assistant",
    blurb: "BASE + voix + IA + Agent-Reach (Internet)",
    modules: ["base", "hud", "whisper", "piper", "ollama", "agent-reach"],
  },
  {
    id: "maison",
    label: "Maison",
    blurb: "BASE + domotique / IoT",
    modules: ["base", "homeassistant", "mqtt"],
  },
  {
    id: "media",
    label: "Média + IA",
    blurb: "Plex / VLC + assistant (NUC)",
    modules: ["base", "hud", "plex", "vlc", "ollama"],
  },
  {
    id: "vps",
    label: "VPS (cerveau)",
    blurb: "Outils host VPS d’abord : Docker, SSH allowlist, Dashboard, Recovery",
    modules: [
      "base",
      "hermes",
      "dashboard",
      "docker-tools",
      "ssh-allowlist",
      "recovery",
      "agent-reach",
      "ollama-optional",
    ],
  },
  {
    id: "complet",
    label: "Complet",
    blurb: "VPS tools + HUD NUC + HA + médias + Agent-Reach",
    modules: [
      "base",
      "hermes",
      "dashboard",
      "docker-tools",
      "ssh-allowlist",
      "recovery",
      "agent-reach",
      "hud",
      "whisper",
      "piper",
      "ollama",
      "homeassistant",
      "mqtt",
      "plex",
      "vlc",
    ],
  },
];
