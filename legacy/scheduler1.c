#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_VEHICLES 100
#define MAX_JUNCTIONS 10
#define MAX_QUEUE 100

/* =========================================================
   ENUMS
   ========================================================= */

typedef enum {
    NORTH = 0,
    SOUTH = 1,
    EAST = 2,
    WEST = 3
} Direction;

typedef enum {
    RED,
    YELLOW,
    GREEN
} SignalState;


/* =========================================================
   VEHICLE STRUCTURE
   ========================================================= */

typedef struct {

    int id;

    int junction_id;

    int arrival_time;

    int burst_time;

    int remaining_time;

    int priority;

    int waiting_time;

    int completion_time;

    int turnaround_time;

    int completed;

    int is_emergency;

    char type[20];

    Direction direction;

} Vehicle;


/* =========================================================
   JUNCTION STRUCTURE
   ========================================================= */

typedef struct {

    int junction_id;

    char name[50];

    int queue_count[4];

    SignalState signals[4];

    int green_time[4];

} Junction;


/* =========================================================
   UTILITY FUNCTIONS
   ========================================================= */

const char* directionName(Direction direction)
{
    switch(direction)
    {
        case NORTH:
            return "NORTH";

        case SOUTH:
            return "SOUTH";

        case EAST:
            return "EAST";

        case WEST:
            return "WEST";

        default:
            return "UNKNOWN";
    }
}


const char* signalName(SignalState state)
{
    switch(state)
    {
        case RED:
            return "RED";

        case YELLOW:
            return "YELLOW";

        case GREEN:
            return "GREEN";

        default:
            return "UNKNOWN";
    }
}


void initializeJunction(Junction *junction, int id, const char *name)
{
    junction->junction_id = id;

    strcpy(junction->name, name);

    for(int i = 0; i < 4; i++)
    {
        junction->queue_count[i] = 0;

        junction->signals[i] = RED;

        junction->green_time[i] = 10;
    }
}


/* =========================================================
   ADD VEHICLE TO JUNCTION
   ========================================================= */

void addVehicleToJunction(
    Junction *junction,
    Vehicle *vehicle
)
{
    junction->queue_count[vehicle->direction]++;
}


/* =========================================================
   DISPLAY JUNCTION
   ========================================================= */

void displayJunction(Junction *junction)
{
    printf("\n");
    printf("============================================\n");
    printf("JUNCTION %d - %s\n",
           junction->junction_id,
           junction->name);

    printf("============================================\n");

    for(int i = 0; i < 4; i++)
    {
        printf(
            "%-6s | Vehicles: %-3d | Signal: %-6s | Green Time: %d sec\n",
            directionName((Direction)i),
            junction->queue_count[i],
            signalName(junction->signals[i]),
            junction->green_time[i]
        );
    }
}


/* =========================================================
   DISPLAY VEHICLES
   ========================================================= */

void displayVehicles(Vehicle vehicles[], int n)
{
    printf("\n");
    printf("=======================================================================\n");

    printf(
        "ID\tJunction\tType\t\tDirection\tPriority\tEmergency\n"
    );

    printf("=======================================================================\n");

    for(int i = 0; i < n; i++)
    {
        printf(
            "V%d\tJ%d\t\t%-10s\t%-8s\t%d\t\t%s\n",

            vehicles[i].id,

            vehicles[i].junction_id,

            vehicles[i].type,

            directionName(vehicles[i].direction),

            vehicles[i].priority,

            vehicles[i].is_emergency ? "YES" : "NO"
        );
    }

    printf("=======================================================================\n");
}


/* =========================================================
   TRAFFIC DENSITY
   ========================================================= */

int calculateTrafficDensity(Junction *junction)
{
    int total = 0;

    for(int i = 0; i < 4; i++)
    {
        total += junction->queue_count[i];
    }

    return total;
}


/* =========================================================
   ADAPTIVE TRAFFIC SCORE
   =========================================================

   Score considers:

   1. Queue length
   2. Waiting pressure
   3. Emergency vehicle

   Higher score = higher priority
   ========================================================= */

