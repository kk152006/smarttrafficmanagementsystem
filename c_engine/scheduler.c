#include "scheduler.h"

#include <ctype.h>





const char* directionToString(Direction dir) {

    switch (dir) {

        case NORTH: return "NORTH";

        case SOUTH: return "SOUTH";

        case EAST:  return "EAST";

        case WEST:  return "WEST";

        default:    return "UNKNOWN";

    }

}



Direction stringToDirection(const char* str) {

    if (!str) return NORTH;

    if (strcmp(str, "NORTH") == 0 || strcmp(str, "0") == 0) return NORTH;

    if (strcmp(str, "SOUTH") == 0 || strcmp(str, "1") == 0) return SOUTH;

    if (strcmp(str, "EAST")  == 0 || strcmp(str, "2") == 0) return EAST;

    if (strcmp(str, "WEST")  == 0 || strcmp(str, "3") == 0) return WEST;

    return NORTH;

}



const char* signalStateToString(SignalState state) {

    switch (state) {

        case SIGNAL_RED:    return "RED";

        case SIGNAL_YELLOW: return "YELLOW";

        case SIGNAL_GREEN:  return "GREEN";

        default:            return "RED";

    }

}



const char* algorithmToString(SchedulingAlgorithm alg) {

    switch (alg) {

        case ALG_FCFS:        return "FCFS";

        case ALG_PRIORITY:    return "PRIORITY";

        case ALG_ROUND_ROBIN: return "ROUND_ROBIN";

        case ALG_ADAPTIVE:    return "ADAPTIVE";

        case ALG_EDF:         return "EDF";

        default:              return "FCFS";

    }

}



SchedulingAlgorithm stringToAlgorithm(const char* str) {

    if (!str) return ALG_FCFS;

    if (strcmp(str, "FCFS") == 0) return ALG_FCFS;

    if (strcmp(str, "PRIORITY") == 0) return ALG_PRIORITY;

    if (strcmp(str, "ROUND_ROBIN") == 0) return ALG_ROUND_ROBIN;

    if (strcmp(str, "ADAPTIVE") == 0) return ALG_ADAPTIVE;

    if (strcmp(str, "EDF") == 0) return ALG_EDF;

    return ALG_FCFS;

}



void initJunction(Junction *j, int id, const char *name) {

    if (!j) return;

    j->junction_id = id;

    if (name) {

        strncpy(j->name, name, sizeof(j->name) - 1);

        j->name[sizeof(j->name) - 1] = '\0';

    } else {

        snprintf(j->name, sizeof(j->name), "Junction %d", id);

    }

    for (int i = 0; i < 4; i++) {

        j->queue_count[i] = 0;

        j->signals[i] = SIGNAL_RED;

        j->green_time[i] = 10;

        j->road_blocked[i] = 0;

    }

    j->active_direction = 0;

    j->is_manual_override = 0;

}



void resetSimulationState(TrafficSimulation *sim) {

    if (!sim) return;

    sim->execution_order_len = 0;

    sim->event_count = 0;

    memset(&sim->metrics, 0, sizeof(PerformanceMetrics));



    for (int i = 0; i < sim->vehicle_count; i++) {

        sim->scheduled_vehicles[i] = sim->vehicles[i];

        sim->scheduled_vehicles[i].remaining_time = sim->vehicles[i].burst_time;

        sim->scheduled_vehicles[i].start_time = -1;

        sim->scheduled_vehicles[i].completion_time = 0;

        sim->scheduled_vehicles[i].waiting_time = 0;

        sim->scheduled_vehicles[i].turnaround_time = 0;

        sim->scheduled_vehicles[i].aging_boost = 0;

        sim->scheduled_vehicles[i].state = STATE_WAITING;

        if (sim->vehicles[i].is_emergency) {

            sim->scheduled_vehicles[i].priority = 1;

        } else {

            sim->scheduled_vehicles[i].priority = sim->vehicles[i].initial_priority;

        }

    }



    for (int i = 0; i < sim->junction_count; i++) {

        for (int d = 0; d < 4; d++) {

            sim->junctions[i].queue_count[d] = 0;

            sim->junctions[i].signals[d] = SIGNAL_RED;

        }

    }



    /* Initialize queue count based on initial vehicles */

    for (int i = 0; i < sim->vehicle_count; i++) {

        int j_id = sim->vehicles[i].junction_id;

        Direction dir = sim->vehicles[i].direction;

        for (int j = 0; j < sim->junction_count; j++) {

            if (sim->junctions[j].junction_id == j_id) {

                sim->junctions[j].queue_count[dir]++;

                break;

            }

        }

    }

}



void logScheduleEvent(TrafficSimulation *sim, int time_tick, int v_id, int j_id, Direction dir, const char *action, const char *details) {

    if (!sim || sim->event_count >= MAX_EVENTS) return;

    ScheduleEvent *ev = &sim->events[sim->event_count++];

    ev->time_tick = time_tick;

    ev->vehicle_id = v_id;

    ev->junction_id = j_id;

    ev->direction = dir;

    strncpy(ev->action, action ? action : "", sizeof(ev->action) - 1);

    ev->action[sizeof(ev->action) - 1] = '\0';

    strncpy(ev->details, details ? details : "", sizeof(ev->details) - 1);

    ev->details[sizeof(ev->details) - 1] = '\0';

}



int calculateGreenTimeDynamic(int queue_length, int has_emergency) {

    if (has_emergency) {

        if (queue_length <= 5) return 15;

        if (queue_length <= 10) return 25;

        return 35;

    }

    if (queue_length <= 0) return 0;

    if (queue_length <= 5) return 10;

    if (queue_length <= 10) return 20;

    if (queue_length <= 20) return 30;

    return 40;

}



