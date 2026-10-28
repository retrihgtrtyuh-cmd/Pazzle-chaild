export interface PuzzleArtwork {
  id: string;
  title: string;
  subtitle: string;
  accentColor: string;
  defaultWidth: number;
  defaultHeight: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 1. Солнечная Лесная Поляна (Лисёнок, Медвежонок и Грибочки)
 */
function drawForestMeadow(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Warm golden-blue sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
  sky.addColorStop(0, '#68c8f8');
  sky.addColorStop(0.55, '#a8e6ff');
  sky.addColorStop(1, '#fff3b8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Glowing morning sun in top-left quadrant
  ctx.save();
  ctx.fillStyle = 'rgba(255, 232, 110, 0.35)';
  ctx.beginPath();
  ctx.arc(w * 0.16, h * 0.18, 92, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffda3e';
  ctx.beginPath();
  ctx.arc(w * 0.16, h * 0.18, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Fluffy clouds in top-right
  const drawCloud = (cx: number, cy: number, scale: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.arc(32, -8, 42, 0, Math.PI * 2);
    ctx.arc(68, 2, 32, 0, Math.PI * 2);
    ctx.arc(34, 14, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  drawCloud(w * 0.48, h * 0.15, 0.95);
  drawCloud(w * 0.78, h * 0.2, 1.15);

  // Rainbow arc across the sky
  const rainbowColors = ['#ff5964', '#ff9f1c', '#ffda3e', '#2ec4b6', '#4ea8de'];
  rainbowColors.forEach((col, i) => {
    ctx.beginPath();
    ctx.arc(w * 0.52, h * 0.68, w * 0.44 - i * 11, Math.PI * 1.08, Math.PI * 1.92);
    ctx.strokeStyle = col;
    ctx.lineWidth = 10;
    ctx.stroke();
  });

  // Distant rolling hills
  ctx.fillStyle = '#74c66b';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  ctx.quadraticCurveTo(w * 0.28, h * 0.44, w * 0.58, h * 0.58);
  ctx.quadraticCurveTo(w * 0.82, h * 0.68, w, h * 0.52);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Foreground lush meadow
  const meadow = ctx.createLinearGradient(0, h * 0.56, 0, h);
  meadow.addColorStop(0, '#52b74a');
  meadow.addColorStop(1, '#2b8a3e');
  ctx.fillStyle = meadow;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.66);
  ctx.quadraticCurveTo(w * 0.35, h * 0.56, w * 0.7, h * 0.64);
  ctx.quadraticCurveTo(w * 0.88, h * 0.68, w, h * 0.61);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Winding golden path
  ctx.fillStyle = '#f3c677';
  ctx.beginPath();
  ctx.moveTo(w * 0.44, h * 0.61);
  ctx.quadraticCurveTo(w * 0.36, h * 0.78, w * 0.46, h);
  ctx.lineTo(w * 0.64, h);
  ctx.quadraticCurveTo(w * 0.52, h * 0.78, w * 0.52, h * 0.61);
  ctx.closePath();
  ctx.fill();

  // Left pine & oak trees
  const drawTree = (tx: number, ty: number, trunkH: number, crownColor: string) => {
    ctx.fillStyle = '#8d5524';
    ctx.fillRect(tx - 14, ty, 28, trunkH);
    ctx.fillStyle = crownColor;
    ctx.beginPath();
    ctx.arc(tx, ty - 18, 56, 0, Math.PI * 2);
    ctx.arc(tx - 36, ty + 6, 42, 0, Math.PI * 2);
    ctx.arc(tx + 36, ty + 6, 42, 0, Math.PI * 2);
    ctx.fill();
    // Red apples on tree
    [
      [-24, -12],
      [18, -28],
      [26, 8],
      [-8, 14],
    ].forEach(([ox, oy]) => {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(tx + ox, ty + oy, 8, 0, Math.PI * 2);
      ctx.fill();
    });
  };
  drawTree(w * 0.14, h * 0.47, 85, '#389e34');
  drawTree(w * 0.86, h * 0.45, 90, '#2f8f2b');

  // Cheerful Red Fox on the left-center
  const fx = w * 0.29;
  const fy = h * 0.74;
  // Fluffy tail
  ctx.fillStyle = '#f26419';
  ctx.beginPath();
  ctx.ellipse(fx - 54, fy + 16, 42, 22, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff8ed';
  ctx.beginPath();
  ctx.arc(fx - 84, fy + 6, 16, 0, Math.PI * 2);
  ctx.fill();
  // Fox body
  ctx.fillStyle = '#f26419';
  ctx.beginPath();
  ctx.ellipse(fx, fy + 22, 42, 48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff8ed';
  ctx.beginPath();
  ctx.ellipse(fx, fy + 26, 24, 32, 0, 0, Math.PI * 2);
  ctx.fill();
  // Fox ears
  ctx.fillStyle = '#d94e0f';
  ctx.beginPath();
  ctx.moveTo(fx - 40, fy - 24);
  ctx.lineTo(fx - 52, fy - 78);
  ctx.lineTo(fx - 10, fy - 44);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(fx + 40, fy - 24);
  ctx.lineTo(fx + 52, fy - 78);
  ctx.lineTo(fx + 10, fy - 44);
  ctx.closePath();
  ctx.fill();
  // Fox head
  ctx.fillStyle = '#f26419';
  ctx.beginPath();
  ctx.ellipse(fx, fy - 24, 48, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  // White cheeks
  ctx.fillStyle = '#fff8ed';
  ctx.beginPath();
  ctx.arc(fx - 24, fy - 12, 22, 0, Math.PI * 2);
  ctx.arc(fx + 24, fy - 12, 22, 0, Math.PI * 2);
  ctx.fill();
  // Eyes, nose & smile
  ctx.fillStyle = '#221814';
  ctx.beginPath();
  ctx.arc(fx - 18, fy - 28, 5.5, 0, Math.PI * 2);
  ctx.arc(fx + 18, fy - 28, 5.5, 0, Math.PI * 2);
  ctx.arc(fx, fy - 12, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#221814';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(fx, fy - 10, 9, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // Friendly Brown Bear on the right-center
  const bx = w * 0.72;
  const by = h * 0.73;
  // Bear ears
  ctx.fillStyle = '#8d5524';
  ctx.beginPath();
  ctx.arc(bx - 36, by - 54, 18, 0, Math.PI * 2);
  ctx.arc(bx + 36, by - 54, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0ac69';
  ctx.beginPath();
  ctx.arc(bx - 36, by - 54, 10, 0, Math.PI * 2);
  ctx.arc(bx + 36, by - 54, 10, 0, Math.PI * 2);
  ctx.fill();
  // Bear body & head
  ctx.fillStyle = '#9c612d';
  ctx.beginPath();
  ctx.ellipse(bx, by + 26, 52, 56, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0ac69';
  ctx.beginPath();
  ctx.ellipse(bx, by + 30, 32, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9c612d';
  ctx.beginPath();
  ctx.arc(bx, by - 24, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0ac69';
  ctx.beginPath();
  ctx.ellipse(bx, by - 13, 22, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#221814';
  ctx.beginPath();
  ctx.arc(bx - 17, by - 30, 5.5, 0, Math.PI * 2);
  ctx.arc(bx + 17, by - 30, 5.5, 0, Math.PI * 2);
  ctx.arc(bx, by - 17, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#221814';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(bx, fy - 14, 9, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // Polka-dot fairytale mushrooms in foreground
  const drawMushroom = (mx: number, my: number, capR: number) => {
    ctx.fillStyle = '#fff5db';
    drawRoundedRect(ctx, mx - capR * 0.35, my, capR * 0.7, capR * 0.9, 10);
    ctx.fill();
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.arc(mx, my + 4, capR, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    [
      [-capR * 0.45, -capR * 0.3],
      [0, -capR * 0.55],
      [capR * 0.45, -capR * 0.28],
    ].forEach(([ox, oy]) => {
      ctx.beginPath();
      ctx.arc(mx + ox, my + oy, capR * 0.16, 0, Math.PI * 2);
      ctx.fill();
    });
  };
  drawMushroom(w * 0.12, h * 0.81, 34);
  drawMushroom(w * 0.51, h * 0.79, 40);
  drawMushroom(w * 0.89, h * 0.82, 32);
}

/**
 * 2. Космический Динозаврик и Ракета
 */
function drawSpaceDino(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#141b4d');
  bg.addColorStop(0.5, '#2b2d7c');
  bg.addColorStop(1, '#4c1d7a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Sparkling stars across quadrants
  const stars = [
    [0.08, 0.12, 5],
    [0.22, 0.08, 8],
    [0.38, 0.18, 6],
    [0.62, 0.1, 9],
    [0.88, 0.14, 7],
    [0.14, 0.48, 6],
    [0.48, 0.42, 8],
    [0.9, 0.52, 7],
    [0.34, 0.85, 6],
    [0.66, 0.86, 8],
  ];
  stars.forEach(([sx, sy, r]) => {
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(w * sx, h * sy, r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Top-left ringed planet (Saturn style)
  ctx.save();
  ctx.translate(w * 0.2, h * 0.25);
  ctx.rotate(-0.28);
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.ellipse(0, 0, 96, 26, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#f77f00';
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bottom golden cheese moon surface
  ctx.fillStyle = '#f4a261';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 1.38, w * 0.65, Math.PI, Math.PI * 2);
  ctx.fill();
  // Moon craters
  [
    [0.24, 0.88, 28],
    [0.52, 0.84, 34],
    [0.78, 0.9, 26],
  ].forEach(([cx, cy, cr]) => {
    ctx.fillStyle = '#e76f51';
    ctx.beginPath();
    ctx.ellipse(w * cx, h * cy, cr * 1.3, cr * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // Cheerful Red & White Rocket Ship on the right
  ctx.save();
  ctx.translate(w * 0.74, h * 0.46);
  ctx.rotate(0.22);
  // Rocket flame
  ctx.fillStyle = '#ff9f1c';
  ctx.beginPath();
  ctx.moveTo(-34, 90);
  ctx.lineTo(0, 165);
  ctx.lineTo(34, 90);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffda3e';
  ctx.beginPath();
  ctx.moveTo(-18, 90);
  ctx.lineTo(0, 138);
  ctx.lineTo(18, 90);
  ctx.closePath();
  ctx.fill();
  // Rocket fins
  ctx.fillStyle = '#ef233c';
  ctx.beginPath();
  ctx.moveTo(-48, 40);
  ctx.lineTo(-86, 102);
  ctx.lineTo(-36, 90);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(48, 40);
  ctx.lineTo(86, 102);
  ctx.lineTo(36, 90);
  ctx.closePath();
  ctx.fill();
  // Rocket body
  ctx.fillStyle = '#edf2f4';
  ctx.beginPath();
  ctx.ellipse(0, 10, 52, 96, 0, 0, Math.PI * 2);
  ctx.fill();
  // Red nose cone
  ctx.fillStyle = '#ef233c';
  ctx.beginPath();
  ctx.arc(0, -56, 42, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  // Porthole window
  ctx.fillStyle = '#48cae4';
  ctx.strokeStyle = '#8d99ae';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Friendly Green Baby Dinosaur in Astronaut Helmet on left-center
  const dx = w * 0.34;
  const dy = h * 0.62;
  // Dino tail
  ctx.fillStyle = '#52b788';
  ctx.beginPath();
  ctx.moveTo(dx - 38, dy + 24);
  ctx.quadraticCurveTo(dx - 115, dy + 40, dx - 120, dy - 12);
  ctx.quadraticCurveTo(dx - 80, dy + 4, dx - 38, dy + 56);
  ctx.closePath();
  ctx.fill();
  // Dino back spikes
  ctx.fillStyle = '#ffb703';
  [-45, -18, 12, 40].forEach((offsetY) => {
    ctx.beginPath();
    ctx.arc(dx - 44, dy + offsetY, 14, 0, Math.PI * 2);
    ctx.fill();
  });
  // Dino body (white spacesuit + green tummy badge)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(dx, dy + 26, 56, 62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#74c69d';
  ctx.beginPath();
  ctx.arc(dx + 6, dy - 38, 48, 0, Math.PI * 2);
  ctx.fill();
  // Cute smile & eye
  ctx.fillStyle = '#1b4332';
  ctx.beginPath();
  ctx.arc(dx + 22, dy - 48, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1b4332';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(dx + 20, dy - 32, 16, 0.15, Math.PI * 0.85);
  ctx.stroke();
  // Glass Bubble Helmet around Dino's head
  ctx.strokeStyle = 'rgba(144, 224, 239, 0.85)';
  ctx.fillStyle = 'rgba(144, 224, 239, 0.18)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(dx + 4, dy - 38, 66, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/**
 * 3. Морские Друзья и Коралловый Риф
 */
function drawUnderwaterReef(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sea = ctx.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, '#00b4d8');
  sea.addColorStop(0.6, '#0077b6');
  sea.addColorStop(1, '#03045e');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, w, h);

  // Sunbeams from surface
  ctx.save();
  ctx.fillStyle = 'rgba(144, 224, 239, 0.16)';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(w * (0.15 + i * 0.24), 0);
    ctx.lineTo(w * (0.25 + i * 0.24), 0);
    ctx.lineTo(w * (0.38 + i * 0.24), h);
    ctx.lineTo(w * (0.04 + i * 0.24), h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Golden sandy seabed
  ctx.fillStyle = '#f4d58d';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.78);
  ctx.quadraticCurveTo(w * 0.35, h * 0.71, w * 0.68, h * 0.79);
  ctx.quadraticCurveTo(w * 0.86, h * 0.83, w, h * 0.75);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Colorful corals & seaweed along the bottom
  const drawSeaweed = (sx: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, h * 0.85);
    ctx.quadraticCurveTo(sx - 24, h * 0.7, sx + 12, h * 0.58);
    ctx.quadraticCurveTo(sx + 32, h * 0.48, sx - 6, h * 0.38);
    ctx.stroke();
  };
  drawSeaweed(w * 0.1, '#2ec4b6');
  drawSeaweed(w * 0.16, '#80ed99');
  drawSeaweed(w * 0.88, '#ff6b6b');
  drawSeaweed(w * 0.93, '#ff9f1c');

  // Smiling Sea Turtle in Top-Left / Center-Left
  const tx = w * 0.31;
  const ty = h * 0.36;
  // Flippers
  ctx.fillStyle = '#80ed99';
  ctx.beginPath();
  ctx.ellipse(tx - 30, ty + 48, 38, 16, -0.5, 0, Math.PI * 2);
  ctx.ellipse(tx + 46, ty + 44, 34, 15, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.arc(tx + 82, ty - 6, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#03045e';
  ctx.beginPath();
  ctx.arc(tx + 92, ty - 14, 6, 0, Math.PI * 2);
  ctx.fill();
  // Domed patterned shell
  ctx.fillStyle = '#f77f00';
  ctx.beginPath();
  ctx.ellipse(tx, ty, 74, 52, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fcbf49';
  ctx.beginPath();
  ctx.arc(tx, ty - 8, 24, 0, Math.PI * 2);
  ctx.arc(tx - 38, ty + 4, 18, 0, Math.PI * 2);
  ctx.arc(tx + 38, ty + 4, 18, 0, Math.PI * 2);
  ctx.fill();

  // Cheerful Pink Octopus in Right Quadrant
  const ox = w * 0.72;
  const oy = h * 0.45;
  ctx.strokeStyle = '#ff5d8f';
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(ox + i * 20, oy + 20);
    ctx.quadraticCurveTo(ox + i * 36, oy + 85, ox + i * 28 + 14, oy + 112);
    ctx.stroke();
  }
  ctx.fillStyle = '#ff5d8f';
  ctx.beginPath();
  ctx.arc(ox, oy - 12, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ox - 20, oy - 18, 14, 0, Math.PI * 2);
  ctx.arc(ox + 20, oy - 18, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d3557';
  ctx.beginPath();
  ctx.arc(ox - 20, oy - 18, 7, 0, Math.PI * 2);
  ctx.arc(ox + 20, oy - 18, 7, 0, Math.PI * 2);
  ctx.fill();

  // Golden starfish & bubbles
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(w * 0.48, h * 0.84, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 3;
  [
    [0.52, 0.25, 16],
    [0.56, 0.16, 11],
    [0.22, 0.62, 14],
    [0.82, 0.22, 18],
  ].forEach(([bx, by, br]) => {
    ctx.beginPath();
    ctx.arc(w * bx, h * by, br, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/**
 * 4. Весёлый Паровозик в Горах
 */
function drawMountainTrain(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
  sky.addColorStop(0, '#4ea8de');
  sky.addColorStop(1, '#caf0f8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Snow-capped mountains
  const drawMountain = (mx: number, peakY: number, baseW: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(mx, peakY);
    ctx.lineTo(mx - baseW / 2, h * 0.68);
    ctx.lineTo(mx + baseW / 2, h * 0.68);
    ctx.closePath();
    ctx.fill();
    // Snow cap
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(mx, peakY);
    ctx.lineTo(mx - baseW * 0.16, peakY + (h * 0.68 - peakY) * 0.32);
    ctx.lineTo(mx + baseW * 0.16, peakY + (h * 0.68 - peakY) * 0.32);
    ctx.closePath();
    ctx.fill();
  };
  drawMountain(w * 0.24, h * 0.14, 420, '#5e60ce');
  drawMountain(w * 0.72, h * 0.1, 480, '#4ea8de');
  drawMountain(w * 0.48, h * 0.2, 380, '#6930c3');

  // Green valley & railway embankment
  ctx.fillStyle = '#52b788';
  ctx.fillRect(0, h * 0.65, w, h * 0.35);
  ctx.fillStyle = '#8d5524';
  ctx.fillRect(0, h * 0.76, w, 16);

  // Steam puffs in sky
  [
    [0.64, 0.32, 26],
    [0.54, 0.24, 34],
    [0.42, 0.18, 42],
  ].forEach(([px, py, pr]) => {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(w * px, h * py, pr, 0, Math.PI * 2);
    ctx.fill();
  });

  // Colorful Toy Train Engine (right) + Wagon (left)
  // Wagon
  ctx.fillStyle = '#ff9f1c';
  drawRoundedRect(ctx, w * 0.16, h * 0.5, 190, 128, 18);
  ctx.fill();
  ctx.fillStyle = '#2ec4b6';
  drawRoundedRect(ctx, w * 0.19, h * 0.54, 58, 52, 10);
  ctx.fill();
  drawRoundedRect(ctx, w * 0.29, h * 0.54, 58, 52, 10);
  ctx.fill();

  // Coupler
  ctx.fillStyle = '#343a40';
  ctx.fillRect(w * 0.16 + 190, h * 0.67, 42, 14);

  // Locomotive
  const lx = w * 0.45;
  const ly = h * 0.44;
  // Cabin
  ctx.fillStyle = '#e63946';
  drawRoundedRect(ctx, lx, ly, 125, 165, 16);
  ctx.fill();
  ctx.fillStyle = '#fff3b0';
  drawRoundedRect(ctx, lx + 24, ly + 26, 76, 62, 12);
  ctx.fill();
  // Boiler front
  ctx.fillStyle = '#1d3557';
  drawRoundedRect(ctx, lx + 115, ly + 55, 145, 110, 20);
  ctx.fill();
  // Smokestack
  ctx.fillStyle = '#ffb703';
  drawRoundedRect(ctx, lx + 185, ly - 10, 38, 72, 8);
  ctx.fill();
  // Front cowcatcher
  ctx.fillStyle = '#ffb703';
  ctx.beginPath();
  ctx.moveTo(lx + 260, ly + 115);
  ctx.lineTo(lx + 305, ly + 165);
  ctx.lineTo(lx + 260, ly + 165);
  ctx.closePath();
  ctx.fill();

  // Big cheerful wheels
  [w * 0.21, w * 0.34, lx + 60, lx + 160, lx + 225].forEach((wx) => {
    ctx.fillStyle = '#e63946';
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(wx, h * 0.74, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

export const PRESET_ARTWORKS: PuzzleArtwork[] = [
  {
    id: 'forest-meadow',
    title: 'Лесная Поляна',
    subtitle: 'Лисёнок и Медвежонок (4:3)',
    accentColor: '#f26419',
    defaultWidth: 1200,
    defaultHeight: 900,
    draw: drawForestMeadow,
  },
  {
    id: 'space-dino',
    title: 'Космо-Динозаврик',
    subtitle: 'Взлёт к звёздам (3:4 портрет)',
    accentColor: '#52b788',
    defaultWidth: 900,
    defaultHeight: 1200,
    draw: drawSpaceDino,
  },
  {
    id: 'underwater-reef',
    title: 'Морские Друзья',
    subtitle: 'Черепашка и осьминог (1:1 квадрат)',
    accentColor: '#00b4d8',
    defaultWidth: 1000,
    defaultHeight: 1000,
    draw: drawUnderwaterReef,
  },
  {
    id: 'mountain-train',
    title: 'Чудо-Паровозик',
    subtitle: 'Поезд в горах (16:9 широкий)',
    accentColor: '#ff9f1c',
    defaultWidth: 1280,
    defaultHeight: 720,
    draw: drawMountainTrain,
  },
];

/**
 * Renders a preset artwork onto an offscreen HTMLCanvasElement using its native resolution.
 */
export function renderPresetToCanvas(
  presetId: string,
  width?: number,
  height?: number
): HTMLCanvasElement {
  const preset =
    PRESET_ARTWORKS.find((p) => p.id === presetId) || PRESET_ARTWORKS[0];
  const targetW = width ?? preset.defaultWidth;
  const targetH = height ?? preset.defaultHeight;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d')!;
  preset.draw(ctx, targetW, targetH);
  return canvas;
}

/**
 * Preserves the exact aspect ratio and native resolution of any user-uploaded image
 * without strict resolution constraints (supports small pixel art, standard images,
 * and high-res photos up to safe WebGL/Canvas hardware limits).
 */
export function renderImageToCanvas(
  img: HTMLImageElement,
  maxHardwareDimension = 4096
): HTMLCanvasElement {
  const srcW = Math.max(1, img.naturalWidth || img.width || 640);
  const srcH = Math.max(1, img.naturalHeight || img.height || 480);

  const longest = Math.max(srcW, srcH);
  const scale = longest > maxHardwareDimension ? maxHardwareDimension / longest : 1;

  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d')!;

  if (longest < 300) {
    ctx.imageSmoothingEnabled = false;
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, targetW, targetH);
  return canvas;
}


