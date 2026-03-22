/**
 * Z-Layer System — Single source of truth for all translateZ values.
 *
 * In preserve-3d context, z-index is IGNORED by the browser.
 * Only translateZ determines rendering order (higher = closer to viewer).
 *
 * Layer map (back → front):
 *
 *   EXITING     -600   Cards being cleared (fly out animation)
 *   FADING      -400   Cards fading out (removed from snapshot)
 *   DEEP_BG     -320   depth=2 old cards (nearly invisible)
 *   SHALLOW_BG  -160   depth=1 old cards (dimmed)
 *   ENTERING    -200   New cards fly-in start position
 *   PINNED       -30   Old cards pulled back by move/update (behind new)
 *   INTRA_STEP    30   Spacing between sibling cards in same round
 *   FRONT          0   Base z for current-round cards (intraZ adds to this)
 *   HOVER        200   Card being hovered (absolute, above all cards)
 *   SELECTED     250   Card actively selected by user
 *
 * Rules:
 *   1. SELECTED > HOVER > any card's intraZ
 *   2. Current-round cards (intraZ ≥ 0) > PINNED (-30) > old cards (-160, -320)
 *   3. Animations start at ENTERING/FADING/EXITING, never in the "live" range
 */

// Interaction layers — absolute z values, must exceed any card's intraZ
// Typical max intraZ ≈ 5 cards × 30 = 150, so 200+ is safe
export const Z_HOVER = 200
export const Z_SELECTED = 250

// Data layers (computed by CanvasState)
export const Z_INTRA_STEP = 30        // spacing between sibling cards in a round
export const Z_PINNED = -Z_INTRA_STEP // old cards brought back by move/update

// Depth recession (per depth level behind current)
export const Z_PER_DEPTH = -160       // each depth level pushes back by this

// Animation endpoints
export const Z_ENTER = -200           // fly-in start
export const Z_FADE_OUT = -400        // removed card destination
export const Z_EXIT = -600            // clear-all destination
