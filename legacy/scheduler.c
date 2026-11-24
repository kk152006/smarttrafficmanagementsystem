#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_VEHICLES 100

typedef struct {
    int id;
    int arrival_time;
    int burst_time;
    int remaining_time;
    int priority;

    char type[20];
    char direction[10];

    int completion_time;
    int waiting_time;
    int turnaround_time;
} Vehicle;


/* =========================================================
   Utility Functions
   ========================================================= */

void copyVehicles(Vehicle dest[], Vehicle src[], int n) {
    for (int i = 0; i < n; i++) {
        dest[i] = src[i];
        dest[i].remaining_time = src[i].burst_time;
        dest[i].completion_time = 0;
        dest[i].waiting_time = 0;
        dest[i].turnaround_time = 0;
    }
}

void printVehicles(Vehicle v[], int n) {

    printf("\n");
    printf("-------------------------------------------------------------\n");
    printf("ID\tArrival\tBurst\tPriority\tCompletion\tWaiting\tTurnaround\n");
    printf("-------------------------------------------------------------\n");

    for (int i = 0; i < n; i++) {
        printf(
            "V%d\t%d\t%d\t%d\t\t%d\t\t%d\t%d\n",
            v[i].id,
            v[i].arrival_time,
            v[i].burst_time,
            v[i].priority,
            v[i].completion_time,
            v[i].waiting_time,
            v[i].turnaround_time
        );
    }

    printf("-------------------------------------------------------------\n");
}

void calculateMetrics(Vehicle v[], int n, int total_time) {

    double total_waiting = 0;
    double total_turnaround = 0;

    for (int i = 0; i < n; i++) {
        total_waiting += v[i].waiting_time;
        total_turnaround += v[i].turnaround_time;
    }

    printf("\n========== PERFORMANCE METRICS ==========\n");

    printf(
        "Average Waiting Time    : %.2f\n",
        total_waiting / n
    );

    printf(
        "Average Turnaround Time : %.2f\n",
        total_turnaround / n
    );

    if (total_time > 0) {
        printf(
            "Throughput              : %.2f vehicles/time-unit\n",
            (double)n / total_time
        );
    }
}


/* =========================================================
   FCFS Scheduling
   ========================================================= */

void FCFS(Vehicle input[], int n) {

    Vehicle v[MAX_VEHICLES];
    copyVehicles(v, input, n);

    printf("\n\n========== FCFS SCHEDULING ==========\n");

    /* Sort by arrival time */
    for (int i = 0; i < n - 1; i++) {
        for (int j = i + 1; j < n; j++) {

            if (v[i].arrival_time > v[j].arrival_time) {

                Vehicle temp = v[i];
                v[i] = v[j];
                v[j] = temp;
            }
        }
    }

    int current_time = 0;

    printf("\nExecution Order:\n");

    for (int i = 0; i < n; i++) {

        if (current_time < v[i].arrival_time) {
            current_time = v[i].arrival_time;
        }

        printf("V%d -> ", v[i].id);

        current_time += v[i].burst_time;

        v[i].completion_time = current_time;

        v[i].turnaround_time =
            v[i].completion_time - v[i].arrival_time;

        v[i].waiting_time =
            v[i].turnaround_time - v[i].burst_time;
    }

    printf("END\n");

    printVehicles(v, n);

    calculateMetrics(v, n, current_time);
}


/* =========================================================
   Priority Scheduling
   Lower number = Higher priority
   ========================================================= */

void PriorityScheduling(Vehicle input[], int n) {

    Vehicle v[MAX_VEHICLES];
    copyVehicles(v, input, n);

    printf("\n\n========== PRIORITY SCHEDULING ==========\n");

    int completed[MAX_VEHICLES] = {0};

    int completed_count = 0;
    int current_time = 0;

    printf("\nExecution Order:\n");

    while (completed_count < n) {

        int selected = -1;

        for (int i = 0; i < n; i++) {

            if (!completed[i] &&
                v[i].arrival_time <= current_time) {

                if (selected == -1 ||
                    v[i].priority < v[selected].priority) {

                    selected = i;
                }
            }
        }

        /*
         * CPU/Intersection is idle.
         * Move time to next arriving vehicle.
         */
        if (selected == -1) {

            int next_arrival = 999999;

            for (int i = 0; i < n; i++) {

                if (!completed[i] &&
                    v[i].arrival_time < next_arrival) {

                    next_arrival = v[i].arrival_time;
                }
            }

            current_time = next_arrival;
            continue;
        }

        printf("V%d -> ", v[selected].id);

        current_time += v[selected].burst_time;

        v[selected].completion_time = current_time;

        v[selected].turnaround_time =
            v[selected].completion_time -
            v[selected].arrival_time;

        v[selected].waiting_time =
            v[selected].turnaround_time -
            v[selected].burst_time;

        completed[selected] = 1;
        completed_count++;
    }

    printf("END\n");

    printVehicles(v, n);

    calculateMetrics(v, n, current_time);
}


/* =========================================================
   Round Robin Scheduling
   ========================================================= */