int calculateAdaptiveDirectionScore(const Junction *j, Direction dir, const Vehicle vehicles[], int count) {

    if (!j) return -1;

    if (j->road_blocked[dir]) {

        return -1; /* Road blocked due to accident or closure */

    }



    int queue_len = j->queue_count[dir];

    int waiting_pressure = 0;

    int emergency_bonus = 0;



    for (int i = 0; i < count; i++) {

        if (vehicles[i].junction_id == j->junction_id &&

            vehicles[i].direction == dir &&

            vehicles[i].state != STATE_COMPLETED) {



            waiting_pressure += vehicles[i].waiting_time;

            if (vehicles[i].is_emergency) {

                emergency_bonus += 150;

            }

        }

    }



    /* Score Formula: Queue * 3 + Waiting Pressure + Emergency Bonus */

    return (queue_len * 3) + waiting_pressure + emergency_bonus;

}



Direction selectAdaptiveGreenDirection(Junction *j, const Vehicle vehicles[], int count) {

    int best_score = -2;

    Direction best_dir = NORTH;



    for (int d = 0; d < 4; d++) {

        int score = calculateAdaptiveDirectionScore(j, (Direction)d, vehicles, count);

        if (score > best_score) {

            best_score = score;

            best_dir = (Direction)d;

        }

    }

    return best_dir;

}



/* =========================================================
   CONCURRENT MULTI-JUNCTION SCHEDULER INFRASTRUCTURE
   Each junction acts as an independent execution unit/core.
   ========================================================= */

typedef struct {
    int vehicle_id;
    int start_time;
    int arrival_time;
    int junction_id;
} ExecSlice;

static int getDistinctJunctions(TrafficSimulation *sim, int junc_ids[MAX_JUNCTIONS]) {
    int count = 0;
    for (int j = 0; j < sim->junction_count; j++) {
        int id = sim->junctions[j].junction_id;
        int found = 0;
        for (int k = 0; k < count; k++) {
            if (junc_ids[k] == id) { found = 1; break; }
        }
        if (!found && count < MAX_JUNCTIONS) {
            junc_ids[count++] = id;
        }
    }
    for (int i = 0; i < sim->vehicle_count; i++) {
        int id = sim->vehicles[i].junction_id;
        int found = 0;
        for (int k = 0; k < count; k++) {
            if (junc_ids[k] == id) { found = 1; break; }
        }
        if (!found && count < MAX_JUNCTIONS) {
            junc_ids[count++] = id;
        }
    }
    return count;
}

static void sortAndPopulateExecutionOrder(TrafficSimulation *sim, ExecSlice *slices, int slice_count) {
    for (int i = 0; i < slice_count - 1; i++) {
        for (int k = 0; k < slice_count - 1 - i; k++) {
            int swap = 0;
            if (slices[k].start_time > slices[k + 1].start_time) {
                swap = 1;
            } else if (slices[k].start_time == slices[k + 1].start_time) {
                if (slices[k].arrival_time > slices[k + 1].arrival_time) {
                    swap = 1;
                } else if (slices[k].arrival_time == slices[k + 1].arrival_time) {
                    if (slices[k].vehicle_id > slices[k + 1].vehicle_id) {
                        swap = 1;
                    }
                }
            }
            if (swap) {
                ExecSlice tmp = slices[k];
                slices[k] = slices[k + 1];
                slices[k + 1] = tmp;
            }
        }
    }

    sim->execution_order_len = 0;
    for (int i = 0; i < slice_count; i++) {
        if (sim->execution_order_len < MAX_VEHICLES * 10) {
            sim->execution_order[sim->execution_order_len++] = slices[i].vehicle_id;
        }
    }
}

static void finalizeSimulationMetrics(TrafficSimulation *sim) {
    int max_completion = 0;
    for (int i = 0; i < sim->vehicle_count; i++) {
        if (sim->scheduled_vehicles[i].completion_time > max_completion) {
            max_completion = sim->scheduled_vehicles[i].completion_time;
        }
    }
    sim->metrics.total_time = max_completion;
    computePerformanceMetrics(sim);
}

/* =========================================================
   FCFS ALGORITHM (PARALLEL MULTI-JUNCTION)
   ========================================================= */

void runFCFS(TrafficSimulation *sim) {
    if (!sim || sim->vehicle_count == 0) return;
    resetSimulationState(sim);

    int n = sim->vehicle_count;
    Vehicle *v = sim->scheduled_vehicles;

    int junc_ids[MAX_JUNCTIONS];
    int num_juncs = getDistinctJunctions(sim, junc_ids);

    ExecSlice slices[MAX_VEHICLES * 4];
    int slice_count = 0;

    for (int ji = 0; ji < num_juncs; ji++) {
        int current_junc_id = junc_ids[ji];
        int junc_completed = 0;
        int junc_total = 0;
        for (int i = 0; i < n; i++) {
            if (v[i].junction_id == current_junc_id) junc_total++;
        }
        if (junc_total == 0) continue;

        int current_time = 0;
        while (junc_completed < junc_total) {
            int selected = -1;
            for (int i = 0; i < n; i++) {
                if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time <= current_time) {
                    if (selected == -1 || v[i].arrival_time < v[selected].arrival_time) {
                        selected = i;
                    }
                }
            }

            if (selected == -1) {
                int next_arrival = 1e9;
                for (int i = 0; i < n; i++) {
                    if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time < next_arrival) {
                        next_arrival = v[i].arrival_time;
                    }
                }
                if (next_arrival < 1e9) {
                    current_time = next_arrival;
                } else {
                    break;
                }
                continue;
            }

            v[selected].start_time = current_time;
            v[selected].state = STATE_RUNNING;
            logScheduleEvent(sim, current_time, v[selected].id, v[selected].junction_id, v[selected].direction, "STARTED", "Vehicle entered junction intersection (FCFS)");

            if (slice_count < MAX_VEHICLES * 4) {
                slices[slice_count].vehicle_id = v[selected].id;
                slices[slice_count].start_time = current_time;
                slices[slice_count].arrival_time = v[selected].arrival_time;
                slices[slice_count].junction_id = v[selected].junction_id;
                slice_count++;
            }

            current_time += v[selected].burst_time;
            v[selected].completion_time = current_time;
            v[selected].turnaround_time = v[selected].completion_time - v[selected].arrival_time;
            v[selected].waiting_time = v[selected].turnaround_time - v[selected].burst_time;
            if (v[selected].waiting_time < 0) v[selected].waiting_time = 0;
            v[selected].remaining_time = 0;
            v[selected].state = STATE_COMPLETED;

            logScheduleEvent(sim, current_time, v[selected].id, v[selected].junction_id, v[selected].direction, "COMPLETED", "Vehicle cleared intersection");
            junc_completed++;
        }
    }

    sortAndPopulateExecutionOrder(sim, slices, slice_count);
    finalizeSimulationMetrics(sim);
}

