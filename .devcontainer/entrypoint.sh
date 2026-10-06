#!/bin/bash

export DSH_PORT=${DSH_PORT:-3080}
export LISTEN_PORT=${LISTEN_PORT:-13080}

# link workspace to home
ln -sfn /workspace $HOME/workspace

# install custom dsh plugins if not installed yet
if [ ! -d $HOME/.dsh/profiles ]; then
  if [ -f /opt/dsh-plugins.sh ]; then
    echo "INFO: Installing dsh plugins"
    bash /opt/dsh-plugins.sh
  else
    echo "INFO: NOT EXIST /opt/dsh-plugins.sh"
  fi
else
  echo "INFO: Skip installing dsh plugins due to profiles already exist"
fi

# if $1 is not empty, exec $@
if [ -n "$1" ]; then
  exec "$@"
else
  node /opt/dsh-docker-proxy/src/index.js --dsh-port $DSH_PORT --listen $LISTEN_PORT
fi
