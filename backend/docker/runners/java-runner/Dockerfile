# eclipse-temurin:21-jdk-alpine (~180 MB) vs eclipse-temurin:21-jdk-jammy (~670 MB)
# Alpine base is ~5 MB vs ~29 MB for Ubuntu Jammy.
# We keep the full JDK (not JRE) because javac is required to compile user code.
FROM eclipse-temurin:21-jdk-alpine

# Trim locale / doc data that Alpine JDK images sometimes include
RUN find /opt/java -name "*.diz" -delete && \
    find /opt/java -name "src.zip"  -delete 2>/dev/null || true

RUN adduser -D -H -s /sbin/nologin runner
WORKDIR /workspace

RUN mkdir -p /opt/runner
COPY WarmRunner.java /opt/runner/WarmRunner.java
RUN javac /opt/runner/WarmRunner.java && chown -R runner:runner /workspace /opt/runner

USER runner
CMD ["java", "-cp", "/opt/runner", "WarmRunner"]


