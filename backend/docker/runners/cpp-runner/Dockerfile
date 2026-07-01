# alpine:3.20 + g++ (~250 MB) vs gcc:13-bookworm (~1.95 GB)
# Alpine base is ~5 MB and we install only g++ — nothing else.
# bits/stdc++ is included with g++ via libstdc++-dev on Alpine.
FROM alpine:3.20

RUN apk add --no-cache g++ libstdc++

RUN adduser -D -H -s /sbin/nologin runner
USER runner
WORKDIR /workspace

CMD ["g++", "--version"]
