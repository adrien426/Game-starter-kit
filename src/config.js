// All gameplay tuning lives here. Change numbers, not code.
export const CONFIG = {
  field: {
    width: 40,          // meters along X
    length: 60,         // meters along Z
    wallHeight: 12,     // invisible walls keep the ball inside
  },
  goal: {
    width: 7,
    height: 2.4,
    depth: 2,
    post: 0.1,          // post thickness
  },
  ball: {
    radius: 0.25,
    density: 6.9,       // ~0.45 kg for this radius
    restitution: 0.6,   // bounciness
    friction: 0.7,
    linearDamping: 0.35,
    angularDamping: 0.9,
  },
  player: {
    walkSpeed: 5,
    sprintSpeed: 8.5,
    turnSpeed: 12,       // how fast the character rotates (rad/s factor)
    capsuleRadius: 0.35,
    capsuleHalfHeight: 0.5,
    dribbleRange: 1.1,   // ball closer than this follows the player
    kickRange: 1.6,      // ball closer than this can be kicked
    kickMin: 9,          // m/s, tap
    kickMax: 26,         // m/s, fully charged
    chargeTime: 0.8,     // seconds to reach full power
    modelYawOffset: Math.PI, // Soldier.glb faces -Z; use 0 for models facing +Z
  },
  keeper: {
    speed: 4.5,
    reach: 3.2,          // half of the zone the keeper covers on the goal line
  },
  match: {
    duration: 180,       // seconds
    goalPause: 2,        // seconds of celebration after a goal
  },
  camera: {
    offset: [0, 9, 13],  // behind and above the player
    lookAhead: 5,
    smoothing: 5,
  },
  physics: {
    timestep: 1 / 60,
    gravity: -9.81,
  },
};

// Rapier collision groups: (membership << 16) | filter
export const GROUP = { WORLD: 1, PLAYER: 2, BALL: 4 };
export const groups = (membership, filter) => (membership << 16) | filter;
