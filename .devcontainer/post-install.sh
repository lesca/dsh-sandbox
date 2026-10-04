# link sources to home
ln -sfn /workspace/sources $HOME

# set HF_HOME
# sudo mount --bind $HOME/.cache/huggingface dsh-sandbox/huggingface
export HF_HOME=/workspace/huggingface

# install dsh plugins
# opencode fix: https://github.com/deepseek-ai/deepseek-harness/discussions/5495
dsh plugin --profile web add dsh-opencode-session

# dsh-session-delete
dsh plugin --profile web add github:xohmai/dsh-session-delete

# anysearch
# https://github.com/anysearch-team/anysearch-dsh
dsh plugin --profile web allow-version @anysearch/anysearch-dsh@$(npm view @anysearch/anysearch-dsh version) --dsh-version $(dsh --version) --accept-risk
npx -y @deepseek-ai/dsh plugin --profile web add @anysearch/anysearch-dsh
