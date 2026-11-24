// ============================================================================
// SmartTraffic Simulation Controller & UI Updater
// Complete Interactive Vehicle Queue & Input Management
// ============================================================================

const SimulationApp = {
  currentSimId: 1,
  pollTimer: null,
  pollIntervalMs: 1200,
  isPolling: false,

  // Cache & Filter State
  cachedJunctions: [],
  allVehicles: [],
  filters: {
    search: '',
    junction: '',
    direction: '',
    status: '',
    emergencyOnly: false,
  },

  init() {
    this.bindEvents();
    this.refreshState();
    this.startPolling();
  },

  startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.refreshState();
    }, this.pollIntervalMs);
    this.isPolling = true;
  },

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.isPolling = false;
  },

  // --------------------------------------------------------------------------
  // Toast Notifications
  // --------------------------------------------------------------------------
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${message}</span>
      <button style="background:none;border:none;color:white;font-weight:bold;cursor:pointer;font-size:1.1rem;line-height:1;" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 350);
    }, 3500);
  },

  // --------------------------------------------------------------------------
  // Core Polling & State Update
  // --------------------------------------------------------------------------
  async refreshState() {
    try {
      const resp = await Api.getSimulationState(this.currentSimId);
      if (resp && resp.data) {
        if (resp.data.junctions && resp.data.junctions.length > 0) {
          this.cachedJunctions = resp.data.junctions;
          this.populateJunctionDropdowns(resp.data.junctions);
        }
        this.renderKPIs(resp.data.summary);
        this.renderJunctions(resp.data.junctions);
        this.renderEvents(resp.data.recent_events);
        this.renderIncidents(resp.data.incidents);

        // Sync map
        const roadsResp = await Api.getRoads();
        TrafficMap.update(resp.data.junctions, roadsResp.data || [], resp.data.incidents || []);
      }

      // Fetch all vehicles
      const vehResp = await Api.getVehicles({ simulation_id: this.currentSimId });
      if (vehResp && vehResp.data) {
        this.allVehicles = vehResp.data;
        this.renderVehicles(vehResp.data);
      }
    } catch (err) {
      console.warn("Polling state fetch error:", err);
    }
  },

  // --------------------------------------------------------------------------
  // Populate Junction Select Dropdowns Dynamically
  // --------------------------------------------------------------------------
  populateJunctionDropdowns(junctions) {
    const selects = [
      { id: 'veh-junction', includeAll: false },
      { id: 'filter-junction-select', includeAll: true },
      { id: 'batch-junction', includeAll: false, randomOption: true },
      { id: 'inc-junction', includeAll: false },
    ];

    selects.forEach(({ id, includeAll, randomOption }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const curVal = el.value;

      let html = '';
      if (includeAll) {
        html += '<option value="">All Junctions</option>';
      }
      if (randomOption) {
        html += '<option value="RANDOM">Randomized Across All Junctions</option>';
      }

      junctions.forEach((j) => {
        html += `<option value="${j.id}">${j.name}</option>`;
      });

      // Only update if options changed
      if (el.innerHTML !== html) {
        el.innerHTML = html;
        if (curVal && [...el.options].some(o => o.value === curVal)) {
          el.value = curVal;
        }
      }
    });
  },

  // --------------------------------------------------------------------------
  // KPI Display
  // --------------------------------------------------------------------------
  renderKPIs(summary) {
    if (!summary) return;
    document.getElementById('kpi-total-vehicles').textContent = summary.total_vehicles || 0;
    document.getElementById('kpi-active-vehicles').textContent = summary.active_vehicles || 0;
    document.getElementById('kpi-waiting-vehicles').textContent = summary.waiting_vehicles || 0;
    document.getElementById('kpi-emergency-vehicles').textContent = summary.emergency_vehicles || 0;
    document.getElementById('kpi-avg-wait').textContent = (summary.avg_waiting_time || 0).toFixed(2);
    document.getElementById('kpi-avg-tat').textContent = (summary.avg_turnaround_time || 0).toFixed(2);
    document.getElementById('kpi-throughput').textContent = (summary.throughput || 0).toFixed(3);
    document.getElementById('kpi-sim-tick').textContent = summary.current_tick || 0;

    const statusBadge = document.getElementById('sim-status-badge');
    if (statusBadge && summary.status) {
      statusBadge.textContent = summary.status;
      statusBadge.className = `badge badge-${summary.status.toLowerCase()}`;
    }
  },

  // --------------------------------------------------------------------------
  // Junction Controller Cards
  // --------------------------------------------------------------------------
  renderJunctions(junctions) {
    const container = document.getElementById('junctions-container');
    if (!container || !junctions) return;

    container.innerHTML = junctions.map((j) => {
      const activeDir = j.active_direction || 'NORTH';
      const sigs = j.signals || {};
      const queues = j.queues || { NORTH: 0, SOUTH: 0, EAST: 0, WEST: 0 };
      const directions = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

      const dirCards = directions.map((dir) => {
        const s = sigs[dir] || { state: 'RED', green_time: 15 };
        return `
          <div class="direction-light-box" title="Click to manually set GREEN for ${dir}" onclick="SimulationApp.setManualSignal(${j.id}, '${dir}')">
            <span class="dir-label">${dir}</span>
            <div class="light-bulb ${s.state}"></div>
            <span class="dir-queue-count">${queues[dir] || 0} veh</span>
            <span style="font-size: 0.65rem; color: #94a3b8;">${s.green_time}s</span>
          </div>
        `;
      }).join('');

      return `
        <div class="junction-card" id="junc-card-${j.id}">
          <div class="junction-card-top">
            <div>
              <div class="junc-name">${j.name}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">Capacity: ${j.capacity} | Status: <b>${j.status}</b></div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              <span class="junc-phase-badge green-active">${activeDir} GREEN</span>
              <div style="display: flex; gap: 4px;">
                <button class="btn btn-outline" style="padding: 2px 6px; font-size: 0.7rem;" onclick="SimulationApp.openAddVehicleModal(${j.id})" title="Add vehicle here">+ Veh</button>
                <button class="btn btn-outline" style="padding: 2px 6px; font-size: 0.7rem;" onclick="SimulationApp.restoreAutoSignal(${j.id})">Auto</button>
              </div>
            </div>
          </div>
          <div class="signals-row">
            ${dirCards}
          </div>
        </div>
      `;
    }).join('');
  },

  // --------------------------------------------------------------------------
  // Vehicle Queue Table with Filtering
  // --------------------------------------------------------------------------
  getFilteredVehicles() {
    let list = this.allVehicles || [];
    const { search, junction, direction, status, emergencyOnly } = this.filters;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        (v.plate_number && v.plate_number.toLowerCase().includes(q)) ||
        (v.vehicle_type && v.vehicle_type.toLowerCase().includes(q)) ||
        String(v.id).includes(q)
      );
    }

    if (junction) {
      list = list.filter(v => String(v.junction_id) === String(junction));
    }

    if (direction) {
      list = list.filter(v => v.direction === direction);
    }

    if (status) {
      list = list.filter(v => v.status === status);
    }

    if (emergencyOnly) {
      list = list.filter(v => v.is_emergency === 1);
    }

    return list;
  },

  getVehicleIcon(vType, isEmergency) {
    if (isEmergency) {
      if (vType === 'Ambulance') return '🚑';
      if (vType === 'Fire Truck') return '🚒';
      if (vType === 'Police') return '🚓';
      return '🚨';
    }
    switch (vType) {
      case 'Bus': return '🚌';
      case 'Truck': return '🚚';
      case 'Motorcycle': return '🏍️';
      case 'Car':
      default: return '🚗';
    }
  },

  getJunctionName(junctionId) {
    const j = this.cachedJunctions.find(item => item.id === junctionId);
    return j ? j.name : `Junction ${junctionId}`;
  },

  renderVehicles(vehicles) {
    const tbody = document.getElementById('vehicles-table-body');
    const counterPill = document.getElementById('veh-counter-pill');
    if (!tbody) return;

    const filtered = this.getFilteredVehicles();
    const emergCount = (this.allVehicles || []).filter(v => v.is_emergency === 1).length;

    if (counterPill) {
      counterPill.textContent = `${filtered.length} of ${this.allVehicles.length} Vehicles (${emergCount} 🚨)`;
    }

    if (!filtered || filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No vehicles found matching current criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((v) => {
      const isEmerg = v.is_emergency === 1;
      const icon = this.getVehicleIcon(v.vehicle_type, isEmerg);
      const statusClass = v.status === 'COMPLETED' ? 'badge-completed' : v.status === 'RUNNING' ? 'badge-running' : 'badge-waiting';
      const jName = this.getJunctionName(v.junction_id);
      const remainingDisplay = (v.remaining_time !== undefined && v.remaining_time !== null && v.status === 'RUNNING')
        ? `<span style="color: var(--accent); font-weight:bold;">${v.remaining_time}s</span> / ${v.burst_time}s`
        : `${v.burst_time}s`;

      return `
        <tr>
          <td><b>#${v.id}</b></td>
          <td>
            <span style="font-size: 1.05rem; margin-right: 4px;">${icon}</span>
            <b title="${v.source || 'Origin'} ➔ ${v.destination || 'Destination'}">${v.plate_number}</b>
          </td>
          <td>${v.vehicle_type}</td>
          <td title="${jName}">${jName}</td>
          <td><b>${v.direction}</b></td>
          <td>${v.arrival_time}s</td>
          <td>${remainingDisplay}</td>
          <td>
            ${isEmerg
              ? '<span class="badge badge-emergency">EMERGENCY (1)</span>'
              : `<span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:600;">Priority ${v.priority}</span>`}
          </td>
          <td><span class="badge ${statusClass}">${v.status}</span></td>
          <td>${v.waiting_time}s</td>
          <td>
            <div style="display: flex; gap: 3px; align-items: center;">
              <button class="table-action-btn btn-edit" onclick="SimulationApp.openEditModal(${v.id})" title="Edit parameters">✏️</button>
              <button class="table-action-btn btn-boost" onclick="SimulationApp.boostPriority(${v.id})" title="Boost priority by 1">⚡</button>
              <button class="table-action-btn btn-del" onclick="SimulationApp.deleteVehicle(${v.id})" title="Delete Vehicle">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  // --------------------------------------------------------------------------
  // Audit Logs & Incidents
  // --------------------------------------------------------------------------
  renderEvents(events) {
    const container = document.getElementById('events-stream');
    if (!container) return;

    if (!events || events.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.82rem;">No recent scheduling events.</p>`;
      return;
    }

    container.innerHTML = events.slice(0, 8).map((ev) => `
      <div style="font-size: 0.78rem; padding: 4px 0; border-bottom: 1px dashed var(--border);">
        <span style="color: var(--accent); font-weight: bold;">[T=${ev.event_time}s]</span>
        <b>${ev.event_type}</b> - ${ev.details || ''}
      </div>
    `).join('');
  },

  renderIncidents(incidents) {
    const tbody = document.getElementById('incidents-table-body');
    if (!tbody) return;

    if (!incidents || incidents.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No active traffic incidents.</td></tr>`;
      return;
    }

    tbody.innerHTML = incidents.map((inc) => `
      <tr>
        <td><b>${inc.incident_type}</b></td>
        <td><span class="badge ${inc.is_active ? 'badge-emergency' : 'badge-completed'}">${inc.severity}</span></td>
        <td>${inc.junction_name || 'Junction ' + inc.junction_id}</td>
        <td>${inc.description}</td>
        <td><span class="badge ${inc.is_active ? 'badge-emergency' : 'badge-completed'}">${inc.is_active ? 'ACTIVE' : 'RESOLVED'}</span></td>
        <td>
          ${inc.is_active ? `<button class="btn btn-success" style="padding: 2px 6px; font-size: 0.75rem;" onclick="SimulationApp.resolveIncident(${inc.id})">Resolve</button>` : 'Resolved'}
        </td>
      </tr>
    `).join('');
  },

  // --------------------------------------------------------------------------
  // Random Plate & Presets Generator
  // --------------------------------------------------------------------------
  generateRandomPlate(vType = 'Car') {
    const seriesMap = {
      'Ambulance': ['AM', 'EM', 'AX'],
      'Police': ['PC', 'DL', 'PL'],
      'Fire Truck': ['FT', 'FR', 'FD'],
      'Bus': ['PA', 'PB', 'BS'],
      'Truck': ['TK', 'TR', 'TC'],
      'Motorcycle': ['MC', 'BK', 'TW'],
      'Car': ['AB', 'CB', 'XY', 'RT', 'DE'],
    };
    const seriesList = seriesMap[vType] || seriesMap['Car'];
    const s = seriesList[Math.floor(Math.random() * seriesList.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `UK07-${s}-${num}`;
  },

  applyPreset(presetKey) {
    const presets = {
      car: { type: 'Car', burst: 3, priority: 3, emergency: false },
      bus: { type: 'Bus', burst: 5, priority: 2, emergency: false },
      truck: { type: 'Truck', burst: 6, priority: 3, emergency: false },
      bike: { type: 'Motorcycle', burst: 1, priority: 4, emergency: false },
      ambulance: { type: 'Ambulance', burst: 2, priority: 1, emergency: true },
      fire: { type: 'Fire Truck', burst: 3, priority: 1, emergency: true },
      police: { type: 'Police', burst: 2, priority: 1, emergency: true },
    };

    const p = presets[presetKey];
    if (!p) return;

    document.getElementById('veh-type').value = p.type;
    document.getElementById('veh-burst').value = p.burst;
    document.getElementById('veh-priority').value = p.priority;
    const emCheck = document.getElementById('veh-emergency');
    emCheck.checked = p.emergency;

    // Generate plate matching type
    document.getElementById('veh-plate').value = this.generateRandomPlate(p.type);

    // Visual active state on preset chips
    document.querySelectorAll('.preset-pill').forEach(btn => btn.classList.remove('active'));
    const clickedBtn = document.querySelector(`.preset-pill[data-preset="${presetKey}"]`);
    if (clickedBtn) clickedBtn.classList.add('active');
  },

  // --------------------------------------------------------------------------
  // Modal Open / Close Handlers
  // --------------------------------------------------------------------------
  openAddVehicleModal(targetJunctionId = null, presetKey = null) {
    const modal = document.getElementById('modal-add-vehicle');
    if (!modal) return;

    // Reset form
    document.getElementById('form-add-vehicle')?.reset();

    // Set junction if provided
    if (targetJunctionId) {
      const jSelect = document.getElementById('veh-junction');
      if (jSelect) jSelect.value = String(targetJunctionId);
    }

    // Apply preset or default car
    if (presetKey) {
      this.applyPreset(presetKey);
    } else {
      this.applyPreset('car');
    }

    modal.classList.add('active');
    document.getElementById('veh-plate')?.focus();
  },

  closeAddVehicleModal() {
    const modal = document.getElementById('modal-add-vehicle');
    if (modal) modal.classList.remove('active');
  },

  openEditModal(vId) {
    const vehicle = (this.allVehicles || []).find(v => v.id === vId);
    if (!vehicle) {
      this.showToast(`Vehicle #${vId} not found`, 'error');
      return;
    }

    document.getElementById('edit-veh-id').value = vehicle.id;
    document.getElementById('edit-veh-id-display').value = `#${vehicle.id} (${vehicle.vehicle_type})`;
    document.getElementById('edit-veh-plate').value = vehicle.plate_number;
    document.getElementById('edit-veh-priority').value = vehicle.priority;
    document.getElementById('edit-veh-burst').value = vehicle.burst_time;
    document.getElementById('edit-veh-status').value = vehicle.status;

    const editModal = document.getElementById('modal-edit-vehicle');
    if (editModal) editModal.classList.add('active');
  },

  closeEditModal() {
    const modal = document.getElementById('modal-edit-vehicle');
    if (modal) modal.classList.remove('active');
  },

  openBatchModal() {
    const modal = document.getElementById('modal-batch-vehicles');
    if (modal) modal.classList.add('active');
  },

  closeBatchModal() {
    const modal = document.getElementById('modal-batch-vehicles');
    if (modal) modal.classList.remove('active');
  },

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  },

  // --------------------------------------------------------------------------
  // Quick Actions & Vehicle CRUD
  // --------------------------------------------------------------------------
  async quickAddEmergency(junctionId = null) {
    const targetJunction = junctionId || (this.cachedJunctions.length > 0 ? this.cachedJunctions[0].id : 1);
    const directions = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
    const randomDir = directions[Math.floor(Math.random() * directions.length)];
    const plate = this.generateRandomPlate('Ambulance');

    const payload = {
      simulation_id: this.currentSimId,
      plate_number: plate,
      vehicle_type: 'Ambulance',
      junction_id: parseInt(targetJunction, 10),
      direction: randomDir,
      arrival_time: 0,
      burst_time: 2,
      priority: 1,
      is_emergency: 1,
      source: 'Hospital Corridor',
      destination: 'Central Care Unit',
    };

    try {
      await Api.createVehicle(payload);
      if (window.TrafficMap && window.TrafficMap.createVehicleObject) {
        window.TrafficMap.createVehicleObject(plate, 'Ambulance', parseInt(targetJunction, 10), randomDir, true);
      }
      this.showToast(`🚨 Priority 1 Ambulance (${plate}) injected at Junction ${targetJunction}!`, 'success');
      this.refreshState();
    } catch (err) {
      this.showToast(`Failed to inject emergency vehicle: ${err.message}`, 'error');
    }
  },

  async boostPriority(vId) {
    const v = (this.allVehicles || []).find(item => item.id === vId);
    if (!v) return;

    let newPriority = v.priority - 1;
    if (newPriority < 1) newPriority = 1;

    try {
      await Api.updateVehicle(vId, { priority: newPriority });
      this.showToast(`⚡ Priority for ${v.plate_number} elevated to P${newPriority}!`, 'info');
      this.refreshState();
    } catch (err) {
      this.showToast(`Failed to boost priority: ${err.message}`, 'error');
    }
  },

  async deleteVehicle(vId) {
    const v = (this.allVehicles || []).find(item => item.id === vId);
    const label = v ? `${v.plate_number} (#${v.id})` : `#${vId}`;
    if (!confirm(`Delete vehicle ${label} from process queue?`)) return;

    try {
      await Api.deleteVehicle(vId);
      this.showToast(`Vehicle ${label} deleted successfully.`, 'info');
      this.refreshState();
    } catch (err) {
      this.showToast(`Error deleting vehicle: ${err.message}`, 'error');
    }
  },

  async clearVehicles(statusFilter = null) {
    const isAll = !statusFilter;
    const msg = isAll
      ? 'Are you sure you want to CLEAR ALL vehicles from the simulation queue?'
      : 'Clear all COMPLETED vehicles from the process table?';

    if (!confirm(msg)) return;

    try {
      const params = { simulation_id: this.currentSimId };
      if (statusFilter) params.status = statusFilter;
      await Api.clearVehicles(params);
      this.showToast(isAll ? 'All vehicles cleared from queue.' : 'Completed vehicles removed.', 'info');
      this.refreshState();
    } catch (err) {
      this.showToast(`Error clearing vehicles: ${err.message}`, 'error');
    }
  },

  async spawnBatchVehicles() {
    const count = parseInt(document.getElementById('batch-count').value, 10) || 5;
    const targetJunction = document.getElementById('batch-junction').value;
    const mix = document.getElementById('batch-type-mix').value;
    const includeEmergency = document.getElementById('batch-include-emergency').checked;

    const junctions = this.cachedJunctions.length > 0 ? this.cachedJunctions.map(j => j.id) : [1, 2, 3, 4];
    const directions = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
    const routes = [
      { src: 'Rajpur Road', dst: 'Clock Tower' },
      { src: 'Ballupur Chowk', dst: 'ISBT Dehradun' },
      { src: 'Prince Chowk', dst: 'Haridwar Road' },
      { src: 'Chakrata Road', dst: 'Clock Tower' },
    ];

    const vehicles = [];
    for (let i = 0; i < count; i++) {
      let isEmerg = (i === 0 && includeEmergency);
      let vType = 'Car';
      let burst = 3;
      let priority = 3;

      if (isEmerg) {
        vType = 'Ambulance';
        burst = 2;
        priority = 1;
      } else if (mix === 'HEAVY') {
        vType = Math.random() > 0.5 ? 'Bus' : 'Truck';
        burst = vType === 'Bus' ? 5 : 6;
        priority = vType === 'Bus' ? 2 : 4;
      } else if (mix === 'CARS_ONLY') {
        vType = 'Car';
        burst = 3;
        priority = 3;
      } else if (mix === 'EMERGENCY_SURGE') {
        const emergTypes = ['Ambulance', 'Fire Truck', 'Police'];
        vType = emergTypes[Math.floor(Math.random() * emergTypes.length)];
        burst = 2;
        priority = 1;
        isEmerg = true;
      } else {
        const roll = Math.random();
        if (roll < 0.50) { vType = 'Car'; burst = 3; priority = 3; }
        else if (roll < 0.70) { vType = 'Motorcycle'; burst = 1; priority = 4; }
        else if (roll < 0.85) { vType = 'Bus'; burst = 5; priority = 2; }
        else { vType = 'Truck'; burst = 6; priority = 4; }
      }

      const jId = targetJunction === 'RANDOM'
        ? junctions[Math.floor(Math.random() * junctions.length)]
        : parseInt(targetJunction, 10);

      const dir = directions[Math.floor(Math.random() * directions.length)];
      const route = routes[Math.floor(Math.random() * routes.length)];
      const plate = this.generateRandomPlate(vType);

      vehicles.push({
        simulation_id: this.currentSimId,
        plate_number: plate,
        vehicle_type: vType,
        junction_id: jId,
        direction: dir,
        arrival_time: Math.floor(Math.random() * 3),
        burst_time: burst,
        priority: priority,
        is_emergency: isEmerg ? 1 : 0,
        source: route.src,
        destination: route.dst,
      });
    }

    try {
      await Api.createVehiclesBatch({
        simulation_id: this.currentSimId,
        vehicles: vehicles,
      });
      this.closeBatchModal();
      this.showToast(`🎲 Injected batch of ${count} vehicles into traffic flow!`, 'success');
      this.refreshState();
    } catch (err) {
      this.showToast(`Batch generation failed: ${err.message}`, 'error');
    }
  },

  // --------------------------------------------------------------------------
  // Simulation Lifecycle Actions
  // --------------------------------------------------------------------------
  async startSimulation() {
    const alg = document.getElementById('select-algorithm').value;
    const quantum = parseInt(document.getElementById('input-quantum').value, 10) || 2;
    const scenario = document.getElementById('select-scenario').value;

    try {
      const resp = await Api.startSimulation(this.currentSimId, {
        algorithm: alg,
        quantum: quantum,
        scenario: scenario,
      });
      this.showToast(`Engine running with ${alg} scheduling!`, 'success');
      this.refreshState();
    } catch (err) {
      this.showToast(`Error starting simulation: ${err.message}`, 'error');
    }
  },

  async pauseSimulation() {
    try {
      await Api.pauseSimulation(this.currentSimId);
      this.showToast('Simulation paused.', 'info');
      this.refreshState();
    } catch (err) {
      this.showToast(`Error: ${err.message}`, 'error');
    }
  },

  async resumeSimulation() {
    try {
      await Api.resumeSimulation(this.currentSimId);
      this.showToast('Simulation resumed.', 'success');
      this.refreshState();
    } catch (err) {
      this.showToast(`Error: ${err.message}`, 'error');
    }
  },

  async resetSimulation() {
    try {
      await Api.resetSimulation(this.currentSimId);
      this.showToast('Simulation reset. Signals & baseline state restored.', 'info');
      this.refreshState();
    } catch (err) {
      this.showToast(`Error: ${err.message}`, 'error');
    }
  },

  async setManualSignal(junctionId, direction) {
    try {
      if (window.TrafficMap && window.TrafficMap.setManualGreen) {
        window.TrafficMap.setManualGreen(junctionId, direction);
      }
      await Api.setManualSignal({
        junction_id: junctionId,
        direction: direction,
        green_time: 25,
        simulation_id: this.currentSimId,
      });
      this.showToast(`Manual GREEN override set for Junction ${junctionId} (${direction}).`, 'info');
      this.refreshState();
    } catch (err) {
      this.showToast(`Manual Signal Error: ${err.message}`, 'error');
    }
  },

  async restoreAutoSignal(junctionId) {
    try {
      if (window.TrafficMap && window.TrafficMap.restoreAutoSignal) {
        window.TrafficMap.restoreAutoSignal(junctionId);
      }
      await Api.setAutomaticSignal({ junction_id: junctionId, simulation_id: this.currentSimId });
      this.showToast(`Junction ${junctionId} restored to automatic scheduling.`, 'success');
      this.refreshState();
    } catch (err) {
      this.showToast(`Error: ${err.message}`, 'error');
    }
  },

  async resolveIncident(incId) {
    try {
      await Api.resolveIncident(incId);
      this.showToast('Incident resolved and road corridor restored.', 'success');
      this.refreshState();
    } catch (err) {
      this.showToast(`Error: ${err.message}`, 'error');
    }
  },

  // --------------------------------------------------------------------------
  // Event Bindings
  // --------------------------------------------------------------------------
  bindEvents() {
    // Engine lifecycle
    document.getElementById('btn-start-sim')?.addEventListener('click', () => this.startSimulation());
    document.getElementById('btn-pause-sim')?.addEventListener('click', () => this.pauseSimulation());
    document.getElementById('btn-resume-sim')?.addEventListener('click', () => this.resumeSimulation());
    document.getElementById('btn-reset-sim')?.addEventListener('click', () => this.resetSimulation());

    // Scenario switch
    document.getElementById('select-scenario')?.addEventListener('change', async (e) => {
      const scen = e.target.value;
      if (confirm(`Switch to "${scen}" scenario? This will seed corresponding vehicle flow.`)) {
        await Api.startSimulation(this.currentSimId, {
          scenario: scen,
          force_reseed: true,
          algorithm: document.getElementById('select-algorithm').value,
          quantum: parseInt(document.getElementById('input-quantum').value, 10) || 2
        });
        if (window.TrafficMap && window.TrafficMap.resetFleet) {
          window.TrafficMap.resetFleet();
        }
        this.refreshState();
      }
    });

    // Quick vehicle action buttons
    document.getElementById('btn-open-add-vehicle')?.addEventListener('click', () => this.openAddVehicleModal());
    document.getElementById('btn-close-add-vehicle')?.addEventListener('click', () => this.closeAddVehicleModal());
    document.getElementById('btn-cancel-add-vehicle')?.addEventListener('click', () => this.closeAddVehicleModal());

    document.getElementById('btn-quick-emergency')?.addEventListener('click', () => this.quickAddEmergency());
    document.getElementById('btn-open-batch-modal')?.addEventListener('click', () => this.openBatchModal());
    document.getElementById('btn-close-batch-modal')?.addEventListener('click', () => this.closeBatchModal());
    document.getElementById('btn-cancel-batch-modal')?.addEventListener('click', () => this.closeBatchModal());

    document.getElementById('btn-clear-completed')?.addEventListener('click', () => this.clearVehicles('COMPLETED'));
    document.getElementById('btn-clear-all')?.addEventListener('click', () => this.clearVehicles(null));

    // Preset chips
    document.querySelectorAll('.preset-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const presetKey = btn.getAttribute('data-preset');
        if (presetKey) this.applyPreset(presetKey);
      });
    });

    // Auto Plate randomizer button
    document.getElementById('btn-random-plate')?.addEventListener('click', () => {
      const vType = document.getElementById('veh-type').value;
      document.getElementById('veh-plate').value = this.generateRandomPlate(vType);
    });

    // Vehicle Type change -> auto-tune priority & burst recommendation
    document.getElementById('veh-type')?.addEventListener('change', (e) => {
      const val = e.target.value;
      const emCheck = document.getElementById('veh-emergency');
      const pInput = document.getElementById('veh-priority');
      const bInput = document.getElementById('veh-burst');

      if (val === 'Ambulance' || val === 'Fire Truck' || val === 'Police') {
        emCheck.checked = true;
        pInput.value = 1;
        bInput.value = val === 'Ambulance' ? 2 : 3;
      } else {
        emCheck.checked = false;
        if (val === 'Bus') { pInput.value = 2; bInput.value = 5; }
        else if (val === 'Truck') { pInput.value = 3; bInput.value = 6; }
        else if (val === 'Motorcycle') { pInput.value = 4; bInput.value = 1; }
        else { pInput.value = 3; bInput.value = 3; }
      }
      document.getElementById('veh-plate').value = this.generateRandomPlate(val);
    });

    // Emergency checkbox toggle
    document.getElementById('veh-emergency')?.addEventListener('change', (e) => {
      const pInput = document.getElementById('veh-priority');
      if (e.target.checked) {
        pInput.value = 1;
      } else {
        pInput.value = 3;
      }
    });

    // Add Vehicle Form Submit
    document.getElementById('form-add-vehicle')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        simulation_id: this.currentSimId,
        plate_number: document.getElementById('veh-plate').value.trim(),
        vehicle_type: document.getElementById('veh-type').value,
        junction_id: parseInt(document.getElementById('veh-junction').value, 10),
        direction: document.getElementById('veh-direction').value,
        arrival_time: parseInt(document.getElementById('veh-arrival').value, 10) || 0,
        burst_time: parseInt(document.getElementById('veh-burst').value, 10) || 2,
        priority: parseInt(document.getElementById('veh-priority').value, 10) || 3,
        is_emergency: document.getElementById('veh-emergency').checked ? 1 : 0,
        source: document.getElementById('veh-source').value.trim() || 'Origin',
        destination: document.getElementById('veh-destination').value.trim() || 'Destination',
      };

      try {
        const resp = await Api.createVehicle(payload);
        if (window.TrafficMap && window.TrafficMap.createVehicleObject) {
          window.TrafficMap.createVehicleObject(
            payload.plate_number,
            payload.vehicle_type,
            payload.junction_id,
            payload.direction,
            payload.is_emergency === 1
          );
        }
        this.closeAddVehicleModal();
        this.showToast(`Vehicle ${resp.data.plate_number} created successfully!`, 'success');
        this.refreshState();
      } catch (err) {
        this.showToast(`Validation Error: ${err.message}`, 'error');
      }
    });

    // Edit Vehicle Form Submit
    document.getElementById('form-edit-vehicle')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const vId = parseInt(document.getElementById('edit-veh-id').value, 10);
      const payload = {
        priority: parseInt(document.getElementById('edit-veh-priority').value, 10) || 3,
        burst_time: parseInt(document.getElementById('edit-veh-burst').value, 10) || 2,
        status: document.getElementById('edit-veh-status').value,
      };

      try {
        await Api.updateVehicle(vId, payload);
        this.closeEditModal();
        this.showToast(`Vehicle #${vId} parameters updated!`, 'success');
        this.refreshState();
      } catch (err) {
        this.showToast(`Update failed: ${err.message}`, 'error');
      }
    });
    document.getElementById('btn-close-edit-vehicle')?.addEventListener('click', () => this.closeEditModal());
    document.getElementById('btn-cancel-edit-vehicle')?.addEventListener('click', () => this.closeEditModal());

    // Batch Spawn Form Submit
    document.getElementById('form-batch-vehicles')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.spawnBatchVehicles();
    });

    // Filter toolbar events
    document.getElementById('veh-search-input')?.addEventListener('input', (e) => {
      this.filters.search = e.target.value.trim();
      this.renderVehicles(this.allVehicles);
    });

    document.getElementById('filter-junction-select')?.addEventListener('change', (e) => {
      this.filters.junction = e.target.value;
      this.renderVehicles(this.allVehicles);
    });

    document.getElementById('filter-direction-select')?.addEventListener('change', (e) => {
      this.filters.direction = e.target.value;
      this.renderVehicles(this.allVehicles);
    });

    document.getElementById('filter-status-select')?.addEventListener('change', (e) => {
      this.filters.status = e.target.value;
      this.renderVehicles(this.allVehicles);
    });

    document.getElementById('filter-emergency-check')?.addEventListener('change', (e) => {
      this.filters.emergencyOnly = e.target.checked;
      this.renderVehicles(this.allVehicles);
    });

    // Close modals when clicking overlay background
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeAllModals();
        }
      });
    });

    // Close on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });

    // Incident Modal
    const incModal = document.getElementById('modal-add-incident');
    document.getElementById('btn-open-add-incident')?.addEventListener('click', () => {
      incModal.classList.add('active');
    });
    document.getElementById('btn-close-add-incident')?.addEventListener('click', () => {
      incModal.classList.remove('active');
    });

    document.getElementById('form-add-incident')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        simulation_id: this.currentSimId,
        incident_type: document.getElementById('inc-type').value,
        severity: document.getElementById('inc-severity').value,
        junction_id: parseInt(document.getElementById('inc-junction').value, 10),
        description: document.getElementById('inc-desc').value.trim() || 'Traffic disruption incident',
      };

      try {
        await Api.createIncident(payload);
        incModal.classList.remove('active');
        this.showToast('Incident reported successfully.', 'success');
        this.refreshState();
      } catch (err) {
        this.showToast(`Error creating incident: ${err.message}`, 'error');
      }
    });
  },
};
