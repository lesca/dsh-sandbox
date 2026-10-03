FROM ubuntu:24.04

# 定义用户名变量，默认值为 node
ARG USERNAME=ubuntu
ARG TZ
ENV TZ="$TZ"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ARG TARGETARCH
# 如果 TARGETARCH 是 arm64，则值为 ubuntu-ports.sources，否则（amd64、386 等）统一为 ubuntu.sources
ARG SOURCE_FILE=${TARGETARCH#arm64}
# 如果上面的结果为空（说明确实是 arm64，被 #arm64 裁剪掉了），则赋值为 ubuntu-ports.sources；否则加上后缀 .sources
ARG SOURCE_FILE=${SOURCE_FILE:+ubuntu.sources}
ARG SOURCE_FILE=${SOURCE_FILE:-ubuntu-ports.sources}
RUN echo "Current target architecture is: $TARGETARCH, using source file: $SOURCE_FILE"

# Install additional system packages (base image already includes git, curl, sudo, etc.)
COPY sudoer_default /etc/sudoers.d/sudoer_default
COPY ${SOURCE_FILE} /etc/apt/sources.list.d/ubuntu.sources
RUN apt-get -o Acquire::https::Verify-Peer=false update \
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
  && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && apt-get clean && rm -rf /var/lib/apt/lists/*


# install pnpm (dsh plugin installation requires)
RUN npm install -g corepack && \
  corepack enable && \
  corepack prepare pnpm@latest --activate

# Set environment variables
ENV DEVCONTAINER=true
ENV SHELL=/bin/zsh
ENV EDITOR=vim
ENV VISUAL=vim

# 使用变量设置动态的 PATH
ENV PATH="/home/${USERNAME}/.local/bin:$PATH"

WORKDIR /workspace

# 使用变量动态创建用户，并设置对应的家目录 (/home/$USERNAME)
# RUN useradd ${USERNAME} -m -s /bin/zsh && \
RUN  mkdir -p /workspace /opt && \
  chown -R ${USERNAME}:${USERNAME} /workspace /opt

# 切换到非 root 用户
USER ${USERNAME}

# Install Oh My Zsh
# renovate: datasource=github-releases depName=deluan/zsh-in-docker
RUN sh -c "$(curl -fsSL https://github.com/deluan/zsh-in-docker/releases/latest/download/zsh-in-docker.sh)" -- \
  -p git \
  -x

# Install dsh
RUN mkdir -p /home/${USERNAME}/.npm-global && \
  npm config set prefix "/home/${USERNAME}/.npm-global" && \
  npm install -g @deepseek-ai/dsh

# Copy zsh configuration
COPY --chown=${USERNAME}:${USERNAME} .zshrc /home/${USERNAME}/.zshrc.custom

# Append custom zshrc to the main one
RUN echo 'source ~/.zshrc.custom' >> /home/${USERNAME}/.zshrc
