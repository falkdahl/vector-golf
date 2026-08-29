export const LEVELS = [
  {
    id: "hole-1",
    name: "Crosswind",
    canvas: { width: 900, height: 600 },
    tee: { x: 80, y: 300 },
    hole: { x: 820, y: 300, radius: 14 },
    // 5 obstacles forming blocked direct path with two viable routes (top / bottom)
    obstacles: [
      { type: "rect", x: 220, y: 80, w: 20, h: 220 },
      { type: "rect", x: 380, y: 340, w: 220, h: 20 },
      { type: "circle", x: 560, y: 170, r: 42 },
      { type: "rect", x: 650, y: 80, w: 20, h: 180 },
      { type: "circle", x: 430, y: 140, r: 30 }
    ],
    field: { cols: 20, rows: 15, strength: 30, seed: 42 }
  }
];

export const LEVEL = LEVELS[0];
