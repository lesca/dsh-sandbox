# !/bin/bash
# Run this script from the host - NOT inside the container
docker-compose -f .devcontainer/x86_64_ninfer_v100/docker-compose.yaml down
docker-compose -f .devcontainer/x86_64_cuda/docker-compose.yaml down
docker-compose -f .devcontainer/x86_64/docker-compose.yaml down
docker-compose -f .devcontainer/arm64/docker-compose.yaml down