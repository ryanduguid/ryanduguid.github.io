source "https://rubygems.org"

# Match GitHub Pages' Jekyll version for local builds and CI.
# Dependabot ignores ordinary major and minor bumps (.github/dependabot.yml),
# but that filter does not cover security updates, so an advisory fixed only
# above this line can still open a pull request. Treat one as a decision about
# the build, not a routine bump: raise this pin when GitHub Pages raises
# theirs, or move the site off the Pages build first.
gem "jekyll", "3.10.0"
# Default gems until Ruby 3.3; Ruby 3.4 no longer ships them, and Jekyll 3.10
# and its Liquid still load both.
gem "base64"
gem "bigdecimal"
