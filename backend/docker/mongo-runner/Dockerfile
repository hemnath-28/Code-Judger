FROM ubuntu:22.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies, add Mongo repository, and install mongodb-org-server (core engine only)
RUN apt-get update && apt-get install -y --no-install-recommends gnupg wget ca-certificates && \
    wget -qO- https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg && \
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends mongodb-org-server && \
    apt-get purge -y gnupg wget ca-certificates && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create data directories and set permissions
RUN mkdir -p /data/db /data/configdb && chmod -R 777 /data/db /data/configdb

VOLUME ["/data/db", "/data/configdb"]

EXPOSE 27017

# Start mongod directly, binding to all IPs
CMD ["mongod", "--bind_ip_all", "--dbpath", "/data/db"]
