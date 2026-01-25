#!/bin/bash

echo ""
echo "⏳ Starting Table Canvas..."
echo ""

docker compose up -d --build > /dev/null 2>&1

echo "   Waiting for services to be ready..."

# Wait for backend to be healthy (up to 30 seconds)
for i in {1..30}; do
    if docker compose exec -T backend echo "ready" > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Additional wait for MongoDB connection
sleep 2

echo "   Seeding database..."

# Run seed and capture result
if docker compose exec -T backend npm run seed > /dev/null 2>&1; then
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
    echo "⚠️  Started but seeding may have failed."
    echo "   Run manually: docker compose exec backend npm run seed"
    echo ""
    echo "   🌐 Open http://localhost:5173"
    echo ""
fi
