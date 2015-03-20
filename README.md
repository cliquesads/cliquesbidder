# cliquesbidder
The Cliques Bidder Repository contains all real-time-bidding functionality for Cliques advertising clients.

Based on the open-source [RTBKit](https://github.com/rtbkit/rtbkit) package.

# Deployment

## Docker on Mac OSX

First, you need to install `boot2docker` and pull the image `cliqueslabs/rtbkit`.  Instructions on how to do that are [here](https://github.com/cliquesads/install-rtbkit#install_from_docker).

Once you've done that, fire up your `boot2docker` VM:

```sh
$ boot2docker start
$ $(boot2docker shellinit) #sets environment variables, you don't have to do this
```

To start the bidder container, run the following command:

```sh
$ docker run -i -t -p 80 cliqueslabs/rtbkit:latest /bin/bash
```

This starts the container and exposes port 80 (Apache) so you can view your local bidder stats in your browser using Graphite.

#### Start Your Bidder
Once you're in your container, run the following to start the bidder and all of its various services:

```sh
$ cd ~/repositories/cliquesbidder
$ ./docker_start_bidder.sh
```

#### Viewing Graphite

In order to login to Graphite, there are a couple of extra steps you'll need to do:

1. Check which port has been mapped to port 80 on the container by running `docker ps`.  You should see something like this:
    ```sh
    CONTAINER ID        IMAGE                       COMMAND             CREATED             STATUS              PORTS                   NAMES
    d62bb77fd01c        cliqueslabs/rtbkit:latest   "/bin/bash"         21 minutes ago      Up 21 minutes       0.0.0.0:49154->80/tcp   thirsty_poitras
    ```
    Note the port mapped to port 80 under `PORTS` above.  Docker chooses a random high port every time the container is run.

2. Check your VM's IP address by running `echo $DOCKER_HOST`.  You should see something like this:
   ```sh
   tcp://192.168.59.103:2376
   ```
3. Open up Graphite in your browser by browsing to your `$DOCKER_HOST` IP address at the port mapped to port 80 on your container.  In this example, it would be:
   ```sh
   http://192.168.59.103:49154
   ```
4. To login (you don't have to), you can use username: `docker`, password: `docker`