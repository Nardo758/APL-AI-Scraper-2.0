#!/bin/bash
# local-ci.sh - Simulate CI environment locally

set -e

echo "🧪 Local CI Simulation"

# Function to run stubbed tests
run_stubbed_tests() {
    echo "🔧 Running stubbed tests..."
    export NODE_ENV=test
    unset SUPABASE_URL
    unset SUPABASE_ANON_KEY
    unset REDIS_URL
    
    npm ci --no-audit --no-fund
    npm run lint || true
    npm test
    npm run test:integration
    echo "✅ Stubbed tests completed"
}

# Function to run integration tests
run_integration_tests() {
    echo "🔧 Running integration tests..."
    export NODE_ENV=test
    export REDIS_URL="redis://localhost:6379"
    
    # Check if Redis is running
    if ! command -v redis-cli >/dev/null 2>&1 || ! redis-cli ping | grep -q PONG; then
        echo "❌ Redis is not running. Start with: docker run -d -p 6379:6379 redis:alpine"
        exit 1
    fi
    
    # Check if Supabase credentials are set
    if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_ANON_KEY" ]]; then
        echo "⚠️  Supabase credentials not set. Tests will use stubs for Supabase."
    fi
    
    npm run test:all
    echo "✅ Integration tests completed"
}

# Main execution
case "${1:-stubbed}" in
    "stubbed")
        run_stubbed_tests
        ;;
    "integration")
        run_integration_tests
        ;;
    "all")
        run_stubbed_tests
        echo "---"
        run_integration_tests
        ;;
    *)
        echo "Usage: $0 {stubbed|integration|all}"
        exit 1
        ;;
esac

echo "🎉 Local CI simulation complete!"
