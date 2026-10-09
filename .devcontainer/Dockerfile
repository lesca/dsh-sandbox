ARG BASE_IMAGE=ubuntu:24.04
FROM ${BASE_IMAGE}

# 定义用户名变量，默认值为 node
ARG USERNAME=ubuntu
ARG SOURCE_FILE
ARG TZ
ENV TZ="$TZ"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install additional system packages (base image already includes git, curl, sudo, etc.)
COPY sudoer_default /etc/sudoers.d/sudoer_default
COPY ${SOURCE_FILE} /etc/apt/sources.list.d/ubuntu.sources
RUN export DEBIAN_FRONTEND=noninteractive \
  && apt-get -o Acquire::https::Verify-Peer=false update \
  && apt -o Acquire::https::Verify-Peer=false install -y ca-certificates \
  && apt-get install -y --no-install-recommends \
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
  python3 \
  python3-pip \
  python3-venv \
  python3-dev \
  jq \
  unzip \
  vim \
  git \
  # Network tools (for security testing)
  curl \
  wget \
  dnsutils \
  openssh-client \
  ipset \
  iptables \
  iproute2 \
  # system
  locales \
  fonts-noto-cjk \
  && locale-gen en_US.UTF-8 \
  && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# install pnpm (dsh plugin installation requires)
RUN npm install -g corepack && \
  corepack enable && \
  corepack prepare pnpm@latest --activate

# 切换到非 root 用户
USER ${USERNAME}
ARG HOME=/home/${USERNAME}

# Set environment variables
ENV DEVCONTAINER=true
ENV SHELL=/bin/zsh
ENV EDITOR=vim
ENV VISUAL=vim
ENV PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH:$PATH"

# Install dsh
RUN mkdir -p $HOME/.npm-global && \
  npm config set prefix "$HOME/.npm-global" && \
  npm install -g @deepseek-ai/dsh

# COPY files
COPY --chown=${USERNAME}:${USERNAME} entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --chown=${USERNAME}:${USERNAME} dsh-docker-proxy /opt/dsh-docker-proxy
COPY --chown=${USERNAME}:${USERNAME} .zshrc $HOME/.zshrc.custom

# Handle copied files
RUN sudo mkdir /workspace && \
  sudo chown -R ${USERNAME}:${USERNAME} /workspace && \
  sudo chmod +x /usr/local/bin/entrypoint.sh && \
  echo 'source ~/.zshrc.custom' >> $HOME/.zshrc

# Install Oh My Zsh
# renovate: datasource=github-releases depName=deluan/zsh-in-docker
RUN sh -c "$(curl -fsSL https://github.com/deluan/zsh-in-docker/releases/latest/download/zsh-in-docker.sh)" -- \
  -p git \
  -p https://github.com/zsh-users/zsh-autosuggestions \
  -p https://github.com/zsh-users/zsh-completions \
  -x && \
  $HOME/.oh-my-zsh/custom/themes/powerlevel10k/gitstatus/install -f

# install bsk (52800) - https://github.com/Tencent/BrowserSkill
RUN curl -fsSL https://raw.githubusercontent.com/Tencent/BrowserSkill/main/install.sh | sh

WORKDIR $HOME

EXPOSE 13080
EXPOSE 52800

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
