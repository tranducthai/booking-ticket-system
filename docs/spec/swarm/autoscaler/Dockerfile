# The docker:cli image ships sh + awk + tr + date + the docker client — everything
# autoscale.sh needs. It talks to the daemon through the mounted /var/run/docker.sock
# (see docker-stack.yml), so no Docker-in-Docker.
FROM docker:27-cli

COPY autoscale.sh /usr/local/bin/autoscale.sh
RUN chmod +x /usr/local/bin/autoscale.sh

ENTRYPOINT ["/usr/local/bin/autoscale.sh"]
