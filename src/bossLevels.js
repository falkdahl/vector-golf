// Level data for the Dimension-Y boss fight.
// Pure data only: the main game stays untouched when boss mode is not active.

export const DIMENSION_Y_BOSS_LEVEL = {
  id: "dimension-y",
  name: "Dimension-Y",
  logicalW: 1280,
  logicalH: 720,

  // Playable platform is an ellipse over the void.
  arena: { cx: 640, cy: 360, rx: 590, ry: 310 },

  tee: { x: 178, y: 360 },

  boss: {
    x: 1012,
    y: 320,
    radius: 30,
    size: 108,
    lives: 6,
    positions: [
      { x: 1012, y: 320 },
      { x: 1000, y: 176 },
      { x: 1000, y: 484 }
    ]
  },

  // Floating asteroids stream vertically across the arena and block straight
  // shots to the boss. New rocks keep spawning just outside the canvas in
  // these lanes so the barrier never runs dry. The central lanes cover every
  // tee -> boss-position line; the top and bottom edges stay curveable.
  asteroidField: {
    lanes: [
      { x: 780, radius: 34 },
      { x: 772, radius: 38 },
      { x: 790, radius: 36 },
      { x: 772, radius: 38 },
      { x: 785, radius: 34 },
      { x: 778, radius: 32 },
      { x: 620, radius: 24 },
      { x: 900, radius: 26 }
    ],
    targetCount: 12,
    stepMin: 22,
    stepMax: 64,
    duration: 0.5,
    xJitter: 12,
    spawnMargin: 80
  },
  obstacleBounce: 0.72,

  field: {
    cols: 32,
    rows: 18,
    strength: 140,
    seed: 424242,
    sources: 1,
    sinks: 1,
    doublets: 1,
    vortexes: 1
  },

  minions: {
    initial: 2,
    max: 12,
    radius: 15,
    minSteps: 3,
    maxSteps: 5,
    moveDuration: 0.34,
    spawns: [
      { x: 1092, y: 168 },
      { x: 1110, y: 356 },
      { x: 1090, y: 540 },
      { x: 900, y: 118 },
      { x: 900, y: 602 }
    ]
  },

  chests: {
    radius: 14,
    respawnRounds: 3,
    max: 1,
    spawnPoints: [
      { x: 700, y: 176 },
      { x: 700, y: 544 },
      { x: 520, y: 148 },
      { x: 520, y: 572 },
      { x: 840, y: 116 },
      { x: 840, y: 604 }
    ]
  },

  projectiles: {
    count: 128,
    speed: 375,
    radius: 6,
    windScale: 0.72,
    life: 10,
    jitter: 0.03,
    launchInterval: 0.018,
    spiralTurns: 2.5
  },

  actions: {
    barrage: { rounds: 2, label: "Projectile Barrage" },
    spawn: { rounds: 1, label: "Spawn 2 Minions", count: 2 },
    pulse: { rounds: 1, label: "Pulse" },
    laser: { rounds: 2, label: "Laser" }
  },

  laser: { minOtherActionsBetween: 2 }
};

export function createDimensionYBossLevel() {
  return JSON.parse(JSON.stringify(DIMENSION_Y_BOSS_LEVEL));
}
