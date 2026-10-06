
Upstream projct: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

## Purpose

This project is aimed to create a sandbox environment for DSH within VS Code. It leverages dev container feature of VS Code.

## Usage

1. Clone this project `git clone https://github.com/lesca/dsh-sandbox`
2. Open the `dsh-sandbox` folder with VS Code `code dsh-sandbox`
3. `Cmd-Shift-P` (or `Ctrl-Shift-P`) and select `> Dev Containers: Open Folder in Container...`
4. Select the `dsh-sandbox` folder, and select the profile best suite your use.
5. Wait for building the latest dsh image
6. Done!

## Directory Structure

```
dsh-sandbox
├── AGENTS.md
├── .devcontainer
│   ├── arm64
│   │   ├── devcontainer.json
│   │   └── docker-compose.yaml
│   ├── x86_64
│   │   ├── devcontainer.json
│   │   └── docker-compose.yaml
│   ├── x86_64_cuda
│   │   ├── devcontainer.json
│   │   └── docker-compose.yaml
│   ├── x86_64_ninfer_v100
│   │   ├── devcontainer.json
│   │   └── docker-compose.yaml
│   ├── docker-compose.base.yaml
│   ├── Dockerfile
│   ├── dsh-docker-proxy
│   │   ├── README.md
│   │   ├── spec.md
│   │   └── src
│   │       ├── args.js
│   │       ├── index.js
│   │       ├── package.json
│   │       ├── proxy.js
│   │       └── token.js
│   ├── dsh.env
│   ├── dsh-plugins.sh
│   ├── entrypoint.sh
│   ├── proxy.env
│   ├── sudoer_default
│   ├── ubuntu-ports.sources
│   ├── ubuntu.sources
│   └── .zshrc
├── .gitignore
├── README.md
├── stop_all.sh
```

## Trouble Shooting

### Network Issues

Check the proxy settings in `docker-compose.ayml` file.
