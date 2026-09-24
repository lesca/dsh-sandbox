
Upstream projct: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

## Purpose

This project is aimed to create a sandbox environment for DSH within VS Code. It leverages dev container feature of VS Code.

## Usage

1. Clone this project `git clone https://github.com/lesca/dsh-sandbox`
2. Open the `dsh-sandbox` folder with VS Code `code dsh-sandbox`
3. `Cmd-Shift-P` (or `Ctrl-Shift-P`) and select `> Dev Containers: Open Folder in Container...`
4. Select the `dsh-sandbox` folder
5. Wait for building the latest dsh image
  * Adjust Dockerfile may result rebuilding the image
6. Open the console in VS Code and run `dsh web`

## Directory Structure

```
dsh-sandbox
├── .devcontainer
│   ├── devcontainer.json
│   ├── Dockerfile
│   ├── post-install.sh   # add plugins here
│   ├── sources.list      # apt mirror here
│   ├── sudoer_me
│   └── .zshrc
├── .dsh                  # the dsh config folder
├── .gitignore
├── README.md
└── sources
    └── put_cloned_source_codes_here

```

## Trouble Shooting

### Mount Issues

Check the `.devcontainer/devcontainer.json` file, make sure the source mount file / folder exisit on your host. If you do not use `git` remove the first `.gitconfig`  mount config as below:

```json
  "mounts": [
    "source=${localEnv:HOME}/.gitconfig,target=/home/vscode/.gitconfig,type=bind,readonly",
    "source=${localWorkspaceFolder}/.dsh,target=/home/node/.dsh,type=bind"
  ],
```

### Network Issues

Make sure your network connectivity is good.

You can use proxy if available. Check the `.devcontainer/devcontainer.json` file, there is some examples to use directly.
