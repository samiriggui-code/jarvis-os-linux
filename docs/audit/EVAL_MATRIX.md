# Eval matrix — auto from litmus

> Généré par `python -m jarvis_core.eval_matrix` — ne pas éditer à la main.

| capability_id | tier | proof | label |
|---|---|---|---|
| `intent:core.preferences` | static | `static check` | executor · core.preferences |
| `intent:core.neural_map` | static | `static check` | executor · core.neural_map |
| `intent:core.dashboard` | static | `static check` | executor · core.dashboard |
| `intent:core.monitor` | static | `static check` | executor · core.monitor |
| `intent:core.holomat` | static | `static check` | executor · core.holomat |
| `intent:core.security` | static | `static check` | executor · core.security |
| `intent:core.providers` | static | `static check` | executor · core.providers |
| `intent:core.usage` | static | `static check` | executor · core.usage |
| `intent:core.mission_dev` | static | `static check` | executor · core.mission_dev |
| `intent:core.cursor` | static | `static check` | executor · core.cursor |
| `intent:system.capabilities` | static | `static check` | executor · system.capabilities |
| `intent:system.introspect` | static | `static check` | executor · system.introspect |
| `intent:hud.lock` | static | `static check` | executor · hud.lock |
| `intent:hud.idle` | static | `static check` | executor · hud.idle |
| `intent:hud.close_space` | static | `static check` | executor · hud.close_space |
| `intent:hud.mute` | static | `static check` | executor · hud.mute |
| `intent:hud.unmute` | static | `static check` | executor · hud.unmute |
| `intent:hud.camera_on` | static | `static check` | executor · hud.camera_on |
| `intent:hud.camera_off` | static | `static check` | executor · hud.camera_off |
| `intent:hud.enroll` | static | `static check` | executor · hud.enroll |
| `intent:media.pause` | static | `static check` | executor · media.pause |
| `intent:media.streaming` | static | `static check` | executor · media.streaming |
| `intent:home.control` | static | `static check` | executor · home.control |
| `intent:media.video` | static | `static check` | executor · media.video |
| `intent:vps.code` | static | `static check` | executor · vps.code |
| `intent:system.network` | static | `static check` | executor · system.network |
| `intent:devices.list` | static | `static check` | executor · devices.list |
| `intent:devices.software` | static | `static check` | executor · devices.software |
| `intent:device.app_launch` | static | `static check` | executor · device.app_launch |
| `intent:devices.topology` | static | `static check` | executor · devices.topology |
| `intent:core.missions` | static | `static check` | executor · core.missions |
| `intent:core.cursor` | static | `static check` | provider SATELLITE · core.cursor |
| `intent:device.app_launch` | static | `static check` | provider SATELLITE · device.app_launch |
| `intent:home.control` | static | `static check` | provider CORE · home.control |
| `intent:media.video` | static | `static check` | provider CORE · media.video |
| `host:device.dispatch` | static | `static check` | DeviceDispatch module |
| `host:device.registry` | static | `static check` | DeviceRegistry on Orchestrator |
| `product:missions.drain` | static | `static check` | MissionStore drain API |
| `product:hermes.slim` | static | `static check` | Hermes skills-only filter |
| `intent:core.cursor` | e2e | `jarvis_core._smoke_p4_device_agent` | Intent → Policy → Device → tool_event |
| `host:app.launch` | e2e | `jarvis_core._smoke_p4_device_agent` | WS device.execute + execute_result |
| `host:app.software.cursor` | e2e | `jarvis_core._smoke_p4_device_agent` | Fake agent software cap |
| `product:intent.circuit` | e2e | `jarvis_core._smoke_intent_circuit` | Circuit intent offline (home, holomat, missions…) |
| `product:policy.chain` | e2e | `jarvis_core._smoke_capabilities` | Policy + Hermes refus + match_intent |
| `product:p0.executors` | e2e | `jarvis_core._smoke_p0_executors` | Tuiles système P0 |
| `host:system.inventory` | integration | `jarvis_core._smoke_p4_windows_apps` | Scan inventaire Windows |
| `product:missions.drain` | e2e | `jarvis_core._smoke_drain` | Mission drain loop E2E |
| `product:hermes.slim` | e2e | `jarvis_core._smoke_hermes_slim` | Hermes MCP slim E2E |