int calculateAdaptiveScore(
    Junction *junction,
    Direction direction,
    Vehicle vehicles[],
    int n
)
{
    int queueLength =
        junction->queue_count[direction];

    int waitingPressure = 0;

    int emergencyBonus = 0;

    for(int i = 0; i < n; i++)
    {
        if(
            vehicles[i].junction_id ==
            junction->junction_id &&

            vehicles[i].direction ==
            direction &&

            !vehicles[i].completed
        )
        {
            /*
             * Vehicles that have waited longer
             * increase the pressure.
             */

            waitingPressure +=
                vehicles[i].waiting_time;

            /*
             * Emergency vehicle receives
             * a large bonus.
             */

            if(vehicles[i].is_emergency)
            {
                emergencyBonus += 100;
            }
        }
    }

    /*
     * Adaptive formula:
     *
     * Queue Length × 2
     * + Waiting Pressure
     * + Emergency Bonus
     */

    int score =
        (queueLength * 2)
        + waitingPressure
        + emergencyBonus;

    return score;
}


/* =========================================================
   FIND BEST DIRECTION
   ========================================================= */

Direction findBestDirection(
    Junction *junction,
    Vehicle vehicles[],
    int n
)
{
    int bestScore = -1;

    Direction bestDirection = NORTH;

    for(int i = 0; i < 4; i++)
    {
        int score =
            calculateAdaptiveScore(
                junction,
                (Direction)i,
                vehicles,
                n
            );

        printf(
            "%-6s -> Adaptive Score: %d\n",
            directionName((Direction)i),
            score
        );

        if(score > bestScore)
        {
            bestScore = score;

            bestDirection = (Direction)i;
        }
    }

    return bestDirection;
}


/* =========================================================
   CALCULATE DYNAMIC GREEN TIME
   ========================================================= */

int calculateGreenTime(int queueLength)
{
    if(queueLength <= 0)
    {
        return 0;
    }

    if(queueLength <= 5)
    {
        return 10;
    }

    if(queueLength <= 10)
    {
        return 20;
    }

    if(queueLength <= 20)
    {
        return 30;
    }

    return 40;
}


/* =========================================================
   UPDATE SIGNAL
   ========================================================= */

void updateSignal(
    Junction *junction,
    Direction selectedDirection
)
{
    for(int i = 0; i < 4; i++)
    {
        junction->signals[i] = RED;
    }

    junction->signals[selectedDirection] = GREEN;

    junction->green_time[selectedDirection] =
        calculateGreenTime(
            junction->queue_count[selectedDirection]
        );
}


/* =========================================================
   ADAPTIVE SIGNAL CONTROL
   ========================================================= */

void adaptiveSignalControl(
    Junction *junction,
    Vehicle vehicles[],
    int n
)
{
    printf("\n");
    printf("============================================\n");
    printf("ADAPTIVE SIGNAL DECISION\n");
    printf("============================================\n");

    Direction bestDirection =
        findBestDirection(
            junction,
            vehicles,
            n
        );

    updateSignal(
        junction,
        bestDirection
    );

    printf("\nSelected Direction : %s\n",
           directionName(bestDirection));

    printf("Signal State       : GREEN\n");

    printf("Green Time         : %d seconds\n",
           junction->green_time[bestDirection]);
}


/* =========================================================
   FCFS
   ========================================================= */

