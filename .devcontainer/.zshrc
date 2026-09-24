# Add local bin to PATH
export PATH="$HOME/.local/bin:$PATH"

# History settings
export HISTFILE=/commandhistory/.zsh_history
export HISTSIZE=200000
export SAVEHIST=200000
setopt SHARE_HISTORY
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS    # Remove older duplicate entries
setopt HIST_REDUCE_BLANKS      # Remove extra blanks from commands
setopt HIST_VERIFY             # Show command before executing from history

# Directory navigation
setopt AUTO_CD                 # cd by typing directory name
setopt AUTO_PUSHD              # Push directories onto stack
setopt PUSHD_IGNORE_DUPS       # Don't push duplicates
setopt PUSHD_SILENT            # Don't print stack after pushd/popd

# Completion
setopt COMPLETE_IN_WORD        # Complete from both ends of word
setopt ALWAYS_TO_END           # Move cursor to end after completion

# Aliases
alias ll='ls -lah --color=auto'
alias la='ls -A --color=auto'
alias l='ls -CF --color=auto'
alias grep='grep --color=auto'

# dsh npm
export PATH=~/.npm-global/bin:$PATH
