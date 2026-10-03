
Upstream projct: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

## Purpose

This project is aimed to create a sandbox environment for DSH within VS Code. It leverages dev container feature of VS Code.

## Usage

1. Clone this project `git clone https://github.com/lesca/dsh-sandbox`
2. Open the `dsh-sandbox` folder with VS Code `code dsh-sandbox`
3. `Cmd-Shift-P` (or `Ctrl-Shift-P`) and select `> Dev Containers: Open Folder in Container...`
4. Select the `dsh-sandbox` folder
5. Wait for building the latest dsh image
6. Open the console in VS Code and run `dsh web`

## Directory Structure

```
dsh-sandbox
├── .devcontainer
│   ├── cuda                        <- works on platforms with cuda devices
│   │   ├── devcontainer.json
│   │   ├── docker-compose.yaml
│   │   └── Dockerfile
│   ├── general                     <- works on all platforms, including macos
│   │   ├── devcontainer.json
│   │   ├── docker-compose.yaml
│   │   └── Dockerfile
│   ├── post-install.sh             <- add dsh plugins here
│   ├── ubuntu.sources
│   └── .zshrc
├── .gitignore
├── sources                         <- put your sources here
└── README.md
```

## Trouble Shooting

### Network Issues

Make sure your network connectivity is good.

You can use proxy if available. Check the `docker-compose.ayml` file, there is some examples in-place.
