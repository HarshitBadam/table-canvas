#!/bin/bash

echo ""
echo "Stopping Table Canvas..."

docker compose down > /dev/null 2>&1

echo "Stopped."
echo ""
