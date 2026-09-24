FROM node:24-bookworm

ARG TZ
ENV TZ="$TZ"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Setup sudoers
COPY sudoer_default /etc/sudoers.d/sudoer_default

# Install additional system packages (base image already includes git, curl, sudo, etc.)
COPY sources.list /etc/apt/sources.list.d/sources.list
RUN mv /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list.d/debian.sources~ && \
  apt-get update && apt-get install -y --no-install-recommends \
  # Sandboxing support
  bubblewrap \
  socat \
  sudo \
  # Modern CLI tools
  fd-find \
  ripgrep \
  tmux \
  zsh \
  # Build tools
  build-essential \
  # Utilities
  jq \
  unzip \
  vim \
  git \
  # Network tools (for security testing)
  dnsutils \
  ipset \
  iptables \
  iproute2 \
  && apt-get clean && rm -rf /var/lib/apt/lists/*


# install pnpm (dsh plugin installation requires)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set environment variables
ENV DEVCONTAINER=true
ENV SHELL=/bin/zsh
ENV EDITOR=vim
ENV VISUAL=vim

WORKDIR /workspace

# Create directories and set ownership (combined for fewer layers)
# RUN useradd node -m -s /bin/zsh && \
RUN mkdir -p /workspace /opt && \
  chown -R node:node /workspace /opt

# Switch to non-root user for remaining setup
USER node

# Set PATH early so other user-installed binaries are available
ENV PATH="/home/node/.local/bin:$PATH"

# Install Oh My Zsh
# renovate: datasource=github-releases depName=deluan/zsh-in-docker
ARG ZSH_IN_DOCKER_VERSION=1.2.1
RUN sh -c "$(curl -fsSL https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -x

# Install dsh
RUN mkdir -p /home/node/.npm-global && \
  npm config set prefix '/home/node/.npm-global' && \
  npm install -g @deepseek-ai/dsh

# Copy zsh configuration
COPY --chown=node:node .zshrc /home/node/.zshrc.custom

# Append custom zshrc to the main one
RUN echo 'source ~/.zshrc.custom' >> /home/node/.zshrc

# Copy post_install script
COPY --chown=node:node post-install.sh /opt/post-install.sh