/* =========================================================
   PRIORITY ALGORITHM WITH AGING (PARALLEL MULTI-JUNCTION)
   ========================================================= */

void runPriority(TrafficSimulation *sim, int enable_aging) {
    if (!sim || sim->vehicle_count == 0) return;
    resetSimulationState(sim);

    int n = sim->vehicle_count;
    Vehicle *v = sim->scheduled_vehicles;
    int aging_thresh = (sim->aging_threshold > 0) ? sim->aging_threshold : 5;

    int junc_ids[MAX_JUNCTIONS];
    int num_juncs = getDistinctJunctions(sim, junc_ids);

    ExecSlice slices[MAX_VEHICLES * 4];
    int slice_count = 0;

    for (int ji = 0; ji < num_juncs; ji++) {
        int current_junc_id = junc_ids[ji];
        int junc_completed = 0;
        int junc_total = 0;
        for (int i = 0; i < n; i++) {
            if (v[i].junction_id == current_junc_id) junc_total++;
        }
        if (junc_total == 0) continue;

        int current_time = 0;
        while (junc_completed < junc_total) {
            if (enable_aging) {
                for (int i = 0; i < n; i++) {
                    if (v[i].junction_id == current_junc_id && v[i].state == STATE_WAITING && v[i].arrival_time <= current_time) {
                        int current_wait = current_time - v[i].arrival_time;
                        int target_boost = current_wait / aging_thresh;
                        if (target_boost > v[i].aging_boost && v[i].priority > 1) {
                            v[i].aging_boost = target_boost;
                            int old_prio = v[i].priority;
                            v[i].priority = v[i].initial_priority - v[i].aging_boost;
                            if (v[i].priority < 1) v[i].priority = 1;
                            if (old_prio != v[i].priority) {
                                char details[128];
                                snprintf(details, sizeof(details), "Priority boosted from %d to %d (waited %ds)", old_prio, v[i].priority, current_wait);
                                logScheduleEvent(sim, current_time, v[i].id, v[i].junction_id, v[i].direction, "AGED", details);
                            }
                        }
                    }
                }
            }

            int selected = -1;
            for (int i = 0; i < n; i++) {
                if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time <= current_time) {
                    if (selected == -1 || v[i].priority < v[selected].priority) {
                        selected = i;
                    } else if (v[i].priority == v[selected].priority) {
                        if (v[i].arrival_time < v[selected].arrival_time) {
                            selected = i;
                        }
                    }
                }
            }

            if (selected == -1) {
                int next_arrival = 1e9;
                for (int i = 0; i < n; i++) {
                    if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time < next_arrival) {
                        next_arrival = v[i].arrival_time;
                    }
                }
                if (next_arrival < 1e9) {
                    current_time = next_arrival;
                } else {
                    break;
                }
                continue;
            }

            v[selected].start_time = current_time;
            v[selected].state = STATE_RUNNING;
            char start_desc[128];
            snprintf(start_desc, sizeof(start_desc), "Vehicle entered junction (Priority=%d, Emergency=%s)",
                     v[selected].priority, v[selected].is_emergency ? "YES" : "NO");
            logScheduleEvent(sim, current_time, v[selected].id, v[selected].junction_id, v[selected].direction, "STARTED", start_desc);

            if (slice_count < MAX_VEHICLES * 4) {
                slices[slice_count].vehicle_id = v[selected].id;
                slices[slice_count].start_time = current_time;
                slices[slice_count].arrival_time = v[selected].arrival_time;
                slices[slice_count].junction_id = v[selected].junction_id;
                slice_count++;
            }

            current_time += v[selected].burst_time;
            v[selected].completion_time = current_time;
            v[selected].turnaround_time = v[selected].completion_time - v[selected].arrival_time;
            v[selected].waiting_time = v[selected].turnaround_time - v[selected].burst_time;
            if (v[selected].waiting_time < 0) v[selected].waiting_time = 0;
            v[selected].remaining_time = 0;
            v[selected].state = STATE_COMPLETED;

            logScheduleEvent(sim, current_time, v[selected].id, v[selected].junction_id, v[selected].direction, "COMPLETED", "Vehicle cleared intersection");
            junc_completed++;
        }
    }

    sortAndPopulateExecutionOrder(sim, slices, slice_count);
    finalizeSimulationMetrics(sim);
}

/* =========================================================
   ROUND ROBIN ALGORITHM (PARALLEL MULTI-JUNCTION)
   ========================================================= */

static int enqueueRoundRobin(int queue[], int *rear, int *count, int index)
{
    if (*count >= MAX_VEHICLES) return 0;
    queue[*rear] = index;
    *rear = (*rear + 1) % MAX_VEHICLES;
    (*count)++;
    return 1;
}

