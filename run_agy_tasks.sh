#!/bin/bash

PLAN_FILE="PLAN.md"

# Check if PLAN.md exists
if [ ! -f "$PLAN_FILE" ]; then
    echo "Error: $PLAN_FILE not found!"
    exit 1
fi

# Loop as long as there are incomplete tasks (indicated by "- [ ]")
while grep -q -- "- \[ \]" "$PLAN_FILE"; do
    echo "=========================================================="
    echo "Pending tasks found. Starting agy for the next task..."
    echo "=========================================================="
    
    agy --dangerously-skip-permissions -p "Check $PLAN_FILE
  1. It should have task status tracker, if not add it.
  2. Pick up first not implemented task, mark it IN_PROGRESS and get it done, commit changes and then mark it DONE. if all are done, stop."
    
    # Check the exit status of agy
    # If agy fails, break the loop to prevent infinite retries on a broken task
    if [ $? -ne 0 ]; then
        echo "agy exited with an error. Stopping the execution loop."
        exit 1
    fi
    
    echo "Sleeping for 2 seconds before the next task..."
    sleep 2
done

echo "=========================================================="
echo "All tasks in $PLAN_FILE have been completed!"
echo "=========================================================="