void FCFS(
    Vehicle vehicles[],
    int n
)
{
    printf("\n");
    printf("============================================\n");
    printf("FCFS SCHEDULING\n");
    printf("============================================\n");

    int currentTime = 0;

    int completed = 0;

    while(completed < n)
    {
        int selected = -1;

        /*
         * Find earliest available vehicle.
         */

        for(int i = 0; i < n; i++)
        {
            if(
                !vehicles[i].completed &&
                vehicles[i].arrival_time <= currentTime
            )
            {
                if(
                    selected == -1 ||
                    vehicles[i].arrival_time <
                    vehicles[selected].arrival_time
                )
                {
                    selected = i;
                }
            }
        }

        /*
         * No vehicle available.
         */

        if(selected == -1)
        {
            currentTime++;
            continue;
        }

        printf(
            "V%d -> ",
            vehicles[selected].id
        );

        /*
         * Execute vehicle.
         */

        currentTime +=
            vehicles[selected].burst_time;

        vehicles[selected].completion_time =
            currentTime;

        vehicles[selected].turnaround_time =
            currentTime -
            vehicles[selected].arrival_time;

        vehicles[selected].waiting_time =
            vehicles[selected].turnaround_time -
            vehicles[selected].burst_time;

        vehicles[selected].completed = 1;

        completed++;
    }

    printf("END\n");
}


/* =========================================================
   PRIORITY SCHEDULING
   ========================================================= */

void PriorityScheduling(
    Vehicle vehicles[],
    int n
)
{
    printf("\n");
    printf("============================================\n");
    printf("PRIORITY SCHEDULING\n");
    printf("============================================\n");

    int currentTime = 0;

    int completed = 0;

    while(completed < n)
    {
        int selected = -1;

        for(int i = 0; i < n; i++)
        {
            if(
                !vehicles[i].completed &&
                vehicles[i].arrival_time <= currentTime
            )
            {
                if(
                    selected == -1 ||
                    vehicles[i].priority <
                    vehicles[selected].priority
                )
                {
                    selected = i;
                }
            }
        }

        if(selected == -1)
        {
            currentTime++;
            continue;
        }

        printf(
            "V%d(priority=%d) -> ",
            vehicles[selected].id,
            vehicles[selected].priority
        );

        currentTime +=
            vehicles[selected].burst_time;

        vehicles[selected].completion_time =
            currentTime;

        vehicles[selected].turnaround_time =
            currentTime -
            vehicles[selected].arrival_time;

        vehicles[selected].waiting_time =
            vehicles[selected].turnaround_time -
            vehicles[selected].burst_time;

        vehicles[selected].completed = 1;

        completed++;
    }

    printf("END\n");
}


/* =========================================================
   ROUND ROBIN
   ========================================================= */

void RoundRobin(
    Vehicle vehicles[],
    int n,
    int quantum
)
{
    printf("\n");
    printf("============================================\n");
    printf("ROUND ROBIN\n");
    printf("============================================\n");

    printf("Time Quantum = %d\n", quantum);

    int queue[MAX_VEHICLES * 10];

    int front = 0;

    int rear = 0;

    int visited[MAX_VEHICLES] = {0};

    int completed = 0;

    int currentTime = 0;

    while(completed < n)
    {
        /*
         * Add newly arrived vehicles.
         */

        for(int i = 0; i < n; i++)
        {
            if(
                !visited[i] &&
                vehicles[i].arrival_time <= currentTime
            )
            {
                queue[rear++] = i;

                visited[i] = 1;
            }
        }

        /*
         * If queue is empty,
         * move time forward.
         */

        if(front == rear)
        {
            currentTime++;

            continue;
        }

        int index = queue[front++];

        printf(
            "V%d -> ",
            vehicles[index].id
        );

        int executionTime;

        if(
            vehicles[index].remaining_time >
            quantum
        )
        {
            executionTime = quantum;
        }
        else
        {
            executionTime =
                vehicles[index].remaining_time;
        }

        vehicles[index].remaining_time -=
            executionTime;

        currentTime += executionTime;

        /*
         * Add vehicles that arrived
         * during execution.
         */

        for(int i = 0; i < n; i++)
        {
            if(
                !visited[i] &&
                vehicles[i].arrival_time <= currentTime
            )
            {
                queue[rear++] = i;

                visited[i] = 1;
            }
        }

        /*
         * Vehicle finished.
         */

        if(
            vehicles[index].remaining_time == 0
        )
        {
            vehicles[index].completion_time =
                currentTime;

            vehicles[index].turnaround_time =
                currentTime -
                vehicles[index].arrival_time;

            vehicles[index].waiting_time =
                vehicles[index].turnaround_time -
                vehicles[index].burst_time;

            vehicles[index].completed = 1;

            completed++;
        }
        else
        {
            /*
             * Put unfinished vehicle
             * at the back of queue.
             */

            queue[rear++] = index;
        }
    }

    printf("END\n");
}