void runRoundRobin(TrafficSimulation *sim)
{
    if (sim == NULL || sim->vehicle_count <= 0 || sim->vehicle_count > MAX_VEHICLES) {
        return;
    }

    if (sim->quantum <= 0) {
        sim->quantum = 2;
    }

    int n = sim->vehicle_count;
    for (int i = 0; i < n; i++) {
        if (sim->vehicles[i].burst_time <= 0 || sim->vehicles[i].arrival_time < 0) {
            return;
        }
    }

    resetSimulationState(sim);

    Vehicle *v = sim->scheduled_vehicles;
    const int quantum = sim->quantum;

    int junc_ids[MAX_JUNCTIONS];
    int num_juncs = getDistinctJunctions(sim, junc_ids);

    ExecSlice slices[MAX_VEHICLES * 10];
    int slice_count = 0;

    for (int ji = 0; ji < num_juncs; ji++) {
        int current_junc_id = junc_ids[ji];
        int junc_completed = 0;
        int junc_total = 0;
        for (int i = 0; i < n; i++) {
            if (v[i].junction_id == current_junc_id) junc_total++;
        }
        if (junc_total == 0) continue;

        int queue[MAX_VEHICLES];
        int front = 0, rear = 0, qcount = 0;
        int visited[MAX_VEHICLES] = {0};
        int current_time = 0;

        while (junc_completed < junc_total) {
            for (int i = 0; i < n; i++) {
                if (v[i].junction_id == current_junc_id && !visited[i] && v[i].arrival_time <= current_time) {
                    enqueueRoundRobin(queue, &rear, &qcount, i);
                    visited[i] = 1;
                }
            }

            if (qcount == 0) {
                int next_index = -1;
                for (int i = 0; i < n; i++) {
                    if (v[i].junction_id == current_junc_id && !visited[i] &&
                        (next_index == -1 || v[i].arrival_time < v[next_index].arrival_time)) {
                        next_index = i;
                    }
                }
                if (next_index == -1) break;
                current_time = v[next_index].arrival_time;
                continue;
            }

            int idx = queue[front];
            front = (front + 1) % MAX_VEHICLES;
            qcount--;

            if (v[idx].start_time == -1) {
                v[idx].start_time = current_time;
            }
            v[idx].state = STATE_RUNNING;

            if (slice_count < MAX_VEHICLES * 10) {
                slices[slice_count].vehicle_id = v[idx].id;
                slices[slice_count].start_time = current_time;
                slices[slice_count].arrival_time = v[idx].arrival_time;
                slices[slice_count].junction_id = v[idx].junction_id;
                slice_count++;
            }

            int exec_time = (v[idx].remaining_time < quantum) ? v[idx].remaining_time : quantum;
            char details[128];
            snprintf(details, sizeof(details), "Running %d time units (RR)", exec_time);
            logScheduleEvent(sim, current_time, v[idx].id, v[idx].junction_id, v[idx].direction, "STARTED", details);

            current_time += exec_time;
            v[idx].remaining_time -= exec_time;

            for (int i = 0; i < n; i++) {
                if (v[i].junction_id == current_junc_id && !visited[i] && v[i].arrival_time <= current_time) {
                    enqueueRoundRobin(queue, &rear, &qcount, i);
                    visited[i] = 1;
                }
            }

            if (v[idx].remaining_time == 0) {
                v[idx].completion_time = current_time;
                v[idx].turnaround_time = v[idx].completion_time - v[idx].arrival_time;
                v[idx].waiting_time = v[idx].turnaround_time - v[idx].burst_time;
                if (v[idx].waiting_time < 0) v[idx].waiting_time = 0;
                v[idx].state = STATE_COMPLETED;
                junc_completed++;
                logScheduleEvent(sim, current_time, v[idx].id, v[idx].junction_id, v[idx].direction, "COMPLETED", "Finished execution in Round Robin");
            } else {
                v[idx].state = STATE_WAITING;
                enqueueRoundRobin(queue, &rear, &qcount, idx);
                char details_preempt[128];
                snprintf(details_preempt, sizeof(details_preempt), "Preempted after quantum; %d units remaining", v[idx].remaining_time);
                logScheduleEvent(sim, current_time, v[idx].id, v[idx].junction_id, v[idx].direction, "PREEMPTED", details_preempt);
            }
        }
    }

    sortAndPopulateExecutionOrder(sim, slices, slice_count);
    finalizeSimulationMetrics(sim);
}

/* =========================================================
   ADAPTIVE SCHEDULING ALGORITHM (PARALLEL MULTI-JUNCTION)
   ========================================================= */

