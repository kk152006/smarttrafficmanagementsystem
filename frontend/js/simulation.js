// ============================================================================
// SmartTraffic Simulation Controller & UI Updater
// ============================================================================

const SimulationApp = {
  currentSimId: 1,
  pollTimer: null,
  pollIntervalMs: 1200,
  isPolling: false,

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

  async refreshState() {
    try {
      const resp = await Api.getSimulationState(this.currentSimId);
      if (resp && resp.data) {
        this.renderKPIs(resp.data.summary);
        this.renderJunctions(resp.data.junctions);
        this.renderEvents(resp.data.recent_events);
        this.renderIncidents(resp.data.incidents);

        // Fetch roads and sync map
        const roadsResp = await Api.getRoads();
        TrafficMap.update(resp.data.junctions, roadsResp.data || [], resp.data.incidents || []);
      }

      // Also refresh vehicle table
      const vehResp = await Api.getVehicles({ simulation_id: this.currentSimId });
      if (vehResp && vehResp.data) {
        this.renderVehicles(vehResp.data);
      }
    } catch (err) {
      console.warn("Polling state fetch:", err);
    }
  },

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
        const isGreen = s.state === 'GREEN';
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
              <button class="btn btn-outline" style="padding: 2px 6px; font-size: 0.7rem;" onclick="SimulationApp.restoreAutoSignal(${j.id})">Auto Mode</button>
            </div>
          </div>
          <div class="signals-row">
            ${dirCards}
          </div>
        </div>
      `;
    }).join('');
  },

  renderVehicles(vehicles) {
    const tbody = document.getElementById('vehicles-table-body');
    if (!tbody) return;

    if (!vehicles || vehicles.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted);">No vehicles in queue.</td></tr>`;
      return;
    }

    tbody.innerHTML = vehicles.map((v) => {
      const isEmerg = v.is_emergency === 1;
      const statusClass = v.status === 'COMPLETED' ? 'badge-completed' : v.status === 'RUNNING' ? 'badge-running' : 'badge-waiting';
      return `
        <tr>
          <td><b>#${v.id}</b></td>
          <td>${v.plate_number}</td>
          <td>${v.vehicle_type}</td>
          <td>Junction ${v.junction_id}</td>
          <td><b>${v.direction}</b></td>
          <td>${v.arrival_time}s</td>
          <td>
            ${isEmerg ? '<span class="badge badge-emergency">EMERGENCY (1)</span>' : `Priority ${v.priority}`}
          </td>
          <td><span class="badge ${statusClass}">${v.status}</span></td>
          <td>${v.waiting_time}s</td>
          <td>
            <button class="btn btn-outline" style="padding: 2px 6px; font-size: 0.75rem; color: #ef4444;" onclick="SimulationApp.deleteVehicle(${v.id})">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  },

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
      alert(`Simulation started with ${alg} scheduling!\nMetrics Calculated: Avg WT=${resp.data.metrics.avg_waiting_time}s, Throughput=${resp.data.metrics.throughput}`);
      this.refreshState();
    } catch (err) {
      alert(`Error starting simulation: ${err.message}`);
    }
  },

  async pauseSimulation() {
    try {
      await Api.pauseSimulation(this.currentSimId);
      this.refreshState();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  },

  async resumeSimulation() {
    try {
      await Api.resumeSimulation(this.currentSimId);
      this.refreshState();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  },

  async resetSimulation() {
    try {
      await Api.resetSimulation(this.currentSimId);
      alert('Simulation reset. All queues and signals restored to baseline.');
      this.refreshState();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  },

  async setManualSignal(junctionId, direction) {
    try {
      const resp = await Api.setManualSignal({
        junction_id: junctionId,
        direction: direction,
        green_time: 25,
        simulation_id: this.currentSimId,
      });
      this.refreshState();
    } catch (err) {
      alert(`Manual Signal Error: ${err.message}`);
    }
  },

  async restoreAutoSignal(junctionId) {
    try {
      await Api.setAutomaticSignal({ junction_id: junctionId, simulation_id: this.currentSimId });
      this.refreshState();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  },

  async deleteVehicle(vId) {
    if (!confirm(`Delete vehicle #${vId}?`)) return;
    try {
      await Api.deleteVehicle(vId);
      this.refreshState();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  },

  async resolveIncident(incId) {
    try {
      await Api.resolveIncident(incId);
      alert('Incident resolved and road flow restored.');
      this.refreshState();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  },

  bindEvents() {
    document.getElementById('btn-start-sim')?.addEventListener('click', () => this.startSimulation());
    document.getElementById('btn-pause-sim')?.addEventListener('click', () => this.pauseSimulation());
    document.getElementById('btn-resume-sim')?.addEventListener('click', () => this.resumeSimulation());
    document.getElementById('btn-reset-sim')?.addEventListener('click', () => this.resetSimulation());

    // Scenario switch handler
    document.getElementById('select-scenario')?.addEventListener('change', async (e) => {
      const scen = e.target.value;
      if (confirm(`Switch to "${scen}" scenario? This will seed corresponding vehicle flow.`)) {
        await Api.startSimulation(this.currentSimId, {
          scenario: scen,
          algorithm: document.getElementById('select-algorithm').value,
          quantum: parseInt(document.getElementById('input-quantum').value, 10) || 2
        });
        this.refreshState();
      }
    });

    // Add Vehicle Modal
    const modal = document.getElementById('modal-add-vehicle');
    document.getElementById('btn-open-add-vehicle')?.addEventListener('click', () => {
      modal.classList.add('active');
    });
    document.getElementById('btn-close-add-vehicle')?.addEventListener('click', () => {
      modal.classList.remove('active');
    });

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
      };

      try {
        await Api.createVehicle(payload);
        modal.classList.remove('active');
        this.refreshState();
      } catch (err) {
        alert(`Validation Error: ${err.message}`);
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
        this.refreshState();
      } catch (err) {
        alert(`Error creating incident: ${err.message}`);
      }
    });
  },
};
