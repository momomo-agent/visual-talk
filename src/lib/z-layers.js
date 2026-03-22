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
 *   HOVER        +5    Relative offset when hovered
 *   SELECTED    +10    Relative offset when selected
 *
 * Rules:
 *   1. SELECTED > HOVER > any card's intraZ
 *   2. Current-round cards (intraZ ≥ 0) > PINNED (-30) > old cards (-160, -320)
 *   3. Animations start at ENTERING/FADING/EXITING, never in the "live" range
 */

// Interaction offsets — relative to card's current z, not absolute positions
// Keep small to avoid jarring perspective shifts
export const Z_HOVER_OFFSET = 5       // hover: nudge forward from current z
export const Z_SELECTED_OFFSET = 10   // selected: a bit more than hover

// Data layers (computed by CanvasState)
export const Z_INTRA_STEP = 30        // spacing between sibling cards in a round
export const Z_PINNED = -Z_INTRA_STEP // old cards brought back by move/update

// Depth recession (per depth level behind current)
export const Z_PER_DEPTH = -160       // each depth level pushes back by this

// Animation endpoints
export const Z_ENTER = -200           // fly-in start
export const Z_FADE_OUT = -400        // removed card destination
export const Z_EXIT = -600            // clear-all destination