void RoundRobin(Vehicle input[], int n, int quantum) {

    Vehicle v[MAX_VEHICLES];
    copyVehicles(v, input, n);

    printf("\n\n========== ROUND ROBIN ==========\n");
    printf("Time Quantum = %d\n", quantum);

    int completed = 0;
    int current_time = 0;

    int visited[MAX_VEHICLES] = {0};

    int queue[MAX_VEHICLES * 10];
    int front = 0;
    int rear = 0;

    printf("\nExecution Order:\n");

    /*
     * Start with vehicles that arrive at time 0
     */
    for (int i = 0; i < n; i++) {

        if (v[i].arrival_time <= current_time &&
            !visited[i]) {

            queue[rear++] = i;
            visited[i] = 1;
        }
    }

    while (completed < n) {

        /*
         * If queue is empty, jump to next arrival.
         */
        if (front == rear) {

            int next = -1;

            for (int i = 0; i < n; i++) {

                if (!visited[i]) {

                    if (next == -1 ||
                        v[i].arrival_time <
                        v[next].arrival_time) {

                        next = i;
                    }
                }
            }

            if (next != -1) {

                current_time = v[next].arrival_time;

                queue[rear++] = next;
                visited[next] = 1;
            }
        }

        int index = queue[front++];

        printf("V%d -> ", v[index].id);

        int execution_time;

        if (v[index].remaining_time > quantum) {
            execution_time = quantum;
        } else {
            execution_time = v[index].remaining_time;
        }

        v[index].remaining_time -= execution_time;

        current_time += execution_time;

        /*
         * Add newly arrived vehicles.
         */
        for (int i = 0; i < n; i++) {

            if (!visited[i] &&
                v[i].arrival_time <= current_time) {

                queue[rear++] = i;
                visited[i] = 1;
            }
        }

        /*
         * Vehicle finished.
         */
        if (v[index].remaining_time == 0) {

            completed++;

            v[index].completion_time =
                current_time;

            v[index].turnaround_time =
                v[index].completion_time -
                v[index].arrival_time;

            v[index].waiting_time =
                v[index].turnaround_time -
                v[index].burst_time;
        }

        /*
         * Vehicle still has work.
         */
        else {

            queue[rear++] = index;
        }
    }

    printf("END\n");

    printVehicles(v, n);

    calculateMetrics(v, n, current_time);
}


/* =========================================================
   Adaptive Traffic Scheduling
   =========================================================

   Simple first version:

   1. Emergency vehicles get highest priority.
   2. Otherwise, choose the direction with the highest
      accumulated traffic priority.

   This is deliberately simple for Phase 1.
   ========================================================= */

void AdaptiveScheduling(Vehicle input[], int n) {

    Vehicle v[MAX_VEHICLES];
    copyVehicles(v, input, n);

    printf("\n\n========== ADAPTIVE TRAFFIC SCHEDULING ==========\n");

    int completed[MAX_VEHICLES] = {0};

    int completed_count = 0;
    int current_time = 0;

    printf("\nExecution Order:\n");

    while (completed_count < n) {

        int selected = -1;

        /*
         * STEP 1:
         * Search for an emergency vehicle.
         */

        for (int i = 0; i < n; i++) {

            if (!completed[i] &&
                v[i].arrival_time <= current_time &&
                v[i].priority == 1) {

                selected = i;
                break;
            }
        }

        /*
         * STEP 2:
         * If no emergency vehicle exists,
         * select highest-priority available vehicle.
         */

        if (selected == -1) {

            for (int i = 0; i < n; i++) {

                if (!completed[i] &&
                    v[i].arrival_time <= current_time) {

                    if (selected == -1 ||
                        v[i].priority < v[selected].priority) {

                        selected = i;
                    }
                }
            }
        }

        /*
         * No vehicle currently available.
         */

        if (selected == -1) {

            int next_arrival = 999999;

            for (int i = 0; i < n; i++) {

                if (!completed[i] &&
                    v[i].arrival_time < next_arrival) {

                    next_arrival =
                        v[i].arrival_time;
                }
            }

            current_time = next_arrival;
            continue;
        }

        printf(
            "V%d(%s) -> ",
            v[selected].id,
            v[selected].type
        );

        current_time += v[selected].burst_time;

        v[selected].completion_time =
            current_time;

        v[selected].turnaround_time =
            v[selected].completion_time -
            v[selected].arrival_time;

        v[selected].waiting_time =
            v[selected].turnaround_time -
            v[selected].burst_time;

        completed[selected] = 1;

        completed_count++;
    }

    printf("END\n");

    printVehicles(v, n);

    calculateMetrics(v, n, current_time);
}


/* =========================================================
   Main
   ========================================================= */

int main() {

    Vehicle vehicles[MAX_VEHICLES];

    int n;

    printf("============================================\n");
    printf("       SMARTTRAFFIC OS ENGINE\n");
    printf("============================================\n");

    printf("\nEnter number of vehicles: ");
    scanf("%d", &n);

    if (n <= 0 || n > MAX_VEHICLES) {

        printf("Invalid number of vehicles.\n");
        return 1;
    }

    /*
     * Input traffic data
     */

    for (int i = 0; i < n; i++) {

        vehicles[i].id = i + 1;

        printf("\n========== Vehicle V%d ==========\n", i + 1);

        printf("Arrival Time: ");
        scanf("%d", &vehicles[i].arrival_time);

        printf("Burst Time: ");
        scanf("%d", &vehicles[i].burst_time);

        printf("Priority (1=highest): ");
        scanf("%d", &vehicles[i].priority);

        printf("Vehicle Type: ");
        scanf("%19s", vehicles[i].type);

        printf("Direction: ");
        scanf("%9s", vehicles[i].direction);

        vehicles[i].remaining_time =
            vehicles[i].burst_time;
    }

    int quantum;

    printf("\nEnter Round Robin Time Quantum: ");
    scanf("%d", &quantum);

    if (quantum <= 0) {
        printf("Invalid quantum.\n");
        return 1;
    }

    /*
     * Run all algorithms
     */

    FCFS(vehicles, n);

    PriorityScheduling(vehicles, n);

    RoundRobin(vehicles, n, quantum);

    AdaptiveScheduling(vehicles, n);

    printf("\n============================================\n");
    printf("        SIMULATION COMPLETED\n");
    printf("============================================\n");

    return 0;
}