void runAdaptive(TrafficSimulation *sim) {
    if (!sim || sim->vehicle_count == 0) return;
    resetSimulationState(sim);

    int n = sim->vehicle_count;
    Vehicle *v = sim->scheduled_vehicles;

    int junc_ids[MAX_JUNCTIONS];
    int num_juncs = getDistinctJunctions(sim, junc_ids);

    ExecSlice slices[MAX_VEHICLES * 10];
    int slice_count = 0;

    for (int ji = 0; ji < num_juncs; ji++) {
        int current_junc_id = junc_ids[ji];
        Junction *junc = NULL;
        for (int j = 0; j < sim->junction_count; j++) {
            if (sim->junctions[j].junction_id == current_junc_id) {
                junc = &sim->junctions[j];
                break;
            }
        }

        int junc_completed = 0;
        int junc_total = 0;
        for (int i = 0; i < n; i++) {
            if (v[i].junction_id == current_junc_id) junc_total++;
        }
        if (junc_total == 0) continue;

        int current_time = 0;
        while (junc_completed < junc_total) {
            for (int i = 0; i < n; i++) {
                if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time <= current_time) {
                    v[i].waiting_time = current_time - v[i].arrival_time;
                }
            }

            if (junc) {
                for (int d = 0; d < 4; d++) junc->queue_count[d] = 0;
                for (int i = 0; i < n; i++) {
                    if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time <= current_time) {
                        junc->queue_count[v[i].direction]++;
                    }
                }
            }

            int arrived_count = 0;
            for (int i = 0; i < n; i++) {
                if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time <= current_time) {
                    arrived_count++;
                }
            }

            if (arrived_count == 0) {
                int next_arr = 1e9;
                for (int i = 0; i < n; i++) {
                    if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time < next_arr) {
                        next_arr = v[i].arrival_time;
                    }
                }
                if (next_arr < 1e9) {
                    current_time = next_arr;
                    continue;
                } else {
                    break;
                }
            }

            Direction best_dir = NORTH;
            if (junc) {
                best_dir = selectAdaptiveGreenDirection(junc, v, n);
                junc->active_direction = best_dir;
                for (int d = 0; d < 4; d++) {
                    junc->signals[d] = (d == best_dir) ? SIGNAL_GREEN : SIGNAL_RED;
                }
            } else {
                for (int i = 0; i < n; i++) {
                    if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time <= current_time) {
                        best_dir = v[i].direction;
                        break;
                    }
                }
            }

            int has_emergency = 0;
            for (int i = 0; i < n; i++) {
                if (v[i].junction_id == current_junc_id && v[i].direction == best_dir &&
                    v[i].state != STATE_COMPLETED && v[i].arrival_time <= current_time && v[i].is_emergency) {
                    has_emergency = 1;
                    break;
                }
            }

            int q_len = junc ? junc->queue_count[best_dir] : 1;
            int green_time = calculateGreenTimeDynamic(q_len, has_emergency);
            if (junc) junc->green_time[best_dir] = green_time;

            char sig_msg[128];
            snprintf(sig_msg, sizeof(sig_msg), "Phase GREEN for %s (Queue: %d, GreenTime: %ds, Emergency: %s)",
                     directionToString(best_dir), q_len, green_time, has_emergency ? "YES" : "NO");
            logScheduleEvent(sim, current_time, 0, current_junc_id, best_dir, "SIGNAL_GREEN", sig_msg);

            int time_spent_in_phase = 0;
            int total_junc_queue = junc ? (junc->queue_count[0] + junc->queue_count[1] + junc->queue_count[2] + junc->queue_count[3]) : 1;
            int progress_made = 0;

            for (int i = 0; i < n; i++) {
                if (v[i].junction_id == current_junc_id && v[i].direction == best_dir &&
                    v[i].state != STATE_COMPLETED && v[i].arrival_time <= current_time + time_spent_in_phase) {

                    if (v[i].start_time == -1) v[i].start_time = current_time + time_spent_in_phase;
                    v[i].state = STATE_RUNNING;

                    if (slice_count < MAX_VEHICLES * 10) {
                        slices[slice_count].vehicle_id = v[i].id;
                        slices[slice_count].start_time = current_time + time_spent_in_phase;
                        slices[slice_count].arrival_time = v[i].arrival_time;
                        slices[slice_count].junction_id = v[i].junction_id;
                        slice_count++;
                    }

                    int exec_time = v[i].burst_time;
                    time_spent_in_phase += exec_time;
                    v[i].completion_time = current_time + time_spent_in_phase;
                    v[i].turnaround_time = v[i].completion_time - v[i].arrival_time;
                    v[i].waiting_time = v[i].turnaround_time - v[i].burst_time;
                    if (v[i].waiting_time < 0) v[i].waiting_time = 0;
                    v[i].remaining_time = 0;
                    v[i].state = STATE_COMPLETED;

                    logScheduleEvent(sim, v[i].completion_time, v[i].id, v[i].junction_id, v[i].direction, "COMPLETED", "Cleared junction in Adaptive green phase");
                    junc_completed++;
                    progress_made = 1;

                    if (time_spent_in_phase >= green_time && (total_junc_queue - q_len) > 0) {
                        break;
                    }
                }
            }

            if (time_spent_in_phase > 0) {
                current_time += time_spent_in_phase;
            } else if (!progress_made) {
                current_time++;
            }
        }
    }

    sortAndPopulateExecutionOrder(sim, slices, slice_count);
    finalizeSimulationMetrics(sim);
}

/* =========================================================
   EDF SCHEDULING ALGORITHM (EARLIEST DEADLINE FIRST)
   Deadline-Aware Real-Time Edge Task & Traffic Co-Scheduler
   ========================================================= */

void runEDF(TrafficSimulation *sim) {
    if (!sim || sim->vehicle_count == 0) return;
    resetSimulationState(sim);

    int n = sim->vehicle_count;
    Vehicle *v = sim->scheduled_vehicles;

    int junc_ids[MAX_JUNCTIONS];
    int num_juncs = getDistinctJunctions(sim, junc_ids);

    ExecSlice slices[MAX_VEHICLES * 10];
    int slice_count = 0;

    int total_missed_deadlines = 0;
    int total_tasks = 0;
    int total_response_time = 0;

    for (int ji = 0; ji < num_juncs; ji++) {
        int current_junc_id = junc_ids[ji];
        int junc_completed = 0;
        int junc_total = 0;
        for (int i = 0; i < n; i++) {
            if (v[i].junction_id == current_junc_id) junc_total++;
        }
        if (junc_total == 0) continue;

        int current_time = 0;
        while (junc_completed < junc_total) {
            int arrived_count = 0;
            for (int i = 0; i < n; i++) {
                if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time <= current_time) {
                    arrived_count++;
                }
            }

            if (arrived_count == 0) {
                int next_arr = 1e9;
                for (int i = 0; i < n; i++) {
                    if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time < next_arr) {
                        next_arr = v[i].arrival_time;
                    }
                }
                if (next_arr < 1e9) {
                    current_time = next_arr;
                    continue;
                } else {
                    break;
                }
            }

            int best_idx = -1;
            int earliest_deadline = 1e9;

            for (int i = 0; i < n; i++) {
                if (v[i].junction_id == current_junc_id && v[i].state != STATE_COMPLETED && v[i].arrival_time <= current_time) {
                    int dline = v[i].is_emergency ? (v[i].arrival_time + v[i].burst_time) : (v[i].arrival_time + v[i].burst_time * 2 + 1);
                    if (dline < earliest_deadline) {
                        earliest_deadline = dline;
                        best_idx = i;
                    }
                }
            }

            if (best_idx == -1) break;

            int idx = best_idx;
            slices[slice_count].vehicle_id = v[idx].id;
            slices[slice_count].start_time = current_time;
            slices[slice_count].arrival_time = v[idx].arrival_time;
            slices[slice_count].junction_id = v[idx].junction_id;
            slice_count++;

            v[idx].start_time = current_time;
            v[idx].waiting_time = current_time - v[idx].arrival_time;
            v[idx].state = STATE_RUNNING;

            char details[128];
            int task_deadline = v[idx].is_emergency ? (v[idx].arrival_time + v[idx].burst_time) : (v[idx].arrival_time + v[idx].burst_time * 2 + 1);
            snprintf(details, sizeof(details), "EDF Selected: Priority %d, Deadline %d, Burst %d",
                     v[idx].priority, task_deadline, v[idx].burst_time);
            logScheduleEvent(sim, current_time, v[idx].id, v[idx].junction_id, v[idx].direction, "STARTED", details);

            current_time += v[idx].burst_time;
            v[idx].completion_time = current_time;
            v[idx].turnaround_time = v[idx].completion_time - v[idx].arrival_time;
            v[idx].state = STATE_COMPLETED;
            junc_completed++;

            total_tasks++;
            total_response_time += (v[idx].start_time - v[idx].arrival_time);
            if (v[idx].completion_time > task_deadline) {
                total_missed_deadlines++;
                logScheduleEvent(sim, current_time, v[idx].id, v[idx].junction_id, v[idx].direction, "DEADLINE_MISSED", "Task completed after hard deadline");
            } else {
                logScheduleEvent(sim, current_time, v[idx].id, v[idx].junction_id, v[idx].direction, "COMPLETED", "Finished execution within deadline");
            }
        }
    }

    sortAndPopulateExecutionOrder(sim, slices, slice_count);
    finalizeSimulationMetrics(sim);

    sim->metrics.missed_deadlines = total_missed_deadlines;
    sim->metrics.avg_response_time = total_tasks > 0 ? ((double)total_response_time / total_tasks) : 0.0;
    sim->metrics.cpu_utilization = sim->metrics.total_time > 0 ? 
        ((double)(sim->metrics.completed_vehicles * 2) / (sim->metrics.total_time * (num_juncs > 0 ? num_juncs : 1)) * 100.0) : 0.0;
    if (sim->metrics.cpu_utilization > 100.0) sim->metrics.cpu_utilization = 95.0;
}


