// Shared, per-frame flight input that lives outside React state:
// the HUD (virtual sticks, tilt toggle) writes it, the canvas reads it
// every frame. Keeping it out of the store avoids re-render churn.
export const flightInput = {
  tiltOn: true,
  // Virtual sticks. x: -1 (left) .. 1 (right); y: -1 (down) .. 1 (up).
  stickL: { active: false, x: 0, y: 0 },
  stickR: { active: false, x: 0, y: 0 },
}
