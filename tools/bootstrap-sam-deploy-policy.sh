#!/usr/bin/env bash
# Re-apply SamDeployPolicy to orion-sam-deploy-dev with the corrected
# resource patterns. The original bootstrap used 'orion-backend-*-dev'
# which does NOT match the literal stack name 'orion-backend-dev'.
#
# Usage:
#   AWS_PROFILE=orion-admin bash bootstrap-sam-deploy-policy.sh
# or (after `aws sso login`):
#   aws iam put-role-policy \
#     --role-name orion-sam-deploy-dev \
#     --policy-name SamDeployPolicy \
#     --policy-document file://policy-orion-backend.json
set -euo pipefail
POLICY_PATH="${POLICY_PATH:-$(dirname "$0")/policy-orion-backend.json}"
if [ ! -f "$POLICY_PATH" ]; then
  echo "policy file not found: $POLICY_PATH" >&2
  exit 1
fi
echo "Applying SamDeployPolicy from $POLICY_PATH ..."
aws iam put-role-policy \
  --role-name orion-sam-deploy-dev \
  --policy-name SamDeployPolicy \
  --policy-document "file://$POLICY_PATH"
echo "Done. Verify with:"
echo "  aws iam get-role-policy --role-name orion-sam-deploy-dev --policy-name SamDeployPolicy"
