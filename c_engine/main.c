#include "scheduler.h"
#include "sync_sim.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void printUsage(const char* prog) {
    printf("SmartTraffic OS Scheduling Engine V2\n");
    printf("Graphic Era (Deemed to be University) - Academic Session 2026-27\n\n");
    printf("Usage:\n");
    printf("  %s --file <input.json> --out <output.json>\n", prog);
    printf("  %s --stdin\n", prog);
    printf("  %s --test-sync\n", prog);
    printf("  %s (interactive mode)\n", prog);
}

int runFileMode(const char* in_file, const char* out_file) {
    TrafficSimulation sim;
    if (loadSimulationFromFile(in_file, &sim) != 0) {
        fprintf(stderr, "Error: Failed to load simulation input from %s\n", in_file);
        return 1;
    }

    switch (sim.algorithm) {
        case ALG_FCFS:
            runFCFS(&sim);
            break;
        case ALG_PRIORITY:
            runPriority(&sim, 1); /* Enable aging by default */
            break;
        case ALG_ROUND_ROBIN:
            runRoundRobin(&sim);
            break;
        case ALG_ADAPTIVE:
            runAdaptive(&sim);
            break;
        default:
            runAdaptive(&sim);
            break;
    }

    if (saveSimulationToFile(&sim, out_file) != 0) {
        fprintf(stderr, "Error: Failed to save simulation output to %s\n", out_file);
        return 1;
    }

    printf("SUCCESS: Simulation processed and saved to %s\n", out_file);
    return 0;
}

int runStdinMode() {
    /* Read all from stdin */
    size_t cap = 256 * 1024;
    char *buf = (char*)malloc(cap);
    if (!buf) return 1;
    size_t len = 0;
    int c;
    while ((c = getchar()) != EOF && len + 1 < cap) {
        buf[len++] = (char)c;
    }
    buf[len] = '\0';

    TrafficSimulation sim;
    if (parseSimulationJSON(buf, &sim) != 0) {
        free(buf);
        fprintf(stderr, "{\"status\": \"ERROR\", \"message\": \"Failed to parse JSON\"}\n");
        return 1;
    }
    free(buf);

    switch (sim.algorithm) {
        case ALG_FCFS:        runFCFS(&sim); break;
        case ALG_PRIORITY:    runPriority(&sim, 1); break;
        case ALG_ROUND_ROBIN: runRoundRobin(&sim); break;
        case ALG_ADAPTIVE:    runAdaptive(&sim); break;
        default:              runAdaptive(&sim); break;
    }

    char *out_json = generateSimulationJSON(&sim);
    if (out_json) {
        fputs(out_json, stdout);
        free(out_json);
    }
    return 0;
}

int runSyncTestMode() {
    SyncTestResult res = runSynchronizationDemonstration(8);
    printf("{\n");
    printf("  \"test_passed\": %s,\n", res.test_passed ? "true" : "false");
    printf("  \"mutex_locks_acquired\": %d,\n", res.mutex_locks_acquired);
    printf("  \"semaphore_waits_completed\": %d,\n", res.semaphore_waits_completed);
    printf("  \"race_conditions_prevented\": %d,\n", res.race_conditions_prevented);
    printf("  \"logs\": [\n");
    for (int i = 0; i < res.log_count; i++) {
        printf("    \"%s\"%s\n", res.log_messages[i], (i + 1 < res.log_count) ? "," : "");
    }
    printf("  ]\n");
    printf("}\n");
    return 0;
}

/* Interactive demo mode preserving legacy workflow */
int runInteractiveMode() {
    printf("====================================================\n");
    printf("       SMARTTRAFFIC - OS ENGINE INTERACTIVE\n");
    printf("====================================================\n");

    TrafficSimulation sim;
    memset(&sim, 0, sizeof(sim));
    sim.junction_count = 4;
    initJunction(&sim.junctions[0], 1, "Ghanta Ghar (Clock Tower)");
    initJunction(&sim.junctions[1], 2, "Ballupur Chowk");
    initJunction(&sim.junctions[2], 3, "ISBT Dehradun");
    initJunction(&sim.junctions[3], 4, "Prince Chowk");

    printf("\nEnter number of vehicles (default 4): ");
    char line[64];
    int n = 4;
    if (fgets(line, sizeof(line), stdin) && line[0] != '\n') {
        n = atoi(line);
        if (n <= 0 || n > 50) n = 4;
    }

    /* Seed standard realistic sample vehicles */
    const char *types[] = {"Ambulance", "Bus", "Car", "Police Van"};
    int emergencies[] = {1, 0, 0, 1};
    int bursts[] = {3, 4, 2, 2};
    int priorities[] = {1, 3, 4, 1};

    sim.vehicle_count = n;
    for (int i = 0; i < n; i++) {
        sim.vehicles[i].id = i + 1;
        sim.vehicles[i].junction_id = (i % 4) + 1;
        strncpy(sim.vehicles[i].type, types[i % 4], sizeof(sim.vehicles[i].type) - 1);
        sim.vehicles[i].direction = (Direction)(i % 4);
        sim.vehicles[i].arrival_time = i;
        sim.vehicles[i].burst_time = bursts[i % 4];
        sim.vehicles[i].remaining_time = sim.vehicles[i].burst_time;
        sim.vehicles[i].initial_priority = priorities[i % 4];
        sim.vehicles[i].priority = priorities[i % 4];
        sim.vehicles[i].is_emergency = emergencies[i % 4];
    }

    printf("\nRunning Adaptive Scheduling:\n");
    runAdaptive(&sim);

    printf("\nPerformance Metrics:\n");
    printf("  Avg Waiting Time   : %.2f sec\n", sim.metrics.avg_waiting_time);
    printf("  Avg Turnaround Time: %.2f sec\n", sim.metrics.avg_turnaround_time);
    printf("  Throughput         : %.3f veh/sec\n", sim.metrics.throughput);
    printf("  Emergency Response : %.2f sec\n", sim.metrics.avg_emergency_wait);

    printf("\nInteractive OS Engine finished successfully.\n");
    return 0;
}

int main(int argc, char *argv[]) {
    if (argc >= 2) {
        if (strcmp(argv[1], "--test-sync") == 0) {
            return runSyncTestMode();
        } else if (strcmp(argv[1], "--stdin") == 0) {
            return runStdinMode();
        } else if (strcmp(argv[1], "--file") == 0 && argc >= 5 && strcmp(argv[3], "--out") == 0) {
            return runFileMode(argv[2], argv[4]);
        } else if (strcmp(argv[1], "--help") == 0 || strcmp(argv[1], "-h") == 0) {
            printUsage(argv[0]);
            return 0;
        }
    }

    return runInteractiveMode();
}