/* =========================================================
   RESET VEHICLES
   ========================================================= */

void resetVehicles(
    Vehicle original[],
    Vehicle copy[],
    int n
)
{
    for(int i = 0; i < n; i++)
    {
        copy[i] = original[i];

        copy[i].remaining_time =
            copy[i].burst_time;

        copy[i].waiting_time = 0;

        copy[i].completion_time = 0;

        copy[i].turnaround_time = 0;

        copy[i].completed = 0;
    }
}


/* =========================================================
   UPDATE WAITING TIMES
   ========================================================= */

void updateWaitingTimes(
    Vehicle vehicles[],
    int n,
    int currentTime
)
{
    for(int i = 0; i < n; i++)
    {
        if(
            !vehicles[i].completed &&
            vehicles[i].arrival_time < currentTime
        )
        {
            vehicles[i].waiting_time =
                currentTime -
                vehicles[i].arrival_time;
        }
    }
}


/* =========================================================
   CALCULATE METRICS
   ========================================================= */

void calculateMetrics(
    Vehicle vehicles[],
    int n,
    int totalTime
)
{
    double totalWaiting = 0;

    double totalTurnaround = 0;

    for(int i = 0; i < n; i++)
    {
        totalWaiting +=
            vehicles[i].waiting_time;

        totalTurnaround +=
            vehicles[i].turnaround_time;
    }

    printf("\n");
    printf("============================================\n");
    printf("PERFORMANCE METRICS\n");
    printf("============================================\n");

    printf(
        "Average Waiting Time    : %.2f\n",
        totalWaiting / n
    );

    printf(
        "Average Turnaround Time : %.2f\n",
        totalTurnaround / n
    );

    if(totalTime > 0)
    {
        printf(
            "Throughput              : %.2f vehicles/unit\n",
            (double)n / totalTime
        );
    }
}


/* =========================================================
   DISPLAY FINAL SIGNAL STATE
   ========================================================= */

void displaySignalState(
    Junction *junction
)
{
    printf("\n");
    printf("============================================\n");
    printf("FINAL SIGNAL STATE\n");
    printf("============================================\n");

    for(int i = 0; i < 4; i++)
    {
        printf(
            "%-6s : %-6s\n",
            directionName((Direction)i),
            signalName(junction->signals[i])
        );
    }
}


/* =========================================================
   MAIN
   ========================================================= */

