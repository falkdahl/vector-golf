export const LEVELS = [
  {
    id: "hole-1",
    name: "Crosswind",
    canvas: { width: 900, height: 600 },
    tee: { x: 80, y: 300 },
    hole: { x: 820, y: 300, radius: 14 },
    obstacles: [
      { type: "rect", x: 220, y: 80, w: 20, h: 220 },
      { type: "rect", x: 380, y: 340, w: 220, h: 20 },
      { type: "circle", x: 560, y: 170, r: 42 },
      { type: "rect", x: 650, y: 80, w: 20, h: 180 },
      { type: "circle", x: 430, y: 140, r: 30 }
    ],
    field: { cols: 20, rows: 15, strength: 30, seed: 42 }
  },
  {
    id: "hole-2",
    name: "Vortex",
    canvas: { width: 900, height: 600 },
    tee: { x: 80, y: 520 },
    hole: { x: 820, y: 80, radius: 14 },
    obstacles: [
      { type: "rect", x: 180, y: 200, w: 220, h: 20 },
      { type: "rect", x: 400, y: 100, w: 20, h: 300 },
      { type: "circle", x: 580, y: 400, r: 38 },
      { type: "rect", x: 650, y: 180, w: 20, h: 220 },
      { type: "circle", x: 300, y: 360, r: 28 }
    ],
    field: { cols: 20, rows: 15, strength: 30, seed: 133 }
  },
  {
    id: "hole-3",
    name: "Maze",
    canvas: { width: 900, height: 600 },
    tee: { x: 450, y: 300 },
    hole: { x: 820, y: 300, radius: 14 },
    obstacles: [
      { type: "rect", x: 200, y: 120, w: 20, h: 360 },
      { type: "rect", x: 320, y: 120, w: 200, h: 20 },
      { type: "rect", x: 320, y: 460, w: 200, h: 20 },
      { type: "circle", x: 620, y: 300, r: 45 },
      { type: "rect", x: 700, y: 80, w: 20, h: 180 },
      { type: "circle", x: 480, y: 250, r: 25 }
    ],
    field: { cols: 20, rows: 15, strength: 30, seed: 77 }
  }
];

export const LEVEL = LEVELS[0];