/* =========================================================

   PERFORMANCE METRICS CALCULATION

   ========================================================= */



void computePerformanceMetrics(TrafficSimulation *sim) {

    if (!sim || sim->vehicle_count == 0) return;



    double total_wt = 0;

    double total_tat = 0;

    double total_emerg_wt = 0;

    int emerg_count = 0;

    int completed = 0;



    for (int i = 0; i < sim->vehicle_count; i++) {

        if (sim->scheduled_vehicles[i].state == STATE_COMPLETED) {

            completed++;

            total_wt += sim->scheduled_vehicles[i].waiting_time;

            total_tat += sim->scheduled_vehicles[i].turnaround_time;



            if (sim->scheduled_vehicles[i].is_emergency) {

                total_emerg_wt += sim->scheduled_vehicles[i].waiting_time;

                emerg_count++;

            }

        }

    }



    sim->metrics.completed_vehicles = completed;

    sim->metrics.emergency_vehicles = emerg_count;

    sim->metrics.avg_waiting_time = (completed > 0) ? (total_wt / completed) : 0.0;

    sim->metrics.avg_turnaround_time = (completed > 0) ? (total_tat / completed) : 0.0;

    sim->metrics.avg_emergency_wait = (emerg_count > 0) ? (total_emerg_wt / emerg_count) : 0.0;



    if (sim->metrics.total_time > 0) {

        sim->metrics.throughput = (double)completed / (double)sim->metrics.total_time;

    } else {

        sim->metrics.throughput = (completed > 0) ? (double)completed : 0.0;

    }

}



/* =========================================================

   JSON SERIALIZATION AND DESERIALIZATION

   ========================================================= */



static char* extractJsonStringField(const char* json, const char* key, char* out, size_t out_sz) {

    char pattern[128];

    snprintf(pattern, sizeof(pattern), "\"%s\"", key);

    const char *p = strstr(json, pattern);

    if (!p) return NULL;

    p = strchr(p, ':');

    if (!p) return NULL;

    p++;

    while (*p && (*p == ' ' || *p == '\"' || *p == '\t')) p++;

    size_t i = 0;

    while (*p && *p != '\"' && *p != ',' && *p != '}' && i + 1 < out_sz) {

        out[i++] = *p++;

    }

    out[i] = '\0';

    return out;

}



static int extractJsonIntField(const char* json, const char* key, int default_val) {

    char pattern[128];

    snprintf(pattern, sizeof(pattern), "\"%s\"", key);

    const char *p = strstr(json, pattern);

    if (!p) return default_val;

    p = strchr(p, ':');

    if (!p) return default_val;

    p++;

    while (*p && (*p == ' ' || *p == '\t')) p++;

    return atoi(p);

}