int main()
{
    printf("\n");
    printf("====================================================\n");
    printf("       SMARTTRAFFIC - OS ENGINE V2\n");
    printf("====================================================\n");

    /*
     * -----------------------------------------------------
     * CREATE MULTIPLE JUNCTIONS
     * -----------------------------------------------------
     */

    Junction junctions[MAX_JUNCTIONS];

    int junctionCount = 4;

    initializeJunction(
        &junctions[0],
        1,
        "Junction 1"
    );

    initializeJunction(
        &junctions[1],
        2,
        "Junction 2"
    );

    initializeJunction(
        &junctions[2],
        3,
        "Junction 3"
    );

    initializeJunction(
        &junctions[3],
        4,
        "Junction 4"
    );

    /*
     * -----------------------------------------------------
     * INPUT VEHICLES
     * -----------------------------------------------------
     */

    Vehicle vehicles[MAX_VEHICLES];

    int n;

    printf("\nEnter number of vehicles: ");
    scanf("%d", &n);

    if(n <= 0 || n > MAX_VEHICLES)
    {
        printf("Invalid number of vehicles.\n");
        return 1;
    }

    for(int i = 0; i < n; i++)
    {
        vehicles[i].id = i + 1;

        printf("\n");
        printf("---------- VEHICLE V%d ----------\n", i + 1);

        /*
         * Junction
         */

        printf("Junction ID (1-4): ");
        scanf("%d", &vehicles[i].junction_id);

        if(
            vehicles[i].junction_id < 1 ||
            vehicles[i].junction_id > junctionCount
        )
        {
            printf("Invalid junction ID.\n");
            return 1;
        }

        /*
         * Arrival time
         */

        printf("Arrival Time: ");
        scanf("%d", &vehicles[i].arrival_time);

        if(vehicles[i].arrival_time < 0)
        {
            printf("Invalid arrival time.\n");
            return 1;
        }

        /*
         * Burst time
         */

        printf("Burst Time: ");
        scanf("%d", &vehicles[i].burst_time);

        if(vehicles[i].burst_time <= 0)
        {
            printf("Burst time must be greater than 0.\n");
            return 1;
        }

        /*
         * Priority
         */

        printf("Priority (1=highest): ");
        scanf("%d", &vehicles[i].priority);

        if(vehicles[i].priority <= 0)
        {
            printf("Priority must be greater than 0.\n");
            return 1;
        }

        /*
         * Vehicle type
         */

        printf("Vehicle Type: ");
        scanf("%19s", vehicles[i].type);

        /*
         * Direction
         */

        printf(
            "Direction (0=NORTH 1=SOUTH 2=EAST 3=WEST): "
        );

        int directionInput;

        scanf("%d", &directionInput);

        if(
            directionInput < 0 ||
            directionInput > 3
        )
        {
            printf("Invalid direction.\n");
            return 1;
        }

        vehicles[i].direction =
            (Direction)directionInput;

        /*
         * Emergency vehicle
         */

        printf("Is Emergency? (1=YES 0=NO): ");

        scanf(
            "%d",
            &vehicles[i].is_emergency
        );

        if(
            vehicles[i].is_emergency != 0 &&
            vehicles[i].is_emergency != 1
        )
        {
            printf("Invalid emergency value.\n");
            return 1;
        }

        /*
         * Emergency vehicles get highest priority
         */

        if(vehicles[i].is_emergency)
        {
            vehicles[i].priority = 1;
        }

        /*
         * Initialize runtime values
         */

        vehicles[i].remaining_time =
            vehicles[i].burst_time;

        vehicles[i].completed = 0;

        vehicles[i].waiting_time = 0;

        vehicles[i].completion_time = 0;

        vehicles[i].turnaround_time = 0;

        /*
         * Add vehicle to its junction
         */

        addVehicleToJunction(
            &junctions[
                vehicles[i].junction_id - 1
            ],
            &vehicles[i]
        );
    }

    /*
     * -----------------------------------------------------
     * DISPLAY INITIAL TRAFFIC
     * -----------------------------------------------------
     */

    displayVehicles(
        vehicles,
        n
    );

    /*
     * Display all junctions
     */

    printf("\n");
    printf("========== INITIAL JUNCTION STATUS ==========\n");

    for(int i = 0; i < junctionCount; i++)
    {
        displayJunction(
            &junctions[i]
        );
    }

    /*
     * -----------------------------------------------------
     * TRAFFIC DENSITY
     * -----------------------------------------------------
     */

    printf("\n");
    printf("========== TRAFFIC DENSITY ==========\n");

    for(int i = 0; i < junctionCount; i++)
    {
        int density =
            calculateTrafficDensity(
                &junctions[i]
            );

        printf(
            "Junction %d -> %d vehicles\n",
            junctions[i].junction_id,
            density
        );
    }

    /*
     * -----------------------------------------------------
     * ADAPTIVE SIGNAL CONTROL
     * -----------------------------------------------------
     */

    printf("\n");
    printf("====================================================\n");
    printf("       ADAPTIVE CONTROL FOR ALL JUNCTIONS\n");
    printf("====================================================\n");

    for(int i = 0; i < junctionCount; i++)
    {
        printf(
            "\n******** JUNCTION %d ********\n",
            junctions[i].junction_id
        );

        adaptiveSignalControl(
            &junctions[i],
            vehicles,
            n
        );
    }

    /*
     * -----------------------------------------------------
     * DISPLAY SIGNAL STATES
     * -----------------------------------------------------
     */

    printf("\n");
    printf("====================================================\n");
    printf("             SIGNAL STATES\n");
    printf("====================================================\n");

    for(int i = 0; i < junctionCount; i++)
    {
        displaySignalState(
            &junctions[i]
        );
    }

    /*
     * -----------------------------------------------------
     * RUN FCFS
     * -----------------------------------------------------
     */

    Vehicle fcfsVehicles[MAX_VEHICLES];

    resetVehicles(
        vehicles,
        fcfsVehicles,
        n
    );

    FCFS(
        fcfsVehicles,
        n
    );

    /*
     * -----------------------------------------------------
     * FCFS METRICS
     * -----------------------------------------------------
     */

    int fcfsTotalTime = 0;

    for(int i = 0; i < n; i++)
    {
        if(
            fcfsVehicles[i].completion_time >
            fcfsTotalTime
        )
        {
            fcfsTotalTime =
                fcfsVehicles[i].completion_time;
        }
    }

    printf("\nFCFS RESULTS:");
    calculateMetrics(
        fcfsVehicles,
        n,
        fcfsTotalTime
    );

    /*
     * -----------------------------------------------------
     * RUN PRIORITY
     * -----------------------------------------------------
     */

    Vehicle priorityVehicles[MAX_VEHICLES];

    resetVehicles(
        vehicles,
        priorityVehicles,
        n
    );

    PriorityScheduling(
        priorityVehicles,
        n
    );

    /*
     * -----------------------------------------------------
     * PRIORITY METRICS
     * -----------------------------------------------------
     */

    int priorityTotalTime = 0;

    for(int i = 0; i < n; i++)
    {
        if(
            priorityVehicles[i].completion_time >
            priorityTotalTime
        )
        {
            priorityTotalTime =
                priorityVehicles[i].completion_time;
        }
    }

    printf("\nPRIORITY RESULTS:");

    calculateMetrics(
        priorityVehicles,
        n,
        priorityTotalTime
    );

    /*
     * -----------------------------------------------------
     * RUN ROUND ROBIN
     * -----------------------------------------------------
     */

    Vehicle rrVehicles[MAX_VEHICLES];

    resetVehicles(
        vehicles,
        rrVehicles,
        n
    );

    int quantum;

    printf("\nEnter Round Robin Time Quantum: ");
    scanf("%d", &quantum);

    if(quantum <= 0)
    {
        printf("Invalid quantum.\n");
        return 1;
    }

    RoundRobin(
        rrVehicles,
        n,
        quantum
    );

    /*
     * -----------------------------------------------------
     * ROUND ROBIN METRICS
     * -----------------------------------------------------
     */

    int rrTotalTime = 0;

    for(int i = 0; i < n; i++)
    {
        if(
            rrVehicles[i].completion_time >
            rrTotalTime
        )
        {
            rrTotalTime =
                rrVehicles[i].completion_time;
        }
    }

    printf("\nROUND ROBIN RESULTS:");

    calculateMetrics(
        rrVehicles,
        n,
        rrTotalTime
    );

    /*
     * -----------------------------------------------------
     * FINAL JUNCTION STATUS
     * -----------------------------------------------------
     */

    printf("\n");
    printf("====================================================\n");
    printf("             FINAL JUNCTION STATUS\n");
    printf("====================================================\n");

    for(int i = 0; i < junctionCount; i++)
    {
        displayJunction(
            &junctions[i]
        );
    }

    /*
     * -----------------------------------------------------
     * PROGRAM COMPLETE
     * -----------------------------------------------------
     */

    printf("\n");
    printf("====================================================\n");
    printf("             SMARTTRAFFIC V2 COMPLETE\n");
    printf("====================================================\n");

    return 0;
}