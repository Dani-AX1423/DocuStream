#!/usr/bin/env bash
# ==============================================================================
# DocuStream Web - Vercel Frontend Deployment Script
# Deploys Next.js application to Vercel and links API Gateway environment variables
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'
SKY='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${SKY}================================================================${NC}"
echo -e "${SKY}        DocuStream Web: Next.js Frontend Vercel Deploy          ${NC}"
echo -e "${SKY}================================================================${NC}"

# 1. Check working directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${SCRIPT_DIR}/frontend"

if [ ! -d "${FRONTEND_DIR}" ]; then
  echo -e "${RED}[ERROR] Frontend directory not found at ${FRONTEND_DIR}${NC}"
  exit 1
fi

cd "${FRONTEND_DIR}"

# 2. Check or prompt for NEXT_PUBLIC_API_GATEWAY_URL
if [ -f ".env.local" ]; then
  # Source .env.local if present
  set -a
  # shellcheck disable=SC1091
  source .env.local 2>/dev/null || true
  set +a
fi

API_GATEWAY_URL="${NEXT_PUBLIC_API_GATEWAY_URL:-}"

if [ -z "${API_GATEWAY_URL}" ]; then
  echo -e "${YELLOW}[NOTICE] NEXT_PUBLIC_API_GATEWAY_URL is not set in environment or frontend/.env.local.${NC}"
  echo -e "You can provide your deployed AWS API Gateway stage endpoint."
  echo -e "Example: https://xxxxxx.execute-api.us-east-1.amazonaws.com/prod"
  read -r -p "Enter API Gateway URL (or press Enter for local mock mode): " INPUT_URL
  if [ -n "${INPUT_URL}" ]; then
    API_GATEWAY_URL="${INPUT_URL}"
    echo "NEXT_PUBLIC_API_GATEWAY_URL=${API_GATEWAY_URL}" >> .env.local
  fi
fi

# 3. Verify Local Build
echo -e "\n${GREEN}[1/3] Verifying Next.js production build...${NC}"
npm run build

# 4. Check for Vercel CLI
echo -e "\n${GREEN}[2/3] Checking Vercel CLI...${NC}"
if ! command -v vercel >/dev/null 2>&1; then
  echo -e "${YELLOW}Vercel CLI not found globally. Using npx vercel...${NC}"
  VERCEL_CMD="npx --yes vercel"
else
  VERCEL_CMD="vercel"
fi

# 5. Deploy to Vercel
echo -e "\n${GREEN}[3/3] Deploying to Vercel Production...${NC}"
if [ -n "${API_GATEWAY_URL}" ]; then
  echo -e "Deploying with NEXT_PUBLIC_API_GATEWAY_URL=${SKY}${API_GATEWAY_URL}${NC}"
  ${VERCEL_CMD} --prod \
    --env NEXT_PUBLIC_API_GATEWAY_URL="${API_GATEWAY_URL}" \
    --build-env NEXT_PUBLIC_API_GATEWAY_URL="${API_GATEWAY_URL}" \
    "$@"
else
  echo -e "Deploying with local edge fallback mock mode..."
  ${VERCEL_CMD} --prod "$@"
fi

echo -e "\n${GREEN}================================================================${NC}"
echo -e "${GREEN}   Frontend deployment triggered successfully on Vercel!       ${NC}"
echo -e "${GREEN}================================================================${NC}"
echo -e "To configure environment variables directly on the Vercel Dashboard:"
echo -e "1. Navigate to: https://vercel.com/dashboard -> Project Settings -> Environment Variables"
echo -e "2. Add: Key = ${SKY}NEXT_PUBLIC_API_GATEWAY_URL${NC}"
echo -e "        Value = ${SKY}${API_GATEWAY_URL:-<YOUR_API_GATEWAY_URL>}${NC}"
echo -e "3. Redeploy to activate new environment variable across Edge nodes."