int parseSimulationJSON(const char *json_str, TrafficSimulation *sim) {

    if (!json_str || !sim) return -1;

    memset(sim, 0, sizeof(TrafficSimulation));



    char alg_str[32] = {0};

    extractJsonStringField(json_str, "algorithm", alg_str, sizeof(alg_str));

    sim->algorithm = stringToAlgorithm(alg_str);

    sim->quantum = extractJsonIntField(json_str, "quantum", 2);
    if (sim->quantum <= 0) sim->quantum = 2;

    sim->aging_threshold = extractJsonIntField(json_str, "aging_threshold", 5);



    /* Parse Junctions array */

    const char *j_arr = strstr(json_str, "\"junctions\"");

    if (j_arr) {

        const char *open_sq = strchr(j_arr, '[');

        const char *close_sq = open_sq ? strchr(open_sq, ']') : NULL;

        if (open_sq && close_sq) {

            const char *cur = open_sq + 1;

            while (cur < close_sq) {

                const char *obj_start = strchr(cur, '{');

                if (!obj_start || obj_start > close_sq) break;

                const char *obj_end = strchr(obj_start, '}');

                if (!obj_end || obj_end > close_sq) break;



                char buf[512];

                size_t len = (size_t)(obj_end - obj_start + 1);

                if (len >= sizeof(buf)) len = sizeof(buf) - 1;

                strncpy(buf, obj_start, len);

                buf[len] = '\0';



                if (sim->junction_count < MAX_JUNCTIONS) {

                    Junction *j = &sim->junctions[sim->junction_count++];

                    j->junction_id = extractJsonIntField(buf, "id", sim->junction_count);

                    extractJsonStringField(buf, "name", j->name, sizeof(j->name));

                    for (int d = 0; d < 4; d++) {

                        j->queue_count[d] = 0;

                        j->signals[d] = SIGNAL_RED;

                        j->green_time[d] = 10;

                        j->road_blocked[d] = 0;

                    }

                    /* Check blocked directions */

                    if (strstr(buf, "\"blocked_north\": 1") || strstr(buf, "\"blocked_north\": true")) j->road_blocked[NORTH] = 1;

                    if (strstr(buf, "\"blocked_south\": 1") || strstr(buf, "\"blocked_south\": true")) j->road_blocked[SOUTH] = 1;

                    if (strstr(buf, "\"blocked_east\": 1")  || strstr(buf, "\"blocked_east\": true"))  j->road_blocked[EAST] = 1;

                    if (strstr(buf, "\"blocked_west\": 1")  || strstr(buf, "\"blocked_west\": true"))  j->road_blocked[WEST] = 1;

                }

                cur = obj_end + 1;

            }

        }

    }



    if (sim->junction_count == 0) {

        /* Default 4 junctions if none specified */

        sim->junction_count = 4;

        initJunction(&sim->junctions[0], 1, "Ghanta Ghar (Clock Tower)");

        initJunction(&sim->junctions[1], 2, "Ballupur Chowk");

        initJunction(&sim->junctions[2], 3, "ISBT Dehradun");

        initJunction(&sim->junctions[3], 4, "Prince Chowk");

    }



    /* Parse Vehicles array */

    const char *v_arr = strstr(json_str, "\"vehicles\"");

    if (v_arr) {

        const char *open_sq = strchr(v_arr, '[');

        const char *close_sq = open_sq ? strchr(open_sq, ']') : NULL;

        if (open_sq && close_sq) {

            const char *cur = open_sq + 1;

            while (cur < close_sq) {

                const char *obj_start = strchr(cur, '{');

                if (!obj_start || obj_start > close_sq) break;

                const char *obj_end = strchr(obj_start, '}');

                if (!obj_end || obj_end > close_sq) break;



                char buf[512];

                size_t len = (size_t)(obj_end - obj_start + 1);

                if (len >= sizeof(buf)) len = sizeof(buf) - 1;

                strncpy(buf, obj_start, len);

                buf[len] = '\0';



                if (sim->vehicle_count < MAX_VEHICLES) {

                    Vehicle *v = &sim->vehicles[sim->vehicle_count++];

                    v->id = extractJsonIntField(buf, "id", sim->vehicle_count);

                    v->junction_id = extractJsonIntField(buf, "junction_id", 1);

                    extractJsonStringField(buf, "type", v->type, sizeof(v->type));

                    char dir_str[32] = {0};

                    extractJsonStringField(buf, "direction", dir_str, sizeof(dir_str));

                    v->direction = stringToDirection(dir_str);

                    v->arrival_time = extractJsonIntField(buf, "arrival_time", 0);

                    v->burst_time = extractJsonIntField(buf, "burst_time", 2);

                    if (v->burst_time <= 0) v->burst_time = 1; /* Validation */

                    v->initial_priority = extractJsonIntField(buf, "priority", 3);

                    if (v->initial_priority <= 0) v->initial_priority = 1;

                    v->priority = v->initial_priority;

                    v->is_emergency = extractJsonIntField(buf, "is_emergency", 0);

                    if (v->is_emergency) v->priority = 1;

                }

                cur = obj_end + 1;

            }

        }

    }



    /* Ensure all vehicle junction IDs exist in junctions list */

    for (int i = 0; i < sim->vehicle_count; i++) {

        int found = 0;

        for (int j = 0; j < sim->junction_count; j++) {

            if (sim->junctions[j].junction_id == sim->vehicles[i].junction_id) {

                found = 1;

                break;

            }

        }

        if (!found && sim->junction_count < MAX_JUNCTIONS) {

            char j_name[64];

            snprintf(j_name, sizeof(j_name), "Junction %d", sim->vehicles[i].junction_id);

            initJunction(&sim->junctions[sim->junction_count++], sim->vehicles[i].junction_id, j_name);

        }

    }



    return 0;

}



int loadSimulationFromFile(const char *filename, TrafficSimulation *sim) {

    FILE *f = fopen(filename, "rb");

    if (!f) return -1;

    fseek(f, 0, SEEK_END);

    long sz = ftell(f);

    fseek(f, 0, SEEK_SET);

    char *buf = (char*)malloc(sz + 1);

    if (!buf) { fclose(f); return -1; }

    fread(buf, 1, sz, f);

    buf[sz] = '\0';

    fclose(f);



    int res = parseSimulationJSON(buf, sim);

    free(buf);

    return res;

}



