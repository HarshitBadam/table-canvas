#!/bin/bash

echo ""
echo "⏳ Starting Table Canvas..."
echo ""

docker compose up -d --build > /dev/null 2>&1

echo "   Waiting for services to be ready..."

# Wait for backend to be healthy (up to 60 seconds)
for i in {1..60}; do
    if docker compose exec -T backend echo "ready" > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Wait for MongoDB to be fully healthy via docker healthcheck
echo "   Waiting for MongoDB..."
for i in {1..30}; do
    if docker compose exec -T mongodb mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Additional buffer for connection stability
sleep 3

echo "   Seeding database..."

# Run seed with retry logic (up to 5 attempts with increasing delays)
SEED_SUCCESS=false
SEED_OUTPUT=""
for attempt in 1 2 3 4 5; do
    SEED_OUTPUT=$(docker compose exec -T backend npm run seed 2>&1)
    if [ $? -eq 0 ]; then
        SEED_SUCCESS=true
        break
    fi
    echo "   Attempt $attempt failed, retrying..."
    sleep $((attempt * 2))
done

if [ "$SEED_SUCCESS" = true ]; then
    echo ""
    echo "✅ Ready!"
    echo ""
    echo "   🌐 Open http://localhost:5173"
    echo ""
    echo "   👤 Email: demo@tablecanvas.app"
    echo "   🔑 Password: 1234"
    echo ""
    echo "   Commands:"
    echo "   npm run docker:logs  - View logs"
    echo "   npm run docker:down  - Stop"
    echo ""
else
    echo ""
    echo "⚠️  Started but seeding failed."
    echo ""
    echo "   Error details:"
    echo "$SEED_OUTPUT" | head -20
    echo ""
    echo "   Try manually: docker compose exec backend npm run seed"
    echo ""
    echo "   🌐 Open http://localhost:5173"
    echo ""
fi
