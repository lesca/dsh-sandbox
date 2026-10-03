# install dsh plugins
# opencode fix: https://github.com/deepseek-ai/deepseek-harness/discussions/5495
dsh plugin --profile web add dsh-opencode-session

# anysearch
# https://github.com/anysearch-team/anysearch-dsh
dsh plugin --profile web allow-version @anysearch/anysearch-dsh@$(npm view @anysearch/anysearch-dsh version) --dsh-version $(dsh --version) --accept-risk
npx -y @deepseek-ai/dsh plugin --profile web add @anysearch/anysearch-dsh
