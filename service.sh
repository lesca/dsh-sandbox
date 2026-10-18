# !/bin/bash
# Run this script from the host - NOT inside the container

# Define color codes
GREEN='\033[32m'
NC='\033[0m' # No Color (Resets formatting)

stop() {
  echo -e "${GREEN}Stop containers${NC}"
  docker-compose -f .devcontainer/x86_64_comfyui_v100/docker-compose.yaml down
  docker-compose -f .devcontainer/x86_64_strata_v100/docker-compose.yaml down
  docker-compose -f .devcontainer/x86_64_ninfer_v100/docker-compose.yaml down
  docker-compose -f .devcontainer/x86_64_cuda/docker-compose.yaml down
  docker-compose -f .devcontainer/x86_64/docker-compose.yaml down
  docker-compose -f .devcontainer/arm64/docker-compose.yaml down
}

start() {
  case $1 in 
    comfy*) ARCH=x86_64_comfyui_v100 ;;
    strata*) ARCH=x86_64_strata_v100 ;;
    ninfer*) ARCH=x86_64_ninfer_v100 ;;
    cuda*) ARCH=x86_64_cuda ;;
    x86*) ARCH=x86_64 ;;
    arm*) ARCH=arm64 ;;
    *) ARCH=x86_64_strata_v100 ;;
  esac
  echo -e "${GREEN}Start $ARCH${NC}"
  docker-compose -f .devcontainer/$ARCH/docker-compose.yaml up -d
}

if [ -z "$1" ]; then
  stop
  start
elif [[ "$1" == "stop" || "$1" == "down" || "$1" == "0" ]]; then
  stop
elif [[ "$2" == "stop" || "$2" == "down" || "$2" == "0" ]]; then
  stop
else
  stop
  start "$@"
fi