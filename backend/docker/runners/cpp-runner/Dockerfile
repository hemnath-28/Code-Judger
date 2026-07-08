# alpine:3.20 + g++ (~250 MB) vs gcc:13-bookworm (~1.95 GB)
# Alpine base is ~5 MB and we install only g++ — nothing else.
# bits/stdc++ is included with g++ via libstdc++-dev on Alpine.
FROM alpine:3.20

RUN apk add --no-cache g++ libstdc++

RUN adduser -D -H -s /sbin/nologin runner
WORKDIR /workspace

RUN mkdir -p /opt/runner
COPY warm_runner.cpp /opt/runner/warm_runner.cpp
RUN g++ -std=c++17 -O2 /opt/runner/warm_runner.cpp -o /opt/runner/warm_runner && \
    rm /opt/runner/warm_runner.cpp && \
    chown -R runner:runner /workspace /opt/runner

USER runner
CMD ["/opt/runner/warm_runner"]


