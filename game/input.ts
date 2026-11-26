// Shared, per-frame flight input that lives outside React state:
// the HUD (turn buttons, tilt toggle) writes it, the canvas reads it
// every frame. Keeping it out of the store avoids re-render churn.
export const flightInput = {
  turnL: false,
  turnR: false,
  tiltOn: true,
}
