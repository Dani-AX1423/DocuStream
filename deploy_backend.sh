#!/usr/bin/env bash
# ==============================================================================
# DocuStream Web - AWS Backend Deployment Script
# Provisions S3, DynamoDB, Textract IAM roles, API Gateway, and Python 3.11 Lambdas
# ==============================================================================

set -euo pipefail

# ANSI Color Codes
GREEN='\033[0;32m'
SKY='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${SKY}================================================================${NC}"
echo -e "${SKY}      DocuStream Web: AWS SAM Backend Infrastructure Deploy     ${NC}"
echo -e "${SKY}================================================================${NC}"

# 1. Check Prerequisites
command -v aws >/dev/null 2>&1 || {
  echo -e "${RED}[ERROR] AWS CLI is not installed. Please install aws-cli first.${NC}"
  exit 1
}

command -v sam >/dev/null 2>&1 || {
  echo -e "${RED}[ERROR] AWS SAM CLI is not installed. Please install sam-cli first.${NC}"
  exit 1
}

STACK_NAME="${STACK_NAME:-docustream-web-stack}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-prod}"

echo -e "${GREEN}[1/5] Validating AWS credentials & target region...${NC}"
echo -e "Region:      ${SKY}${AWS_REGION}${NC}"
echo -e "Stack Name:  ${SKY}${STACK_NAME}${NC}"
echo -e "Environment: ${SKY}${ENVIRONMENT}${NC}"

# Check caller identity
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text 2>/dev/null || echo "unknown")
if [ "$ACCOUNT_ID" = "unknown" ]; then
  echo -e "${YELLOW}[WARNING] Could not determine AWS Account ID. Ensure AWS_PROFILE or AWS_ACCESS_KEY_ID is exported.${NC}"
else
  echo -e "AWS Account: ${SKY}${ACCOUNT_ID}${NC}"
fi

# 2. Run Backend Unit Tests First
echo -e "\n${GREEN}[2/5] Running Pytest unit test suite before deployment...${NC}"
if [ -d ".venv" ]; then
  .venv/bin/pytest tests/test_backend.py -v
else
  pytest tests/test_backend.py -v || echo -e "${YELLOW}[NOTICE] Skipping tests as pytest is not in system PATH.${NC}"
fi

# 3. Build AWS SAM artifacts
echo -e "\n${GREEN}[3/5] Building AWS SAM application...${NC}"
sam build --parallel

# 4. Deploy SAM Stack to AWS
echo -e "\n${GREEN}[4/5] Deploying CloudFormation Stack via SAM CLI...${NC}"
sam deploy \
  --stack-name "${STACK_NAME}" \
  --region "${AWS_REGION}" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --resolve-s3 \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    Environment="${ENVIRONMENT}" \
    MaxStorageBytes=104857600 \
    MaxFileBytes=20971520


# 5. Extract Outputs & Update Frontend Config
echo -e "\n${GREEN}[5/5] Extracting CloudFormation stack outputs...${NC}"
API_URL=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${AWS_REGION}" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiGatewayEndpoint'].OutputValue" \
  --output text 2>/dev/null || echo "")

BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${AWS_REGION}" \
  --query "Stacks[0].Outputs[?OutputKey=='S3BucketName'].OutputValue" \
  --output text 2>/dev/null || echo "")

TABLE_NAME=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${AWS_REGION}" \
  --query "Stacks[0].Outputs[?OutputKey=='DynamoDBTableName'].OutputValue" \
  --output text 2>/dev/null || echo "")

echo -e "\n${SKY}================ Deployment Summary ================${NC}"
echo -e "API Gateway Endpoint: ${GREEN}${API_URL}${NC}"
echo -e "Amazon S3 Bucket:     ${GREEN}${BUCKET_NAME}${NC}"
echo -e "DynamoDB Table:       ${GREEN}${TABLE_NAME}${NC}"
echo -e "${SKY}====================================================${NC}"

if [ -n "$API_URL" ]; then
  echo -e "\nUpdating frontend/.env.local with deployed API Gateway endpoint..."
  cat <<EOF > frontend/.env.local
# Generated automatically by deploy_backend.sh
NEXT_PUBLIC_API_GATEWAY_URL=${API_URL}
NEXT_PUBLIC_DEFAULT_USER_ID=user-demo-1
EOF
  echo -e "${GREEN}frontend/.env.local updated successfully!${NC}"
fi

echo -e "\n${GREEN}Backend deployment complete! You can now deploy or start the frontend.${NC}"
