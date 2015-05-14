# cliquesbidder
The Cliques Bidder Repository contains all real-time-bidding functionality for Cliques advertising clients. Based on the open-source [RTBKit](https://github.com/rtbkit/rtbkit) package.

## System Overview
The system consists of three layers, listed in order of lower-to-highest level:

1. **[RTBKit Core]()**: A slightly-modified (forked) version of the RTBKit Project, written predominantly in C++. The forked RTBKit version is installed as a [submodule](https://github.com/cliquesads/rtbkit-bin). See [RTBKit Integration] for details.
2. **[Node.js Bidding Agents]()**: RTBKit bidding agents written in Node.js which accept and fulfill bid requests from the RTBKit core router. This layer contains all campaign-specific bidding logic.
3. **[Node.js BidAgent Controller]()**:  Node.js process which handles the creation, configuration, update and deletion of Node Bidding Agents. All Node Bidding Agents are spawned as child processes. The controller exposes methods for clients to perform create/update/delete operations on individual bidding agents.

# Deployment

To deploy all bidder layers, run:
```
$ git pull
$ ./deploy-controller.sh
```
This will launch all RTBKit services & RTBKit Core, and gracefully reload or start the Node BidAgent Controller using [PM2](https://github.com/Unitech/pm2).

If any existing RTBKit services are currently running, this script will leave them alone and simply reload the BidAgent Controller.

### Deploy RTBKit Only
To start only RTBKit Core and all background services, you can run
```
$ ./deploy-rtbkit.sh
```
This script is run by default under `deploy-controller.sh`, but for development/debugging you may occassionally just want to kick off RTBKit core on its own.

### Environment
There are two versions of Node.js used in this repo: Bidding Agents use one that comes packaged with RTBKit and compiles all RTBKit Node add-ons, and the other, more recent version is used to run BidAgent Controller (installed using nvm).

In development, to set Node environment variables to point to the BidAgent Controller, top-layer version of Node, use:
```
$ source activate_production.sh
```
