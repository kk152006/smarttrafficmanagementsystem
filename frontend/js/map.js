// ============================================================================
// SmartTraffic Interactive Leaflet Map & Road Traffic Simulator
// Real-time Vehicle Motion, Stop-Lines, Queuing & Traffic Signal Scheduling
// ============================================================================

const TrafficMap = {
  map: null,
  junctionMarkers: {},
  roadPolylines: [],
  incidentMarkers: [],
  signalBulbMarkers: {}, // key: `${junctionId}_${direction}`

  // Simulation State
  isMotionRunning: true,
  simSpeed: 1.0,
  animFrameId: null,
  signalTimerId: null,
  simVehicles: [],
  clearedCount: 0,
  manualOverrides: {}, // junctionId -> true/false

  // Junction Signal States: { [jId]: { NORTH: 'RED', SOUTH: 'RED', EAST: 'RED', WEST: 'RED', activeDir: 'NORTH', timer: 0 } }
  signals: {},

  // Pre-configured Junction coordinates (Dehradun Metropolitan)
  junctionCoords: {
    1: [30.3255, 78.0437], // Ghanta Ghar
    2: [30.3398, 78.0165], // Ballupur
    3: [30.2863, 77.9996], // ISBT
    4: [30.3174, 78.0371], // Prince Chowk
  },

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------
  init(elementId = 'leaflet-map') {
    if (this.map) return;

    // Center map around Dehradun metropolitan core
    this.map = L.map(elementId).setView([30.318, 78.028], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | GEU SmartTraffic OS+DBMS',
      maxZoom: 18,
    }).addTo(this.map);

    // Initialize default signal states for all 4 junctions
    [1, 2, 3, 4].forEach((jId) => {
      this.signals[jId] = {
        NORTH: 'RED',
        SOUTH: 'RED',
        EAST: 'RED',
        WEST: 'RED',
        activeDir: 'NORTH',
        phaseTimer: 0,
        maxGreenTime: 6,
      };
      this.signals[jId]['NORTH'] = 'GREEN'; // Start with North green
    });

    this.bindHudControls();
    this.initDefaultFleet();
    this.startMotionLoop();
    this.startSignalScheduler();
  },

  // --------------------------------------------------------------------------
  // HUD & Interactive Controls
  // --------------------------------------------------------------------------
  bindHudControls() {
    // Play / Pause Motion
    document.getElementById('btn-toggle-motion')?.addEventListener('click', () => {
      this.isMotionRunning = !this.isMotionRunning;
      const btnText = document.getElementById('motion-btn-text');
      const btnIcon = document.getElementById('motion-btn-icon');
      if (this.isMotionRunning) {
        if (btnText) btnText.textContent = 'Pause Motion';
        if (btnIcon) btnIcon.textContent = '⏸️';
        this.startMotionLoop();
      } else {
        if (btnText) btnText.textContent = 'Resume Motion';
        if (btnIcon) btnIcon.textContent = '▶️';
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      }
    });

    // Speed Selector Buttons (1x, 2x, 4x)
    document.querySelectorAll('.hud-speed-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.hud-speed-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.simSpeed = parseFloat(e.target.getAttribute('data-speed')) || 1.0;
      });
    });

    // Quick Vehicle Spawners from Map HUD
    document.getElementById('btn-quick-car')?.addEventListener('click', () => {
      this.spawnRandomVehicle('Car', false);
    });
    document.getElementById('btn-quick-bus')?.addEventListener('click', () => {
      this.spawnRandomVehicle('Bus', false);
    });
    document.getElementById('btn-quick-emerg')?.addEventListener('click', () => {
      this.spawnRandomVehicle('Ambulance', true);
    });
    document.getElementById('btn-reset-fleet')?.addEventListener('click', () => {
      this.resetFleet();
    });
  },

  // --------------------------------------------------------------------------
  // Approaches & Road Trajectories
  // --------------------------------------------------------------------------
  getApproachVector(jId, direction) {
    const center = this.junctionCoords[jId] || [30.3255, 78.0437];
    const offset = 0.009; // ~1 km approach corridor

    let start = [center[0], center[1]];
    switch (direction) {
      case 'NORTH':
        start = [center[0] + offset, center[1]];
        break;
      case 'SOUTH':
        start = [center[0] - offset, center[1]];
        break;
      case 'EAST':
        start = [center[0], center[1] + offset * 1.15];
        break;
      case 'WEST':
        start = [center[0], center[1] - offset * 1.15];
        break;
    }

    // Departure point after crossing through the intersection
    let exit = [center[0], center[1]];
    switch (direction) {
      case 'NORTH':
        exit = [center[0] - offset * 0.8, center[1]];
        break;
      case 'SOUTH':
        exit = [center[0] + offset * 0.8, center[1]];
        break;
      case 'EAST':
        exit = [center[0], center[1] - offset * 0.9];
        break;
      case 'WEST':
        exit = [center[0], center[1] + offset * 0.9];
        break;
    }

    return { start, center, exit };
  },

  // --------------------------------------------------------------------------
  // Vehicle Fleet Lifecycle
  // --------------------------------------------------------------------------
  initDefaultFleet() {
    this.clearFleetMarkers();
    this.simVehicles = [];

    const defaultVehicles = [
      { type: 'Car', jId: 1, dir: 'NORTH', emerg: false, plate: 'UK07-AX-1011' },
      { type: 'Ambulance', jId: 1, dir: 'NORTH', emerg: true, plate: 'UK07-EM-9999' },
      { type: 'Bus', jId: 1, dir: 'SOUTH', emerg: false, plate: 'UK07-PA-4022' },
      { type: 'Car', jId: 1, dir: 'EAST', emerg: false, plate: 'UK07-BX-3044' },

      { type: 'Truck', jId: 2, dir: 'WEST', emerg: false, plate: 'UK07-TX-8801' },
      { type: 'Fire Truck', jId: 2, dir: 'EAST', emerg: true, plate: 'UK07-FT-1010' },
      { type: 'Car', jId: 2, dir: 'NORTH', emerg: false, plate: 'UK07-CX-7722' },

      { type: 'Bus', jId: 3, dir: 'SOUTH', emerg: false, plate: 'UK07-PB-5501' },
      { type: 'Police', jId: 3, dir: 'NORTH', emerg: true, plate: 'UK07-PV-0012' },
      { type: 'Car', jId: 3, dir: 'WEST', emerg: false, plate: 'UK07-DX-6633' },

      { type: 'Motorcycle', jId: 4, dir: 'EAST', emerg: false, plate: 'UK07-EX-2211' },
      { type: 'Car', jId: 4, dir: 'WEST', emerg: false, plate: 'UK07-FX-4499' },
    ];

    defaultVehicles.forEach((v, idx) => {
      this.createVehicleObject(v.plate, v.type, v.jId, v.dir, v.emerg, idx * 0.18);
    });
  },

  createVehicleObject(plate, type, junctionId, direction, isEmergency, initialProgress = 0.0) {
    const vector = this.getApproachVector(junctionId, direction);
    const id = Date.now() + Math.floor(Math.random() * 10000);

    const iconEmoji = isEmergency
      ? (type === 'Ambulance' ? '🚑' : type === 'Fire Truck' ? '🚒' : '🚓')
      : (type === 'Bus' ? '🚌' : type === 'Truck' ? '🚚' : type === 'Motorcycle' ? '🏍️' : '🚗');

    const vObj = {
      id: id,
      plate: plate || `UK07-${Math.floor(1000 + Math.random() * 9000)}`,
      type: type,
      isEmergency: isEmergency,
      junctionId: junctionId,
      direction: direction,
      vector: vector,
      progress: Math.min(initialProgress, 0.75), // 0.0 to 1.0 (0.80 = stop line)
      speed: (isEmergency ? 0.0038 : type === 'Motorcycle' ? 0.0035 : type === 'Bus' || type === 'Truck' ? 0.0022 : 0.0028),
      state: 'MOVING', // 'MOVING' | 'QUEUED' | 'CROSSING' | 'CLEARED'
      icon: iconEmoji,
      marker: null,
      waitTime: 0,
    };

    // Create Leaflet divIcon marker
    const initLatLng = this.interpolatePosition(vector.start, vector.center, vObj.progress);
    const customIcon = L.divIcon({
      className: 'leaflet-vehicle-container',
      html: `
        <div class="map-vehicle-marker ${isEmergency ? 'emergency-pulse' : ''}" id="v-marker-${id}">
          <span class="v-badge">${vObj.plate}</span>
          <span class="v-icon-wrap">${vObj.icon}</span>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    vObj.marker = L.marker(initLatLng, { icon: customIcon }).addTo(this.map);
    vObj.marker.bindPopup(`
      <div style="font-size:0.85rem; line-height:1.4;">
        <strong style="color: #143769;">${vObj.icon} ${vObj.plate}</strong> (${vObj.type})<br>
        <strong>Status:</strong> <span id="v-status-${id}">${vObj.state}</span><br>
        <strong>Approaching:</strong> Junction ${junctionId} (${direction})<br>
        <strong>Priority:</strong> ${isEmergency ? '🚨 Emergency (Priority 1)' : 'Standard (P3)'}<br>
        <div style="margin-top:6px; font-size:0.75rem; color:#64748b;">
          Click signal to clear or let scheduling algorithm manage queue.
        </div>
      </div>
    `);

    this.simVehicles.push(vObj);
    return vObj;
  },

  spawnRandomVehicle(type = 'Car', isEmergency = false) {
    const jIds = [1, 2, 3, 4];
    const dirs = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
    const randomJ = jIds[Math.floor(Math.random() * jIds.length)];
    const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const prefix = isEmergency ? 'EM' : (type === 'Bus' ? 'BS' : type === 'Truck' ? 'TR' : 'CR');
    const plate = `UK07-${prefix}-${randomNum}`;

    const v = this.createVehicleObject(plate, type, randomJ, randomDir, isEmergency, 0.0);
    if (window.SimulationApp && window.SimulationApp.showToast) {
      window.SimulationApp.showToast(`🚗 Spawned ${plate} (${type}) approaching Junction ${randomJ} from ${randomDir}`, 'info');
    }
  },

  resetFleet() {
    this.initDefaultFleet();
    this.clearedCount = 0;
    if (window.SimulationApp && window.SimulationApp.showToast) {
      window.SimulationApp.showToast('Traffic simulation fleet reset to initial road network configuration.', 'info');
    }
  },

  clearFleetMarkers() {
    this.simVehicles.forEach((v) => {
      if (v.marker && this.map) {
        this.map.removeLayer(v.marker);
      }
    });
    this.simVehicles = [];
  },

  // --------------------------------------------------------------------------
  // Math & Interpolation Helpers
  // --------------------------------------------------------------------------
  interpolatePosition(start, end, t) {
    const lat = start[0] + (end[0] - start[0]) * t;
    const lng = start[1] + (end[1] - start[1]) * t;
    return [lat, lng];
  },

  // --------------------------------------------------------------------------
  // Real-Time Motion & Queue Animation Loop (60 FPS)
  // --------------------------------------------------------------------------
  startMotionLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

    const loop = () => {
      if (this.isMotionRunning) {
        this.updateVehiclePositions();
      }
      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  },

  updateVehiclePositions() {
    const STOP_LINE = 0.80; // Distance along approach vector where stop line resides
    const CAR_SPACING = 0.065; // Distance between queued cars

    // Group vehicles by junction and direction to order queues correctly
    const queueGroups = {};
    this.simVehicles.forEach((v) => {
      const key = `${v.junctionId}_${v.direction}`;
      if (!queueGroups[key]) queueGroups[key] = [];
      queueGroups[key].push(v);
    });

    let movingCount = 0;
    let queuedCount = 0;

    // Process each queue group
    Object.keys(queueGroups).forEach((key) => {
      const group = queueGroups[key];
      // Sort group descending by progress so the vehicle closest to the junction leads
      group.sort((a, b) => b.progress - a.progress);

      const [jIdStr, dir] = key.split('_');
      const jId = parseInt(jIdStr, 10);
      const isGreen = this.signals[jId] && this.signals[jId][dir] === 'GREEN';

      group.forEach((v, indexInQueue) => {
        const targetStopProgress = Math.max(0.1, STOP_LINE - (indexInQueue * CAR_SPACING));

        if (v.state === 'QUEUED') {
          if (isGreen) {
            // Signal turned green: vehicle proceeds!
            v.state = 'CROSSING';
            v.progress += v.speed * this.simSpeed;
            movingCount++;
          } else {
            // Signal is still RED: stay queued at stop line!
            v.progress = Math.min(v.progress, targetStopProgress);
            v.waitTime += 0.016;
            queuedCount++;
          }
        } else if (v.progress < STOP_LINE) {
          // Approaching the stop-line
          if (isGreen) {
            // Signal is green: drive right through!
            v.progress += v.speed * this.simSpeed;
            if (v.progress >= STOP_LINE) v.state = 'CROSSING';
            movingCount++;
          } else {
            // Signal is RED: check stop line queue
            if (v.progress + (v.speed * this.simSpeed) >= targetStopProgress) {
              // Reached waiting line
              v.progress = targetStopProgress;
              v.state = 'QUEUED';
              v.waitTime += 0.016;
              queuedCount++;
            } else {
              // Still driving towards stop-line
              v.progress += v.speed * this.simSpeed;
              v.state = 'MOVING';
              movingCount++;
            }
          }
        } else {
          // Beyond stop line (in the middle of crossing or departing)
          v.progress += v.speed * this.simSpeed * 1.25; // Accelerate through green
          v.state = 'CROSSING';
          movingCount++;
        }

        // Check if vehicle completed crossing through intersection
        if (v.progress >= 1.2) {
          // Cleared intersection! Respawn or loop on adjacent road
          this.clearedCount++;
          v.progress = 0.0;
          v.waitTime = 0;
          v.state = 'MOVING';

          // Randomize next approach to keep simulation dynamically flowing
          const nextDirs = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
          v.direction = nextDirs[Math.floor(Math.random() * nextDirs.length)];
          v.vector = this.getApproachVector(v.junctionId, v.direction);
        }

        // Update marker coordinates and CSS state classes
        if (v.marker) {
          let pos;
          if (v.progress <= 1.0) {
            // Along approach vector (start -> center)
            pos = this.interpolatePosition(v.vector.start, v.vector.center, v.progress);
          } else {
            // Along exit vector (center -> exit)
            const exitT = (v.progress - 1.0) / 0.2;
            pos = this.interpolatePosition(v.vector.center, v.vector.exit, exitT);
          }

          v.marker.setLatLng(pos);

          // Update queued visual styling badge
          const el = document.getElementById(`v-marker-${v.id}`);
          if (el) {
            if (v.state === 'QUEUED') {
              el.classList.add('queued');
            } else {
              el.classList.remove('queued');
            }
          }
        }
      });
    });

    // Update Live HUD Counters
    const movingEl = document.getElementById('hud-moving-count');
    const queuedEl = document.getElementById('hud-queued-count');
    const clearedEl = document.getElementById('hud-cleared-count');
    if (movingEl) movingEl.textContent = movingCount;
    if (queuedEl) queuedEl.textContent = queuedCount;
    if (clearedEl) clearedEl.textContent = this.clearedCount;
  },

  // --------------------------------------------------------------------------
  // Traffic Signal Scheduling Controller (According to OS Algorithms)
  // --------------------------------------------------------------------------
  startSignalScheduler() {
    if (this.signalTimerId) clearInterval(this.signalTimerId);

    // Evaluates traffic signal states every 1.0 second according to active algorithm
    this.signalTimerId = setInterval(() => {
      this.tickSignals();
    }, 1000);
  },

  tickSignals() {
    const algSelect = document.getElementById('select-algorithm');
    const currentAlg = algSelect ? algSelect.value : 'ADAPTIVE';
    const quantumInput = document.getElementById('input-quantum');
    const quantum = quantumInput ? parseInt(quantumInput.value, 10) || 2 : 2;

    const modeBadge = document.getElementById('hud-signal-mode-badge');
    if (modeBadge) {
      modeBadge.textContent = `${currentAlg} AUTO`;
    }

    const directions = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

    [1, 2, 3, 4].forEach((jId) => {
      // If junction is currently locked in manual override, skip automatic cycling
      if (this.manualOverrides[jId]) return;

      const sigState = this.signals[jId];
      sigState.phaseTimer++;

      if (currentAlg === 'ROUND_ROBIN') {
        // Round Robin: Switch direction every quantum seconds in fixed circular order
        if (sigState.phaseTimer >= quantum) {
          sigState.phaseTimer = 0;
          const currentIdx = directions.indexOf(sigState.activeDir);
          const nextDir = directions[(currentIdx + 1) % directions.length];
          this.setSignalState(jId, nextDir, false);
        }
      } else if (currentAlg === 'PRIORITY') {
        // Priority: Check if emergency vehicle or P1 vehicle is approaching
        const vehiclesAtJunc = this.simVehicles.filter(v => v.junctionId === jId && v.progress < 0.95);
        const emergVeh = vehiclesAtJunc.find(v => v.isEmergency);

        if (emergVeh && sigState.activeDir !== emergVeh.direction) {
          // Preemptively switch to emergency vehicle's direction!
          sigState.phaseTimer = 0;
          this.setSignalState(jId, emergVeh.direction, false);
        } else if (sigState.phaseTimer >= 4) {
          // Normal priority cycle if timer expired
          sigState.phaseTimer = 0;
          const currentIdx = directions.indexOf(sigState.activeDir);
          const nextDir = directions[(currentIdx + 1) % directions.length];
          this.setSignalState(jId, nextDir, false);
        }
      } else if (currentAlg === 'FCFS') {
        // FCFS: Give green to the direction whose lead car arrived earliest / waited longest
        const vehiclesAtJunc = this.simVehicles.filter(v => v.junctionId === jId && v.state === 'QUEUED');
        if (vehiclesAtJunc.length > 0 && sigState.phaseTimer >= 3) {
          vehiclesAtJunc.sort((a, b) => b.waitTime - a.waitTime);
          const longestWaiting = vehiclesAtJunc[0];
          if (longestWaiting && longestWaiting.direction !== sigState.activeDir) {
            sigState.phaseTimer = 0;
            this.setSignalState(jId, longestWaiting.direction, false);
          }
        } else if (sigState.phaseTimer >= 4) {
          sigState.phaseTimer = 0;
          const currentIdx = directions.indexOf(sigState.activeDir);
          const nextDir = directions[(currentIdx + 1) % directions.length];
          this.setSignalState(jId, nextDir, false);
        }
      } else {
        // ADAPTIVE (Default): Dynamic queue pressure score calculation
        // Score = (queue_count * 3) + (has_emergency * 150) + waiting_pressure
        const queueCounts = { NORTH: 0, SOUTH: 0, EAST: 0, WEST: 0 };
        const hasEmergency = { NORTH: 0, SOUTH: 0, EAST: 0, WEST: 0 };

        this.simVehicles.forEach((v) => {
          if (v.junctionId === jId && v.progress < 0.95) {
            queueCounts[v.direction]++;
            if (v.isEmergency) hasEmergency[v.direction] = 1;
          }
        });

        // If an emergency arrives, preempt immediately
        let emergDir = null;
        directions.forEach((d) => {
          if (hasEmergency[d]) emergDir = d;
        });

        if (emergDir && sigState.activeDir !== emergDir) {
          sigState.phaseTimer = 0;
          this.setSignalState(jId, emergDir, false);
          return;
        }

        // Check if dynamic green time has elapsed
        if (sigState.phaseTimer >= sigState.maxGreenTime) {
          sigState.phaseTimer = 0;

          // Pick direction with highest score among non-active directions
          let bestDir = sigState.activeDir;
          let bestScore = -1;

          directions.forEach((dir) => {
            const score = (queueCounts[dir] * 3) + (hasEmergency[dir] * 150);
            if (score > bestScore) {
              bestScore = score;
              bestDir = dir;
            }
          });

          // Calculate dynamic green time for next phase
          const nextQueue = queueCounts[bestDir] || 1;
          sigState.maxGreenTime = Math.min(10, Math.max(3, nextQueue * 2));

          this.setSignalState(jId, bestDir, false);
        }
      }
    });

    this.renderSignalBulbMarkers();
  },

  // --------------------------------------------------------------------------
  // Traffic Signal State Manipulation (Manual or Automatic)
  // --------------------------------------------------------------------------
  setSignalState(junctionId, greenDirection, isManual = false) {
    if (!this.signals[junctionId]) return;

    const sigs = this.signals[junctionId];
    sigs.activeDir = greenDirection;

    const dirs = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
    dirs.forEach((d) => {
      // OS Mutual Exclusion: only 1 orthogonal phase is GREEN, all others RED
      sigs[d] = (d === greenDirection) ? 'GREEN' : 'RED';
    });

    if (isManual) {
      this.manualOverrides[junctionId] = true;
      const modeBadge = document.getElementById('hud-signal-mode-badge');
      if (modeBadge) {
        modeBadge.textContent = `MANUAL OVERRIDE (J${junctionId})`;
        modeBadge.style.background = '#d97706';
      }
      if (window.SimulationApp && window.SimulationApp.showToast) {
        window.SimulationApp.showToast(`🚦 Manual GREEN override applied to Junction ${junctionId} (${greenDirection})`, 'warning');
      }
    }

    this.renderSignalBulbMarkers();
    this.updateJunctionMarkerColor(junctionId);
  },

  setManualGreen(junctionId, direction) {
    this.setSignalState(junctionId, direction, true);
  },

  restoreAutoSignal(junctionId) {
    delete this.manualOverrides[junctionId];
    const modeBadge = document.getElementById('hud-signal-mode-badge');
    if (modeBadge) {
      modeBadge.textContent = 'ADAPTIVE AUTO';
      modeBadge.style.background = '#1e3a8a';
    }
    if (window.SimulationApp && window.SimulationApp.showToast) {
      window.SimulationApp.showToast(`Junction ${junctionId} restored to automatic scheduling algorithms.`, 'success');
    }
    this.tickSignals();
  },

  // --------------------------------------------------------------------------
  // Leaflet Map Rendering: Junctions, Roads, Stop-Lines & Signal Bulbs
  // --------------------------------------------------------------------------
  update(junctions = [], roads = [], incidents = []) {
    if (!this.map) return;

    this.renderRoads(roads, junctions);
    this.renderJunctions(junctions);
    this.renderIncidents(incidents, junctions);
    this.renderSignalBulbMarkers();
  },

  renderJunctions(junctions) {
    junctions.forEach((j) => {
      const lat = parseFloat(j.location_lat);
      const lng = parseFloat(j.location_lng);
      this.junctionCoords[j.id] = [lat, lng];

      const sigs = this.signals[j.id] || { activeDir: 'NORTH' };
      const activeDir = sigs.activeDir || 'NORTH';
      const color = '#10b981';

      const totalQueued = j.queues ? (j.queues.NORTH + j.queues.SOUTH + j.queues.EAST + j.queues.WEST) : 0;

      const popupContent = `
        <div style="font-family: inherit; font-size: 0.85rem; line-height: 1.4; min-width: 200px;">
          <h4 style="color: #143769; font-weight: 700; margin-bottom: 4px;">${j.name}</h4>
          <p style="margin: 2px 0;"><strong>Active Phase:</strong> <span style="color: #10b981; font-weight: bold;">${activeDir} GREEN</span></p>
          <p style="margin: 2px 0;"><strong>Capacity:</strong> ${j.capacity} vehicles | <strong>Queued:</strong> ${totalQueued}</p>
          
          <div style="margin-top: 8px; font-weight: 700; font-size: 0.75rem; color: #475569;">
            MANUAL TRAFFIC LIGHT CONTROLS:
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 4px;">
            <button class="btn btn-outline" style="padding: 3px; font-size: 0.72rem; justify-content: center;" onclick="TrafficMap.setManualGreen(${j.id}, 'NORTH')">🟢 North Green</button>
            <button class="btn btn-outline" style="padding: 3px; font-size: 0.72rem; justify-content: center;" onclick="TrafficMap.setManualGreen(${j.id}, 'SOUTH')">🟢 South Green</button>
            <button class="btn btn-outline" style="padding: 3px; font-size: 0.72rem; justify-content: center;" onclick="TrafficMap.setManualGreen(${j.id}, 'EAST')">🟢 East Green</button>
            <button class="btn btn-outline" style="padding: 3px; font-size: 0.72rem; justify-content: center;" onclick="TrafficMap.setManualGreen(${j.id}, 'WEST')">🟢 West Green</button>
          </div>
          <div style="margin-top: 6px; display: flex; gap: 4px; justify-content: space-between;">
            <button class="btn btn-success" style="padding: 2px 6px; font-size: 0.7rem;" onclick="TrafficMap.restoreAutoSignal(${j.id})">⚡ Restore Auto</button>
            <button class="btn btn-danger" style="padding: 2px 6px; font-size: 0.7rem;" onclick="SimulationApp.quickAddEmergency(${j.id})">🚨 Add Ambulance</button>
          </div>
        </div>
      `;

      if (this.junctionMarkers[j.id]) {
        this.junctionMarkers[j.id].setLatLng([lat, lng]);
        this.junctionMarkers[j.id].setPopupContent(popupContent);
      } else {
        const marker = L.circleMarker([lat, lng], {
          radius: 14,
          fillColor: '#1e3a8a',
          color: '#ffffff',
          weight: 3,
          opacity: 1,
          fillOpacity: 0.9,
        }).addTo(this.map);

        marker.bindPopup(popupContent);
        marker.bindTooltip(`<b>${j.name}</b><br>Click to control signals`, { direction: 'top' });
        this.junctionMarkers[j.id] = marker;
      }
    });
  },

  updateJunctionMarkerColor(jId) {
    if (this.junctionMarkers[jId]) {
      this.junctionMarkers[jId].setStyle({
        fillColor: this.manualOverrides[jId] ? '#d97706' : '#1e3a8a',
      });
    }
  },

  renderSignalBulbMarkers() {
    const directions = [
      { name: 'NORTH', dLat: 0.0022, dLng: 0 },
      { name: 'SOUTH', dLat: -0.0022, dLng: 0 },
      { name: 'EAST',  dLat: 0, dLng: 0.0028 },
      { name: 'WEST',  dLat: 0, dLng: -0.0028 },
    ];

    [1, 2, 3, 4].forEach((jId) => {
      const center = this.junctionCoords[jId];
      if (!center) return;

      const sigs = this.signals[jId] || { NORTH: 'RED', SOUTH: 'RED', EAST: 'RED', WEST: 'RED' };

      directions.forEach((dirInfo) => {
        const key = `${jId}_${dirInfo.name}`;
        const state = sigs[dirInfo.name] || 'RED';
        const bulbClass = state === 'GREEN' ? 'green' : 'red';
        const bulbLatLng = [center[0] + dirInfo.dLat, center[1] + dirInfo.dLng];

        if (this.signalBulbMarkers[key]) {
          const el = document.getElementById(`sig-bulb-${key}`);
          if (el) {
            el.className = `traffic-signal-bulb-marker ${bulbClass}`;
          }
          this.signalBulbMarkers[key].setLatLng(bulbLatLng);
        } else {
          const customIcon = L.divIcon({
            className: 'traffic-signal-div',
            html: `<div class="traffic-signal-bulb-marker ${bulbClass}" id="sig-bulb-${key}" title="Click to set ${dirInfo.name} signal GREEN for Junction ${jId}"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });

          const bulbMarker = L.marker(bulbLatLng, { icon: customIcon }).addTo(this.map);
          bulbMarker.on('click', () => {
            this.setManualGreen(jId, dirInfo.name);
          });
          this.signalBulbMarkers[key] = bulbMarker;
        }
      });
    });
  },

  renderRoads(roads, junctions) {
    this.roadPolylines.forEach((line) => this.map.removeLayer(line));
    this.roadPolylines = [];

    const jMap = {};
    junctions.forEach((j) => {
      jMap[j.id] = [parseFloat(j.location_lat), parseFloat(j.location_lng)];
    });

    roads.forEach((road) => {
      const srcCoord = jMap[road.source_junction_id];
      const dstCoord = jMap[road.dest_junction_id];

      if (srcCoord && dstCoord) {
        const isClosed = road.is_closed === 1;
        const color = isClosed ? '#ef4444' : '#2563eb';
        const dashArray = isClosed ? '6, 8' : null;

        const polyline = L.polyline([srcCoord, dstCoord], {
          color: color,
          weight: isClosed ? 5 : 4,
          opacity: 0.75,
          dashArray: dashArray,
        }).addTo(this.map);

        polyline.bindPopup(`
          <div style="font-size: 0.85rem;">
            <strong>${road.name}</strong><br>
            Direction: ${road.direction} | Lanes: ${road.lanes}<br>
            Speed Limit: ${road.speed_limit} km/h | Length: ${road.length_meters}m<br>
            Status: <span style="color: ${isClosed ? '#ef4444' : '#10b981'}; font-weight: bold;">
              ${isClosed ? 'CLOSED (Incident)' : 'OPEN'}
            </span>
          </div>
        `);

        this.roadPolylines.push(polyline);
      }
    });
  },

  renderIncidents(incidents, junctions) {
    this.incidentMarkers.forEach((m) => this.map.removeLayer(m));
    this.incidentMarkers = [];

    const jMap = {};
    junctions.forEach((j) => {
      jMap[j.id] = [parseFloat(j.location_lat), parseFloat(j.location_lng)];
    });

    incidents.filter((i) => i.is_active === 1).forEach((inc) => {
      const coord = jMap[inc.junction_id];
      if (coord) {
        const offsetCoord = [coord[0] + 0.002, coord[1] + 0.002];
        const iconHtml = `<div style="background: #dc2626; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">!</div>`;
        const customIcon = L.divIcon({ html: iconHtml, className: 'incident-div-icon', iconSize: [22, 22] });

        const marker = L.marker(offsetCoord, { icon: customIcon }).addTo(this.map);
        marker.bindPopup(`
          <div style="font-size: 0.85rem;">
            <strong style="color: #dc2626;">[INCIDENT] ${inc.incident_type}</strong><br>
            Severity: <b>${inc.severity}</b><br>
            Description: ${inc.description}<br>
            Junction: ${inc.junction_name || 'Junction ' + inc.junction_id}
          </div>
        `);

        this.incidentMarkers.push(marker);
      }
    });
  },
};
