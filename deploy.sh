#!/bin/bash

# deploy.sh - Simple git commit and push script
# Usage: ./deploy.sh "your commit message"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if commit message is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please provide a commit message${NC}"
    echo "Usage: ./deploy.sh \"your commit message\""
    exit 1
fi

COMMIT_MESSAGE="$1"

# Check if there are changes to commit
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}No changes to commit${NC}"
    exit 0
fi

echo -e "${GREEN}📋 Checking git status...${NC}"
git status

echo -e "\n${YELLOW}Files to be committed:${NC}"
git status --short

# Exclude firebase-debug.log from staging
echo -e "\n${GREEN}📦 Staging files (excluding firebase-debug.log)...${NC}"
git add .
git reset HEAD firebase-debug.log 2>/dev/null

echo -e "\n${GREEN}💾 Creating commit...${NC}"
git commit -m "$(cat <<EOF
${COMMIT_MESSAGE}

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ Commit created successfully${NC}"

    echo -e "\n${GREEN}🚀 Pushing to GitHub...${NC}"
    git push

    if [ $? -eq 0 ]; then
        echo -e "\n${GREEN}✅ Successfully pushed to GitHub!${NC}"
    else
        echo -e "\n${RED}❌ Failed to push to GitHub${NC}"
        exit 1
    fi
else
    echo -e "\n${RED}❌ Failed to create commit${NC}"
    exit 1
fi
