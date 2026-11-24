// ============================================================================
// SmartTraffic Canvas Road Simulation Engine
// Standalone visual simulation with animated vehicles on imaginary roads
// Real junction names: Ghanta Ghar, Ballupur Chowk, ISBT, Prince Chowk
// ============================================================================

(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────
  const JUNCTIONS = [
    { id: 1, name: 'Ghanta Ghar',     sub: 'Clock Tower Crossing',     cx: 0.50, cy: 0.22 },
    { id: 2, name: 'Ballupur Chowk',  sub: 'North-West Arterial Hub',  cx: 0.18, cy: 0.40 },
    { id: 3, name: 'ISBT Dehradun',   sub: 'Inter-State Bus Terminal', cx: 0.22, cy: 0.78 },
    { id: 4, name: 'Prince Chowk',    sub: 'South Central Junction',   cx: 0.60, cy: 0.58 },
  ];

  const ROADS = [
    { id: 1, name: 'Rajpur Road',          from: 1, to: 2, color: '#3b82f6', lanes: 3, toDir: 'EAST', fromDir: 'WEST' },
    { id: 2, name: 'Haridwar Road',        from: 1, to: 4, color: '#8b5cf6', lanes: 2, toDir: 'NORTH', fromDir: 'SOUTH' },
    { id: 3, name: 'Saharanpur Highway',   from: 4, to: 3, color: '#06b6d4', lanes: 2, toDir: 'EAST', fromDir: 'WEST' },
    { id: 4, name: 'GMS Road Bypass',      from: 2, to: 3, color: '#f59e0b', lanes: 2, toDir: 'NORTH', fromDir: 'SOUTH' },
    { id: 5, name: 'Chakrata Road',        from: 2, to: 4, color: '#10b981', lanes: 2, toDir: 'WEST', fromDir: 'EAST' },
    { id: 6, name: 'EC Road Link',         from: 4, to: 1, color: '#ec4899', lanes: 2, toDir: 'EAST', fromDir: 'NORTH' },
    { id: 7, name: 'Cantt Ring Expressway', from: 1, to: 3, color: '#8b5cf6', lanes: 2, toDir: 'NORTH', fromDir: 'WEST' },
    { id: 8, name: 'Transport Corridor',   from: 3, to: 4, color: '#14b8a6', lanes: 2, toDir: 'SOUTH', fromDir: 'WEST' },
  ];

  const VEHICLE_TYPES = {
    Car:        { emoji: '🚗', speed: 1.8, size: 18, color: '#60a5fa' },
    Bus:        { emoji: '🚌', speed: 1.2, size: 22, color: '#a78bfa' },
    Truck:      { emoji: '🚚', speed: 1.0, size: 22, color: '#fb923c' },
    Motorcycle: { emoji: '🏍️', speed: 2.2, size: 14, color: '#34d399' },
    Ambulance:  { emoji: '🚑', speed: 2.5, size: 20, color: '#f87171', emergency: true },
    'Fire Truck':{ emoji: '🚒', speed: 2.0, size: 22, color: '#f87171', emergency: true },
    Police:     { emoji: '🚓', speed: 2.3, size: 18, color: '#60a5fa', emergency: true },
  };

  const DIRECTIONS = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

  // ── State ──────────────────────────────────────────────
  let canvas, ctx;
  let W = 0, H = 0;
  let running = true;
  let simSpeed = 1;
  let simTime = 0;       // elapsed seconds
  let lastFrameTime = 0;
  let vehicles = [];
  let clearedCount = 0;
  let totalWaitTime = 0;
  let vehicleIdCounter = 1;

  // Junction pixel positions (computed on resize)
  const juncPos = {};     // { id: { x, y } }

  // Road segments as pixel paths with control points
  const roadPaths = [];   // [ { road, points: [{x,y}...], length } ]

  // Signals: { jId: { activeDir, phaseTimer, maxGreen, dirs: { NORTH:'RED', ... } } }
  const signals = {};

  const manualOverrides = {};  // jId -> true

  // ── CATS-R Resilience & Fault Injection State ────────────
  const resilienceConfig = {
    packetLossPct: 0,
    latencyMs: 50,
    missingObsPct: 0,
    dataAgeAware: true,
    fallbackActive: false,
    fallbackTimer: 0,
    missedDeadlines: 0,
    totalTasks: 0,
    avgRespTime: 24,
    cpuUtil: 38
  };

  // ── Initialization ─────────────────────────────────────
  function init() {
    canvas = document.getElementById('sim-canvas');
    ctx = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);

    initSignals();
    buildJunctionControls();
    bindControls();
    spawnInitialFleet();

    lastFrameTime = performance.now();
    requestAnimationFrame(loop);

    // Signal scheduler every 1 second
    setInterval(tickSignals, 1000);

    // Clock display
    setInterval(updateClock, 1000);

    // Real-time Dual-Port Dashboard Sync every 1 second
    setInterval(pushSyncToDashboard, 1000);
  }

  function resize() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    W = Math.max(300, (wrap && wrap.clientWidth) || (window.innerWidth - 290) || 800);
    H = Math.max(300, (wrap && wrap.clientHeight) || (window.innerHeight - 56) || 600);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Recompute junction positions
    JUNCTIONS.forEach(j => {
      juncPos[j.id] = { x: j.cx * W, y: j.cy * H };
    });

    // Recompute road paths with curve control points
    computeRoadPaths();
    renderJunctionLabels();
  }

  function computeRoadPaths() {
    roadPaths.length = 0;
    ROADS.forEach(road => {
      const a = juncPos[road.from];
      const b = juncPos[road.to];
      if (!a || !b) return;

      // Create a subtle curved path using a quadratic bezier
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // Perpendicular offset for curve
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const perpX = -dy / len;
      const perpY =  dx / len;
      const curveFactor = 0.12 * len;
      const cpx = mx + perpX * curveFactor;
      const cpy = my + perpY * curveFactor;

      // Approximate bezier with line segments for vehicle travel
      const segments = 40;
      const points = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const px = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cpx + t * t * b.x;
        const py = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cpy + t * t * b.y;
        points.push({ x: px, y: py });
      }

      // Compute total path length
      let totalLen = 0;
      for (let i = 1; i < points.length; i++) {
        const ddx = points[i].x - points[i - 1].x;
        const ddy = points[i].y - points[i - 1].y;
        totalLen += Math.sqrt(ddx * ddx + ddy * ddy);
      }

      roadPaths.push({ road, points, totalLen, cp: { x: cpx, y: cpy } });
    });
  }

  // ── Signals ────────────────────────────────────────────
  function initSignals() {
    JUNCTIONS.forEach(j => {
      signals[j.id] = {
        activeDir: 'NORTH',
        phaseTimer: 0,
        maxGreen: 4,
        dirs: { NORTH: 'GREEN', EAST: 'RED', SOUTH: 'RED', WEST: 'RED' },
      };
    });
  }

  function tickSignals() {
    if (!running) return;
    const alg = document.getElementById('sim-algorithm')?.value || 'ADAPTIVE';
    const quantum = parseInt(document.getElementById('sim-quantum')?.value, 10) || 3;

    // ── CATS-R Overload / Fault Detection ──
    const isOverloaded = resilienceConfig.packetLossPct > 15 || resilienceConfig.latencyMs > 600;
    const packetLost = Math.random() * 100 < resilienceConfig.packetLossPct;

    if (isOverloaded || packetLost) {
      if (!resilienceConfig.fallbackActive) {
        resilienceConfig.fallbackActive = true;
        resilienceConfig.fallbackTimer = 10;
        updateFallbackUI();
      }
    }

    if (resilienceConfig.fallbackActive) {
      resilienceConfig.fallbackTimer--;
      if (resilienceConfig.fallbackTimer <= 0) {
        resilienceConfig.fallbackActive = false;
        updateFallbackUI();
      }
      // SAFE FALLBACK: Fixed-Time Deterministic Clearance Cycle
      JUNCTIONS.forEach(j => {
        if (manualOverrides[j.id]) return;
        const sig = signals[j.id];
        sig.phaseTimer++;
        if (sig.phaseTimer >= 6) {
          sig.phaseTimer = 0;
          const idx = DIRECTIONS.indexOf(sig.activeDir);
          setGreenDir(j.id, DIRECTIONS[(idx + 1) % 4]);
        }
      });
      updateJunctionControlsUI();
      updateResilienceMetricsUI();
      return;
    }

    JUNCTIONS.forEach(j => {
      if (manualOverrides[j.id]) return;

      const sig = signals[j.id];
      sig.phaseTimer++;

      if (alg === 'ROUND_ROBIN') {
        if (sig.phaseTimer >= quantum) {
          sig.phaseTimer = 0;
          const idx = DIRECTIONS.indexOf(sig.activeDir);
          setGreenDir(j.id, DIRECTIONS[(idx + 1) % 4]);
        }
      } else if (alg === 'PRIORITY') {
        // Emergency preemption
        const approaching = vehicles.filter(v => v.targetJunc === j.id && v.progress < 0.9 && !v.cleared);
        const emerg = approaching.find(v => v.emergency);
        if (emerg && sig.activeDir !== emerg.approachDir) {
          sig.phaseTimer = 0;
          setGreenDir(j.id, emerg.approachDir);
        } else if (sig.phaseTimer >= 4) {
          sig.phaseTimer = 0;
          const idx = DIRECTIONS.indexOf(sig.activeDir);
          setGreenDir(j.id, DIRECTIONS[(idx + 1) % 4]);
        }
      } else if (alg === 'EDF') {
        // CATS-R Earliest Deadline First
        resilienceConfig.totalTasks++;
        const approaching = vehicles.filter(v => v.targetJunc === j.id && v.progress < 0.9 && !v.cleared);
        let bestDir = sig.activeDir;
        let earliestDeadline = 1e9;

        approaching.forEach(v => {
          const dline = v.emergency ? 2.0 : Math.max(1.0, 6.0 - v.waitTime);
          if (dline < earliestDeadline) {
            earliestDeadline = dline;
            bestDir = v.approachDir;
          }
        });

        if (earliestDeadline < 0) {
          resilienceConfig.missedDeadlines++;
        }

        if (sig.phaseTimer >= 3 && bestDir !== sig.activeDir) {
          sig.phaseTimer = 0;
          setGreenDir(j.id, bestDir);
        } else if (sig.phaseTimer >= 6) {
          sig.phaseTimer = 0;
          setGreenDir(j.id, bestDir);
        }
      } else if (alg === 'FCFS') {
        const queued = vehicles.filter(v => v.targetJunc === j.id && v.state === 'QUEUED' && !v.cleared);
        if (queued.length > 0 && sig.phaseTimer >= 3) {
          queued.sort((a, b) => b.waitTime - a.waitTime);
          if (queued[0].approachDir !== sig.activeDir) {
            sig.phaseTimer = 0;
            setGreenDir(j.id, queued[0].approachDir);
          }
        }
        if (sig.phaseTimer >= 5) {
          sig.phaseTimer = 0;
          const idx = DIRECTIONS.indexOf(sig.activeDir);
          setGreenDir(j.id, DIRECTIONS[(idx + 1) % 4]);
        }
      } else {
        // ADAPTIVE (with AoI / Data-Age Discounting)
        const counts = { NORTH: 0, EAST: 0, SOUTH: 0, WEST: 0 };
        const hasEmerg = { NORTH: false, EAST: false, SOUTH: false, WEST: false };
        vehicles.forEach(v => {
          if (v.targetJunc === j.id && v.progress < 0.9 && !v.cleared) {
            if (resilienceConfig.missingObsPct > 0 && Math.random() * 100 < resilienceConfig.missingObsPct) {
              return; // Dropped observation
            }
            counts[v.approachDir]++;
            if (v.emergency) hasEmerg[v.approachDir] = true;
          }
        });

        // Emergency preemption
        for (const d of DIRECTIONS) {
          if (hasEmerg[d] && sig.activeDir !== d) {
            sig.phaseTimer = 0;
            setGreenDir(j.id, d);
            return;
          }
        }

        if (sig.phaseTimer >= sig.maxGreen) {
          sig.phaseTimer = 0;
          let bestDir = sig.activeDir;
          let bestScore = -1;

          // AoI (Age of Information) Confidence Discount
          const aoiDiscount = resilienceConfig.dataAgeAware ? Math.exp(-0.0012 * resilienceConfig.latencyMs) : 1.0;

          DIRECTIONS.forEach(d => {
            const score = (counts[d] * 3 * aoiDiscount) + (hasEmerg[d] ? 150 : 0);
            if (score > bestScore) { bestScore = score; bestDir = d; }
          });
          sig.maxGreen = Math.min(8, Math.max(3, counts[bestDir] * 2));
          setGreenDir(j.id, bestDir);
        }
      }
    });

    updateJunctionControlsUI();
    updateResilienceMetricsUI();
  }

  function setGreenDir(jId, dir) {
    const sig = signals[jId];
    sig.activeDir = dir;
    DIRECTIONS.forEach(d => { sig.dirs[d] = d === dir ? 'GREEN' : 'RED'; });
  }

  // ── Vehicles ───────────────────────────────────────────
  function createVehicle(type, roadIdx, direction, fromEnd) {
    const meta = VEHICLE_TYPES[type] || VEHICLE_TYPES.Car;
    const rp = roadPaths[roadIdx % roadPaths.length];
    const road = rp.road;

    // direction: 0 = from->to, 1 = to->from
    const reverse = fromEnd || false;
    const targetJunc = reverse ? road.from : road.to;
    const sourceJunc = reverse ? road.to : road.from;
    const approachDir = reverse ? road.fromDir : road.toDir;

    const v = {
      id: vehicleIdCounter++,
      type,
      emoji: meta.emoji,
      speed: meta.speed,
      size: meta.size,
      color: meta.color,
      emergency: meta.emergency || false,
      roadIdx,
      reverse,
      progress: 0, // 0..1 along the road
      state: 'MOVING',
      targetJunc,
      sourceJunc,
      approachDir,
      waitTime: 0,
      cleared: false,
      x: 0, y: 0,
      angle: 0,
      sirenPhase: 0,
      plate: 'UK07-' + String(vehicleIdCounter).padStart(4, '0'),
    };

    vehicles.push(v);
    return v;
  }

  function spawnRandom(type) {
    const roadIdx = Math.floor(Math.random() * roadPaths.length);
    const reverse = Math.random() > 0.5;
    createVehicle(type, roadIdx, 0, reverse);
  }

  function spawnInitialFleet() {
    vehicles = [];
    clearedCount = 0;
    totalWaitTime = 0;
    vehicleIdCounter = 1;

    // Distribute 12 vehicles across all roads
    const types = ['Car', 'Car', 'Bus', 'Car', 'Truck', 'Car', 'Ambulance', 'Car', 'Motorcycle', 'Car', 'Police', 'Bus'];
    types.forEach((t, i) => {
      const ri = i % roadPaths.length;
      const reverse = i % 2 === 0;
      const v = createVehicle(t, ri, 0, reverse);
      v.progress = 0.05 + Math.random() * 0.35; // Stagger initial positions
    });
  }

  // ── Rendering ──────────────────────────────────────────
  function drawBackground() {
    // Dark gradient background
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    grad.addColorStop(0, '#111827');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid pattern
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.15)';
    ctx.lineWidth = 0.5;
    const gridSize = 50;
    for (let x = 0; x < W; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  function drawRoads() {
    roadPaths.forEach(rp => {
      const pts = rp.points;
      const road = rp.road;

      // Road shadow
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 30 + road.lanes * 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawPath(pts, 2, 2);

      // Road body (dark asphalt)
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 24 + road.lanes * 3;
      drawPath(pts);

      // Road surface
      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 20 + road.lanes * 2;
      drawPath(pts);

      // Center dashed line (lane divider)
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([12, 10]);
      drawPath(pts);
      ctx.setLineDash([]);

      // Road edge markings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 22 + road.lanes * 2;
      ctx.setLineDash([]);
      // Skip edge lines to keep it clean, the main body is enough

      // Road name label at midpoint
      const midIdx = Math.floor(pts.length / 2);
      const mp = pts[midIdx];
      const nextP = pts[Math.min(midIdx + 1, pts.length - 1)];
      const angle = Math.atan2(nextP.y - mp.y, nextP.x - mp.x);

      ctx.save();
      ctx.translate(mp.x, mp.y);
      let displayAngle = angle;
      // Keep text readable (not upside down)
      if (displayAngle > Math.PI / 2 || displayAngle < -Math.PI / 2) {
        displayAngle += Math.PI;
      }
      ctx.rotate(displayAngle);
      ctx.font = '600 9px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(road.name.toUpperCase(), 0, -16);
      ctx.restore();
    });
  }

  function drawPath(points, offX, offY) {
    offX = offX || 0;
    offY = offY || 0;
    ctx.beginPath();
    ctx.moveTo(points[0].x + offX, points[0].y + offY);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x + offX, points[i].y + offY);
    }
    ctx.stroke();
  }

  function drawZebraCrosswalk(cx, cy, orientation, width) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    const numStripes = 5;
    const stripeW = 3;
    const stripeLen = 8;
    if (orientation === 'H') {
      const startX = cx - width / 2 + 2;
      const step = (width - 4) / numStripes;
      for (let i = 0; i < numStripes; i++) {
        ctx.fillRect(startX + i * step, cy - stripeLen / 2, stripeW, stripeLen);
      }
    } else {
      const startY = cy - width / 2 + 2;
      const step = (width - 4) / numStripes;
      for (let i = 0; i < numStripes; i++) {
        ctx.fillRect(cx - stripeLen / 2, startY + i * step, stripeLen, stripeW);
      }
    }
    ctx.restore();
  }

  function drawJunctions() {
    JUNCTIONS.forEach(j => {
      const pos = juncPos[j.id];
      if (!pos) return;
      const sig = signals[j.id];

      // ── 4-Way Crossroad Intersection Geometry (ALL 4 SIDES) ──
      const armLen = 85;
      const roadW = 38;
      const halfW = roadW / 2;

      // 1. Asphalt Road Shadows on All 4 Arms
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(pos.x - halfW - 2, pos.y - armLen, roadW + 4, armLen * 2);
      ctx.fillRect(pos.x - armLen, pos.y - halfW - 2, armLen * 2, roadW + 4);

      // 2. Main Asphalt Base (#374151) on All 4 Arms
      ctx.fillStyle = '#374151';
      ctx.fillRect(pos.x - halfW, pos.y - armLen, roadW, armLen * 2);
      ctx.fillRect(pos.x - armLen, pos.y - halfW, armLen * 2, roadW);

      // 3. Inner Road Surface (#4b5563) on All 4 Arms
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(pos.x - halfW + 3, pos.y - armLen, roadW - 6, armLen * 2);
      ctx.fillRect(pos.x - armLen, pos.y - halfW + 3, armLen * 2, roadW - 6);

      // 4. Center Dashed Yellow Divider on All 4 Arms
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 6]);
      // North arm
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y - 28); ctx.lineTo(pos.x, pos.y - armLen); ctx.stroke();
      // South arm
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y + 28); ctx.lineTo(pos.x, pos.y + armLen); ctx.stroke();
      // East arm
      ctx.beginPath(); ctx.moveTo(pos.x + 28, pos.y); ctx.lineTo(pos.x + armLen, pos.y); ctx.stroke();
      // West arm
      ctx.beginPath(); ctx.moveTo(pos.x - 28, pos.y); ctx.lineTo(pos.x - armLen, pos.y); ctx.stroke();
      ctx.setLineDash([]);

      // 5. Pedestrian Zebra Crossings on All 4 Arms
      drawZebraCrosswalk(pos.x, pos.y - 48, 'H', roadW - 8);
      drawZebraCrosswalk(pos.x, pos.y + 48, 'H', roadW - 8);
      drawZebraCrosswalk(pos.x + 48, pos.y, 'V', roadW - 8);
      drawZebraCrosswalk(pos.x - 48, pos.y, 'V', roadW - 8);

      // 6. Directional Indicators on All 4 Arms
      ctx.font = '700 8px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.textAlign = 'center';
      ctx.fillText('N', pos.x, pos.y - armLen + 10);
      ctx.fillText('S', pos.x, pos.y + armLen - 4);
      ctx.fillText('E', pos.x + armLen - 8, pos.y + 3);
      ctx.fillText('W', pos.x - armLen + 8, pos.y + 3);

      // Outer glow ring
      const glowColor = sig.activeDir ? (sig.dirs[sig.activeDir] === 'GREEN' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)') : 'rgba(59,130,246,0.15)';
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 38, 0, Math.PI * 2);
      ctx.fill();

      // Junction body
      const bodyGrad = ctx.createRadialGradient(pos.x - 4, pos.y - 4, 2, pos.x, pos.y, 28);
      bodyGrad.addColorStop(0, '#334155');
      bodyGrad.addColorStop(0.6, '#1e293b');
      bodyGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 28, 0, Math.PI * 2);
      ctx.fill();

      // Junction border
      ctx.strokeStyle = manualOverrides[j.id] ? '#f59e0b' : '#475569';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 4 directional signal lights
      const sigDirs = [
        { dir: 'NORTH', dx: 0,   dy: -20 },
        { dir: 'EAST',  dx: 20,  dy: 0 },
        { dir: 'SOUTH', dx: 0,   dy: 20 },
        { dir: 'WEST',  dx: -20, dy: 0 },
      ];

      sigDirs.forEach(sd => {
        const sx = pos.x + sd.dx;
        const sy = pos.y + sd.dy;
        const isGreen = sig.dirs[sd.dir] === 'GREEN';

        // Signal light glow
        if (isGreen) {
          ctx.fillStyle = 'rgba(34,197,94,0.35)';
          ctx.beginPath();
          ctx.arc(sx, sy, 9, 0, Math.PI * 2);
          ctx.fill();
        }

        // Signal bulb
        ctx.fillStyle = isGreen ? '#22c55e' : '#dc2626';
        ctx.beginPath();
        ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
        ctx.fill();

        // White border
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Junction ID in center
      ctx.font = '800 11px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('J' + j.id, pos.x, pos.y);
    });
  }

  function drawVehicles() {
    vehicles.forEach(v => {
      if (v.cleared) return;

      ctx.save();
      ctx.translate(v.x, v.y);

      // Emergency siren pulse
      if (v.emergency) {
        v.sirenPhase += 0.08 * simSpeed;
        const pulse = Math.sin(v.sirenPhase * 8);
        const sirenColor = pulse > 0 ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)';
        ctx.fillStyle = sirenColor;
        ctx.beginPath();
        ctx.arc(0, 0, v.size + 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Vehicle shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(2, 2, v.size * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // Vehicle body
      ctx.rotate(v.angle);
      const bodyGrad = ctx.createLinearGradient(-v.size * 0.4, -v.size * 0.3, v.size * 0.4, v.size * 0.3);
      bodyGrad.addColorStop(0, v.color);
      bodyGrad.addColorStop(1, shadeColor(v.color, -30));
      ctx.fillStyle = bodyGrad;

      const hw = v.size * 0.45;
      const hh = v.size * 0.3;
      ctx.beginPath();
      roundRect(ctx, -hw, -hh, hw * 2, hh * 2, 4);
      ctx.fill();

      // Headlights
      ctx.fillStyle = 'rgba(255, 255, 200, 0.8)';
      ctx.beginPath();
      ctx.arc(hw - 1, -hh * 0.45, 2, 0, Math.PI * 2);
      ctx.arc(hw - 1, hh * 0.45, 2, 0, Math.PI * 2);
      ctx.fill();

      // Queued indicator (red brake lights)
      if (v.state === 'QUEUED') {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(-hw + 1, -hh * 0.45, 2.5, 0, Math.PI * 2);
        ctx.arc(-hw + 1, hh * 0.45, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Plate label (only when zoomed or queued)
      if (v.state === 'QUEUED' || v.emergency) {
        ctx.font = '700 8px "Consolas", monospace';
        ctx.fillStyle = v.emergency ? '#fbbf24' : 'rgba(255,255,255,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(v.plate, v.x, v.y - v.size * 0.55);
      }
    });
  }

  function drawStopLines() {
    JUNCTIONS.forEach(j => {
      const pos = juncPos[j.id];
      if (!pos) return;
      const sig = signals[j.id];

      // Draw stop lines extending from junction
      const offsets = [
        { dir: 'NORTH', dx: 0,   dy: -40 },
        { dir: 'EAST',  dx: 40,  dy: 0 },
        { dir: 'SOUTH', dx: 0,   dy: 40 },
        { dir: 'WEST',  dx: -40, dy: 0 },
      ];

      offsets.forEach(o => {
        const isGreen = sig.dirs[o.dir] === 'GREEN';
        const lx = pos.x + o.dx;
        const ly = pos.y + o.dy;

        ctx.strokeStyle = isGreen ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);

        ctx.beginPath();
        if (o.dir === 'NORTH' || o.dir === 'SOUTH') {
          ctx.moveTo(lx - 14, ly);
          ctx.lineTo(lx + 14, ly);
        } else {
          ctx.moveTo(lx, ly - 14);
          ctx.lineTo(lx, ly + 14);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      });
    });
  }

  // ── Vehicle Physics / Motion ───────────────────────────
  function updateVehicles(dt) {
    // Group vehicles by road and direction for queue management
    const roadGroups = {};
    vehicles.forEach(v => {
      if (v.cleared) return;
      const key = v.roadIdx + '_' + (v.reverse ? 'R' : 'F');
      if (!roadGroups[key]) roadGroups[key] = [];
      roadGroups[key].push(v);
    });

    // Sort each group by progress (leading vehicle first)
    Object.values(roadGroups).forEach(group => {
      group.sort((a, b) => b.progress - a.progress);
    });

    let movingCount = 0;
    let queuedCount = 0;
    let emergCount = 0;

    vehicles.forEach(v => {
      if (v.cleared) return;

      const rp = roadPaths[v.roadIdx % roadPaths.length];
      const sig = signals[v.targetJunc];
      const isGreen = sig && sig.dirs[v.approachDir] === 'GREEN';

      const STOP_PROGRESS = 0.80;
      const pixelSpeed = (v.speed * simSpeed * dt * 75) / rp.totalLen;

      // Find position in queue on same road
      const key = v.roadIdx + '_' + (v.reverse ? 'R' : 'F');
      const group = roadGroups[key] || [];
      const myIdx = group.indexOf(v);
      const carAhead = myIdx > 0 ? group[myIdx - 1] : null;
      const minGap = 0.045;

      let stopTarget = STOP_PROGRESS - (myIdx * minGap);
      if (carAhead && !carAhead.cleared && (carAhead.progress - minGap) < stopTarget) {
        stopTarget = carAhead.progress - minGap;
      }
      stopTarget = Math.max(0.04, stopTarget);

      if (v.state === 'QUEUED') {
        if (isGreen) {
          // Green light: check if car ahead moved
          let canMove = true;
          if (carAhead && !carAhead.cleared && (carAhead.progress - v.progress) < minGap * 0.85) {
            canMove = false;
          }
          if (canMove) {
            v.state = 'MOVING';
            v.progress += pixelSpeed * 0.9;
            movingCount++;
          } else {
            v.waitTime += dt;
            queuedCount++;
          }
        } else {
          // Red light: vehicle MUST stay firmly queued at stop line!
          v.progress = Math.min(v.progress, stopTarget);
          v.waitTime += dt;
          queuedCount++;
        }
      } else if (v.progress < STOP_PROGRESS) {
        if (isGreen) {
          let maxAllowed = 1.5;
          if (carAhead && !carAhead.cleared) {
            maxAllowed = carAhead.progress - minGap;
          }
          const nextProgress = v.progress + pixelSpeed;
          v.progress = Math.min(nextProgress, Math.max(v.progress, maxAllowed));
          if (v.progress >= STOP_PROGRESS) {
            v.state = 'CROSSING';
          } else {
            v.state = 'MOVING';
          }
          movingCount++;
        } else {
          // Red light: advance until stopTarget, then switch to QUEUED
          if (v.progress + pixelSpeed >= stopTarget) {
            v.progress = stopTarget;
            v.state = 'QUEUED';
            v.waitTime += dt;
            queuedCount++;
          } else {
            v.progress += pixelSpeed;
            v.state = 'MOVING';
            movingCount++;
          }
        }
      } else {
        // v.progress >= STOP_PROGRESS: Vehicle is crossing / leaving intersection
        v.progress += pixelSpeed * 1.3;
        v.state = 'CROSSING';
        movingCount++;
      }

      if (v.emergency) emergCount++;

      // Check if cleared
      if (v.progress >= 1.15) {
        clearedCount++;
        totalWaitTime += v.waitTime;
        // Respawn on a random road
        v.roadIdx = Math.floor(Math.random() * roadPaths.length);
        v.reverse = Math.random() > 0.5;
        const newRoad = roadPaths[v.roadIdx].road;
        v.targetJunc = v.reverse ? newRoad.from : newRoad.to;
        v.sourceJunc = v.reverse ? newRoad.to : newRoad.from;
        v.approachDir = v.reverse ? newRoad.fromDir : newRoad.toDir;
        v.progress = 0;
        v.waitTime = 0;
        v.state = 'MOVING';
      }

      // Compute pixel position from progress
      const pts = rp.points;
      const prog = v.reverse ? (1 - v.progress) : v.progress;
      const targetDist = Math.max(0, Math.min(1, prog)) * rp.totalLen;
      let accum = 0;
      let px = pts[0].x, py = pts[0].y, angle = 0;

      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const dy = pts[i].y - pts[i - 1].y;
        const segLen = Math.sqrt(dx * dx + dy * dy);
        if (accum + segLen >= targetDist) {
          const t = (targetDist - accum) / segLen;
          px = pts[i - 1].x + dx * t;
          py = pts[i - 1].y + dy * t;
          angle = Math.atan2(dy, dx);
          if (v.reverse) angle += Math.PI;
          break;
        }
        accum += segLen;
        px = pts[i].x;
        py = pts[i].y;
        angle = Math.atan2(dy, dx);
        if (v.reverse) angle += Math.PI;
      }

      // Offset slightly from center line to simulate lane driving
      const laneOff = v.reverse ? -6 : 6;
      const perpAngle = angle + Math.PI / 2;
      v.x = px + Math.cos(perpAngle) * laneOff;
      v.y = py + Math.sin(perpAngle) * laneOff;
      v.angle = angle;
    });

    // Update stats
    const activeVehicles = vehicles.filter(v => !v.cleared).length;
    setText('stat-total', activeVehicles);
    setText('stat-moving', movingCount);
    setText('stat-queued', queuedCount);
    setText('stat-cleared', clearedCount);
    setText('stat-emergency', emergCount);

    const avgWait = clearedCount > 0 ? (totalWaitTime / clearedCount).toFixed(1) : '0.0';
    setText('stat-avg-wait', avgWait + 's');
    const minutesElapsed = simTime / 60;
    const throughput = minutesElapsed > 0.1 ? Math.round(clearedCount / minutesElapsed) : 0;
    setText('stat-throughput', throughput + ' v/min');
  }

  // ── Render Loop ────────────────────────────────────────
  function loop(timestamp) {
    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.1);
    lastFrameTime = timestamp;

    if (running) {
      simTime += dt * simSpeed;
      updateVehicles(dt);
    }

    drawBackground();
    drawRoads();
    drawStopLines();
    drawJunctions();
    drawVehicles();

    if (resilienceConfig.fallbackActive) {
      drawFallbackBanner();
    }

    requestAnimationFrame(loop);
  }

  function drawFallbackBanner() {
    ctx.save();
    const bannerH = 26;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
    ctx.fillRect(0, 0, W, bannerH);
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, W, bannerH);

    ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚠️ CATS-R RESILIENCE: SAFE FALLBACK ACTIVE — Overload / Latency Detected (Fail-Safe Fixed Clearance Enabled)', W / 2, bannerH / 2);
    ctx.restore();
  }

  // ── Junction HTML Labels ───────────────────────────────
  function renderJunctionLabels() {
    const container = document.getElementById('junction-labels');
    if (!container) return;
    container.innerHTML = '';

    JUNCTIONS.forEach(j => {
      const pos = juncPos[j.id];
      if (!pos) return;

      const div = document.createElement('div');
      div.className = 'junc-label';
      div.style.left = pos.x + 'px';
      div.style.top = (pos.y - 44) + 'px';
      div.innerHTML = `
        <div class="junc-label-name">${j.name}</div>
        <div class="junc-label-sub">${j.sub}</div>
      `;
      container.appendChild(div);
    });
  }

  // ── Junction Signal Controls (Sidebar) ─────────────────
  function buildJunctionControls() {
    const container = document.getElementById('junction-controls');
    if (!container) return;
    container.innerHTML = '';

    JUNCTIONS.forEach(j => {
      const div = document.createElement('div');
      div.className = 'junc-ctrl';
      div.id = 'jctrl-' + j.id;
      div.innerHTML = `
        <div class="junc-ctrl-name">J${j.id}: ${j.name}</div>
        <div class="junc-ctrl-btns">
          ${DIRECTIONS.map(d => `<button class="junc-dir-btn" data-jid="${j.id}" data-dir="${d}">${d.charAt(0)}</button>`).join('')}
        </div>
      `;
      container.appendChild(div);
    });

    // Click handlers for direction buttons
    container.addEventListener('click', e => {
      const btn = e.target.closest('.junc-dir-btn');
      if (!btn) return;
      const jId = parseInt(btn.dataset.jid, 10);
      const dir = btn.dataset.dir;
      manualOverrides[jId] = true;
      signals[jId].phaseTimer = 0;
      setGreenDir(jId, dir);
      updateJunctionControlsUI();
      pushSyncToDashboard();

      // Auto-release after 8s
      setTimeout(() => { delete manualOverrides[jId]; }, 8000);
    });

    updateJunctionControlsUI();
  }

  function updateJunctionControlsUI() {
    JUNCTIONS.forEach(j => {
      const ctrl = document.getElementById('jctrl-' + j.id);
      if (!ctrl) return;
      const sig = signals[j.id];
      ctrl.querySelectorAll('.junc-dir-btn').forEach(btn => {
        const d = btn.dataset.dir;
        btn.className = 'junc-dir-btn ' + (sig.dirs[d] === 'GREEN' ? 'is-green' : 'is-red');
      });
    });
  }

  // ── Control Bindings ───────────────────────────────────
  function bindControls() {
    // Speed buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        simSpeed = parseFloat(btn.dataset.speed) || 1;
      });
    });

    // Play/Pause
    document.getElementById('btn-play-pause')?.addEventListener('click', () => {
      running = !running;
      const btn = document.getElementById('btn-play-pause');
      if (running) {
        btn.textContent = '⏸ Pause';
        btn.classList.remove('paused');
      } else {
        btn.textContent = '▶ Resume';
        btn.classList.add('paused');
      }
    });

    // Reset
    document.getElementById('btn-reset-sim')?.addEventListener('click', () => {
      simTime = 0;
      initSignals();
      Object.keys(manualOverrides).forEach(k => delete manualOverrides[k]);
      spawnInitialFleet();
      updateJunctionControlsUI();
    });

    // Spawn buttons
    document.getElementById('btn-spawn-car')?.addEventListener('click', () => spawnRandom('Car'));
    document.getElementById('btn-spawn-bus')?.addEventListener('click', () => spawnRandom('Bus'));
    document.getElementById('btn-spawn-truck')?.addEventListener('click', () => spawnRandom('Truck'));
    document.getElementById('btn-spawn-moto')?.addEventListener('click', () => spawnRandom('Motorcycle'));
    document.getElementById('btn-spawn-ambulance')?.addEventListener('click', () => spawnRandom('Ambulance'));
    document.getElementById('btn-spawn-fire')?.addEventListener('click', () => spawnRandom('Fire Truck'));
    document.getElementById('btn-spawn-police')?.addEventListener('click', () => spawnRandom('Police'));
    document.getElementById('btn-spawn-batch')?.addEventListener('click', () => {
      for (let i = 0; i < 5; i++) {
        const types = ['Car', 'Car', 'Bus', 'Car', 'Truck'];
        spawnRandom(types[i]);
      }
    });

    // Canvas click to toggle nearest junction signal
    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Find nearest junction within 40px
      let nearest = null;
      let nearDist = 50;
      JUNCTIONS.forEach(j => {
        const pos = juncPos[j.id];
        const d = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
        if (d < nearDist) { nearDist = d; nearest = j; }
      });

      if (nearest) {
        const sig = signals[nearest.id];
        const idx = DIRECTIONS.indexOf(sig.activeDir);
        const nextDir = DIRECTIONS[(idx + 1) % 4];
        manualOverrides[nearest.id] = true;
        sig.phaseTimer = 0;
        setGreenDir(nearest.id, nextDir);
        updateJunctionControlsUI();
        pushSyncToDashboard();
        setTimeout(() => { delete manualOverrides[nearest.id]; }, 8000);
      }
    });

    // Algorithm & quantum change listener
    document.getElementById('sim-algorithm')?.addEventListener('change', async (e) => {
      try {
        await fetch(`${API_ENDPOINT}/simulations/1/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            algorithm: e.target.value,
            quantum: parseInt(document.getElementById('sim-quantum').value, 10) || 3
          })
        });
      } catch (err) {}
      pushSyncToDashboard();
    });

    // ── CATS-R Resilience Sliders & Controls ──
    const pLossInput = document.getElementById('input-packet-loss');
    pLossInput?.addEventListener('input', e => {
      resilienceConfig.packetLossPct = parseInt(e.target.value, 10);
      setText('val-packet-loss', resilienceConfig.packetLossPct + '%');
    });

    const latInput = document.getElementById('input-latency');
    latInput?.addEventListener('input', e => {
      resilienceConfig.latencyMs = parseInt(e.target.value, 10);
      setText('val-latency', resilienceConfig.latencyMs + 'ms');
    });

    const missInput = document.getElementById('input-missing-obs');
    missInput?.addEventListener('input', e => {
      resilienceConfig.missingObsPct = parseInt(e.target.value, 10);
      setText('val-missing-obs', resilienceConfig.missingObsPct + '%');
    });

    const ageCheck = document.getElementById('check-data-age');
    ageCheck?.addEventListener('change', e => {
      resilienceConfig.dataAgeAware = e.target.checked;
    });
  }

  function updateFallbackUI() {
    const box = document.getElementById('fallback-status-box');
    const ind = document.getElementById('fallback-indicator');
    if (!box || !ind) return;

    if (resilienceConfig.fallbackActive) {
      box.className = 'fallback-status-box active';
      box.style.background = 'rgba(239,68,68,0.2)';
      box.style.borderColor = '#ef4444';
      ind.style.color = '#fca5a5';
      ind.textContent = '⚠️ SAFE FALLBACK ACTIVE (' + resilienceConfig.fallbackTimer + 's)';
    } else {
      box.className = 'fallback-status-box';
      box.style.background = 'rgba(34,197,94,0.15)';
      box.style.borderColor = '#22c55e';
      ind.style.color = '#4ade80';
      ind.textContent = '● OPERATIONAL (NORMAL)';
    }
  }

  function updateResilienceMetricsUI() {
    const total = Math.max(1, resilienceConfig.totalTasks);
    const missedPct = ((resilienceConfig.missedDeadlines / total) * 100).toFixed(1);
    const missedEl = document.getElementById('stat-missed-deadlines');
    if (missedEl) {
      missedEl.textContent = `${resilienceConfig.missedDeadlines} (${missedPct}%)`;
      missedEl.className = resilienceConfig.missedDeadlines > 0 ? 'red' : 'green';
    }

    const baseResp = 15 + Math.round(resilienceConfig.latencyMs * 0.2);
    setText('stat-resp-time', baseResp + ' ms');

    const cpuBase = Math.min(95, 30 + Math.round(vehicles.length * 2.2) + (resilienceConfig.packetLossPct > 0 ? 15 : 0));
    setText('stat-cpu-util', cpuBase + ' %');
  }

  function updateClock() {
    const s = Math.floor(simTime);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    setText('sim-clock', hh + ':' + mm + ':' + ss);
  }

  // ── Helpers ────────────────────────────────────────────
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function shadeColor(hex, amt) {
    hex = hex.replace('#', '');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    r = Math.min(255, Math.max(0, r + amt));
    g = Math.min(255, Math.max(0, g + amt));
    b = Math.min(255, Math.max(0, b + amt));
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Real-Time Dual-Port Synchronization with Dashboard (Port 5000) ──
  const API_ENDPOINT = (window.location.port === '5001' ? 'http://localhost:5000/api' : '/api');
  let isSyncing = false;

  async function pushSyncToDashboard() {
    if (isSyncing) return;
    isSyncing = true;
    try {
      const activeSignals = {};
      JUNCTIONS.forEach(j => {
        activeSignals[j.id] = signals[j.id];
      });

      const movingVehicles = vehicles.filter(v => !v.cleared && (v.state === 'MOVING' || v.state === 'CROSSING')).length;
      const queuedVehicles = vehicles.filter(v => !v.cleared && v.state === 'QUEUED').length;
      const emergVehicles = vehicles.filter(v => !v.cleared && v.emergency).length;
      const avgWait = vehicles.length > 0 ? parseFloat((totalWaitTime / Math.max(1, clearedCount)).toFixed(2)) : 0;
      const elapsedMin = Math.max(0.1, simTime / 60);
      const throughput = parseFloat((clearedCount / elapsedMin).toFixed(2));

      // Active vehicle list for dashboard vehicles table & queue counters
      const vehList = vehicles.slice(0, 30).map(v => ({
        plate_number: v.plate,
        vehicle_type: v.type,
        junction_id: v.targetJunc,
        direction: v.approachDir,
        status: v.state === 'QUEUED' ? 'WAITING' : (v.state === 'CROSSING' ? 'RUNNING' : 'WAITING'),
        waiting_time: parseFloat(v.waitTime.toFixed(1)),
        is_emergency: v.emergency ? 1 : 0,
        priority: v.emergency ? 1 : 3
      }));

      const payload = {
        signals: activeSignals,
        metrics: {
          total_vehicles: vehicles.length,
          active_vehicles: movingVehicles,
          waiting_vehicles: queuedVehicles,
          completed_vehicles: clearedCount,
          emergency_vehicles: emergVehicles,
          avg_waiting_time: avgWait,
          avg_turnaround_time: parseFloat((avgWait * 1.5).toFixed(2)),
          throughput: throughput,
          current_tick: Math.floor(simTime)
        },
        vehicles: vehList
      };

      const res = await fetch(`${API_ENDPOINT}/simulations/1/live-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.algorithm) {
          const algSelect = document.getElementById('sim-algorithm');
          if (algSelect && algSelect.value !== json.data.algorithm && document.activeElement !== algSelect) {
            algSelect.value = json.data.algorithm;
          }
        }
      }
    } catch (e) {
      // Endpoint temporarily unreachable or network error
    } finally {
      isSyncing = false;
    }
  }

  // ── Boot ───────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
