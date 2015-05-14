# cliquesbidder
The Cliques Bidder Repository contains all real-time-bidding functionality for Cliques advertising clients.

Based on the open-source [RTBKit](https://github.com/rtbkit/rtbkit) package.

# RTBKit Integration

This repository relies on the RTB scaffolding provided by the [RTBKit](https://github.com/rtbkit/rtbkit) Project. Precisely how it is integrated is a bit complicated, but here are the high-level steps:

- RTBKit master is forked into [cliquesads/rtbkit](https://github.com/cliquesads/rtbkit). This repository is used to make any customizations to the RTBKit source.
- A "binary-package" version of [cliquesads/rtbkit](https://github.com/cliquesads/rtbkit) is then compiled and exported anytime changes are made to source.  The idea is that these shouldn't happen very often.
- This "binary" (it's not really all binary) version is saved to a repo, [rtbkit-bin](https://github.com/cliquesads/rtbkit-bin), and is installed in this repository as a submodule. 

After many attempts to install RTBKit in many different ways on many different servers, this was the easiest method I could come up with.  The downside is that it makes changing any of the RTBKit source and deploying into production a huge pain, but the upshot is that all dependencies are wholly-contained into this binary package.  


# Deployment