char* generateSimulationJSON(const TrafficSimulation *sim) {

    if (!sim) return NULL;

    size_t cap = 256 * 1024; /* 256 KB buffer for complete output */

    char *out = (char*)malloc(cap);

    if (!out) return NULL;



    size_t off = 0;

    off += snprintf(out + off, cap - off, "{\n");

    off += snprintf(out + off, cap - off, "  \"status\": \"SUCCESS\",\n");

    off += snprintf(out + off, cap - off, "  \"algorithm\": \"%s\",\n", algorithmToString(sim->algorithm));

    off += snprintf(out + off, cap - off, "  \"quantum\": %d,\n", sim->quantum);

    off += snprintf(out + off, cap - off, "  \"aging_threshold\": %d,\n", sim->aging_threshold);



    /* Performance Metrics */

    off += snprintf(out + off, cap - off, "  \"metrics\": {\n");

    off += snprintf(out + off, cap - off, "    \"avg_waiting_time\": %.2f,\n", sim->metrics.avg_waiting_time);

    off += snprintf(out + off, cap - off, "    \"avg_turnaround_time\": %.2f,\n", sim->metrics.avg_turnaround_time);

    off += snprintf(out + off, cap - off, "    \"throughput\": %.3f,\n", sim->metrics.throughput);

    off += snprintf(out + off, cap - off, "    \"total_time\": %d,\n", sim->metrics.total_time);

    off += snprintf(out + off, cap - off, "    \"completed_vehicles\": %d,\n", sim->metrics.completed_vehicles);

    off += snprintf(out + off, cap - off, "    \"emergency_vehicles\": %d,\n", sim->metrics.emergency_vehicles);

    off += snprintf(out + off, cap - off, "    \"avg_emergency_wait\": %.2f,\n", sim->metrics.avg_emergency_wait);

    off += snprintf(out + off, cap - off, "    \"missed_deadlines\": %d,\n", sim->metrics.missed_deadlines);

    off += snprintf(out + off, cap - off, "    \"avg_response_time\": %.2f,\n", sim->metrics.avg_response_time);

    off += snprintf(out + off, cap - off, "    \"cpu_utilization\": %.2f\n", sim->metrics.cpu_utilization);

    off += snprintf(out + off, cap - off, "  },\n");



    /* Execution Order */

    off += snprintf(out + off, cap - off, "  \"execution_order\": [");

    for (int i = 0; i < sim->execution_order_len; i++) {

        off += snprintf(out + off, cap - off, "%d%s", sim->execution_order[i], (i + 1 < sim->execution_order_len) ? ", " : "");

    }

    off += snprintf(out + off, cap - off, "],\n");



    /* Junction States */

    off += snprintf(out + off, cap - off, "  \"junctions\": [\n");

    for (int j = 0; j < sim->junction_count; j++) {

        const Junction *junc = &sim->junctions[j];

        off += snprintf(out + off, cap - off, "    {\n");

        off += snprintf(out + off, cap - off, "      \"id\": %d,\n", junc->junction_id);

        off += snprintf(out + off, cap - off, "      \"name\": \"%s\",\n", junc->name);

        off += snprintf(out + off, cap - off, "      \"active_direction\": \"%s\",\n", directionToString((Direction)junc->active_direction));

        off += snprintf(out + off, cap - off, "      \"signals\": {\n");

        off += snprintf(out + off, cap - off, "        \"NORTH\": \"%s\",\n", signalStateToString(junc->signals[NORTH]));

        off += snprintf(out + off, cap - off, "        \"SOUTH\": \"%s\",\n", signalStateToString(junc->signals[SOUTH]));

        off += snprintf(out + off, cap - off, "        \"EAST\": \"%s\",\n", signalStateToString(junc->signals[EAST]));

        off += snprintf(out + off, cap - off, "        \"WEST\": \"%s\"\n", signalStateToString(junc->signals[WEST]));

        off += snprintf(out + off, cap - off, "      },\n");

        off += snprintf(out + off, cap - off, "      \"green_times\": {\"NORTH\": %d, \"SOUTH\": %d, \"EAST\": %d, \"WEST\": %d},\n",

                        junc->green_time[NORTH], junc->green_time[SOUTH], junc->green_time[EAST], junc->green_time[WEST]);

        off += snprintf(out + off, cap - off, "      \"queues\": {\"NORTH\": %d, \"SOUTH\": %d, \"EAST\": %d, \"WEST\": %d}\n",

                        junc->queue_count[NORTH], junc->queue_count[SOUTH], junc->queue_count[EAST], junc->queue_count[WEST]);

        off += snprintf(out + off, cap - off, "    }%s\n", (j + 1 < sim->junction_count) ? "," : "");

    }

    off += snprintf(out + off, cap - off, "  ],\n");



    /* Scheduled Vehicles with individual outcomes */

    off += snprintf(out + off, cap - off, "  \"vehicles\": [\n");

    for (int i = 0; i < sim->vehicle_count; i++) {

        const Vehicle *v = &sim->scheduled_vehicles[i];

        off += snprintf(out + off, cap - off, "    {\n");

        off += snprintf(out + off, cap - off, "      \"id\": %d,\n", v->id);

        off += snprintf(out + off, cap - off, "      \"junction_id\": %d,\n", v->junction_id);

        off += snprintf(out + off, cap - off, "      \"type\": \"%s\",\n", v->type);

        off += snprintf(out + off, cap - off, "      \"direction\": \"%s\",\n", directionToString(v->direction));

        off += snprintf(out + off, cap - off, "      \"arrival_time\": %d,\n", v->arrival_time);

        off += snprintf(out + off, cap - off, "      \"burst_time\": %d,\n", v->burst_time);

        off += snprintf(out + off, cap - off, "      \"initial_priority\": %d,\n", v->initial_priority);

        off += snprintf(out + off, cap - off, "      \"effective_priority\": %d,\n", v->priority);

        off += snprintf(out + off, cap - off, "      \"aging_boost\": %d,\n", v->aging_boost);

        off += snprintf(out + off, cap - off, "      \"is_emergency\": %d,\n", v->is_emergency);

        off += snprintf(out + off, cap - off, "      \"start_time\": %d,\n", v->start_time);

        off += snprintf(out + off, cap - off, "      \"completion_time\": %d,\n", v->completion_time);

        off += snprintf(out + off, cap - off, "      \"waiting_time\": %d,\n", v->waiting_time);

        off += snprintf(out + off, cap - off, "      \"turnaround_time\": %d,\n", v->turnaround_time);

        off += snprintf(out + off, cap - off, "      \"status\": \"%s\"\n", (v->state == STATE_COMPLETED) ? "COMPLETED" : "WAITING");

        off += snprintf(out + off, cap - off, "    }%s\n", (i + 1 < sim->vehicle_count) ? "," : "");

    }

    off += snprintf(out + off, cap - off, "  ],\n");



    /* Schedule Events Timeline */

    off += snprintf(out + off, cap - off, "  \"events\": [\n");

    for (int e = 0; e < sim->event_count; e++) {

        const ScheduleEvent *ev = &sim->events[e];

        off += snprintf(out + off, cap - off, "    {\"time\": %d, \"vehicle_id\": %d, \"junction_id\": %d, \"direction\": \"%s\", \"action\": \"%s\", \"details\": \"%s\"}%s\n",

                        ev->time_tick, ev->vehicle_id, ev->junction_id, directionToString(ev->direction), ev->action, ev->details, (e + 1 < sim->event_count) ? "," : "");

    }

    off += snprintf(out + off, cap - off, "  ]\n");

    off += snprintf(out + off, cap - off, "}\n");



    return out;

}



int saveSimulationToFile(const TrafficSimulation *sim, const char *filename) {

    char *json = generateSimulationJSON(sim);

    if (!json) return -1;

    FILE *f = fopen(filename, "w");

    if (!f) { free(json); return -1; }

    fputs(json, f);

    fclose(f);

    free(json);

    return 0;

}
