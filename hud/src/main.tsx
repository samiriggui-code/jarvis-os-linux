import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { BootScene } from './ui/boot/BootScene'
import { BootGate } from './ui/boot/BootGate'
import { VisionOSMaterialLab } from './spatial/VisionOSMaterialLab'
import { HudSpatialRoot } from './app/HudSpatialRoot'
import { applySpatialCssVars, readSpatialMode, spatialThemeColors } from './spatial/theme/SpatialTheme'
import { applyDevicePolicyToDom } from './ui/core/devicePolicy'
import './styles/index.css'

applyDevicePolicyToDom()
applySpatialCssVars(spatialThemeColors(readSpatialMode()))

const params = new URLSearchParams(window.location.search)

/*
 * Flux produit :
 *   check services → auth | enroll → cinématique (post-auth) → HUD idle
 *
 * `?lab=vision` = atelier matériaux spatial (hors auth / hors apps)
 * `?boot=lab`   = voyage seul (atelier)
 * `?boot=0`     = saute la cinématique post-auth
 * `?theme=light|night` = contraste texte/verre (clair = texte sombre)
 */

const root =
  params.get('lab') === 'vision' ? (
    <VisionOSMaterialLab />
  ) : params.get('boot') === 'lab' ? (
    <HudSpatialRoot>
      <BootScene debug />
    </HudSpatialRoot>
  ) : (
    <HudSpatialRoot>
      <BootGate>
        <App />
      </BootGate>
    </HudSpatialRoot>
  )

createRoot(document.getElementById('root')!).render(<StrictMode>{root}</StrictMode>)
