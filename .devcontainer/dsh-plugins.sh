# !/bin/bash
# install dsh plugins

echo "Install custom dsh plugins ..."

# dshmarket
# https://github.com/dsh-market/dsh-market
dsh plugin --profile web add dshmarket

# opencode fix: https://github.com/deepseek-ai/deepseek-harness/discussions/5495
# dsh plugin --profile web add dsh-opencode-session

# dsh-session-delete
dsh plugin --profile web add github:xohmai/dsh-session-delete

# dsh-web-mobile
dsh plugin --profile web add github:mexiaosqwq/dsh-web-mobile

# archify skills
dsh plugin --profile web add @tt-a1i/archify-dsh

# anysearch
# https://github.com/anysearch-team/anysearch-dsh
dsh plugin --profile web allow-version @anysearch/anysearch-dsh@$(npm view @anysearch/anysearch-dsh version) --dsh-version $(dsh --version) --accept-risk
npx -y @deepseek-ai/dsh plugin --profile web add @anysearch/anysearch-dsh

# dsh-notify
# https://github.com/idoall/dsh-notify
dsh plugin --profile web add @idoall/dsh-notify@latest
