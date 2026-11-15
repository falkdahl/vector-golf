// Stage data for the Dimension-Y boss prototype.
// Pure data only: the main game stays untouched when boss mode is not active.

export const BOSS_STAGE_1 = {
  id: "dimension-y-stage-1",
  name: "Dimension Y - Stage 1",
  bossName: "Slicer",
  logicalW: 1280,
  logicalH: 720,

  // Playable platform is an ellipse over the void.
  arena: { cx: 640, cy: 360, rx: 590, ry: 310 },

  tee: { x: 178, y: 360 },

  boss: {
    x: 1012,
    y: 320,
    radius: 36,
    lives: 3,
    positions: [
      { x: 1012, y: 320 },
      { x: 1000, y: 176 },
      { x: 1000, y: 484 }
    ]
  },

  // Floating asteroids block straight shots to the boss. The central chain
  // covers every tee -> boss-position line; the top and bottom gaps are wide
  // enough to curve a shot around the barrier.
  obstacles: [
    { x: 780, y: 176, radius: 34 },
    { x: 772, y: 244, radius: 38 },
    { x: 790, y: 316, radius: 36 },
    { x: 772, y: 390, radius: 38 },
    { x: 785, y: 462, radius: 34 },
    { x: 778, y: 532, radius: 32 },
    { x: 620, y: 180, radius: 24 },
    { x: 620, y: 540, radius: 24 },
    { x: 900, y: 150, radius: 26 },
    { x: 900, y: 570, radius: 26 }
  ],
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
    max: 6,
    radius: 12,
    steps: 6,
    spawns: [
      { x: 1092, y: 168 },
      { x: 1110, y: 356 },
      { x: 1090, y: 540 },
      { x: 900, y: 118 },
      { x: 900, y: 602 }
    ],
    path: [
      { x: 980, y: 320 },
      { x: 850, y: 300 },
      { x: 720, y: 330 },
      { x: 580, y: 360 },
      { x: 440, y: 360 },
      { x: 300, y: 360 },
      { x: 178, y: 360 }
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
    count: 4,
    speed: 150,
    spread: 0.62,
    radius: 9,
    windScale: 0.72,
    life: 10
  },

  actions: {
    barrage: { rounds: 2, label: "Projectile Barrage" },
    spawn: { rounds: 2, label: "Spawn 2 Minions", count: 2 },
    pulse: { rounds: 2, label: "Pulse" },
    laser: { rounds: 3, label: "Laser" }
  },

  laser: { minOtherActionsBetween: 2 },

  graceSeconds: 1.0,
  shotTimeout: 8.0
};

export function createBossStage1() {
  return JSON.parse(JSON.stringify(BOSS_STAGE_1));
}
