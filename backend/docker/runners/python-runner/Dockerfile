FROM python:3.12-slim

RUN useradd --create-home --shell /usr/sbin/nologin runner
WORKDIR /workspace

RUN mkdir -p /opt/runner
COPY warm_runner.py /opt/runner/warm_runner.py
RUN chown -R runner:runner /workspace /opt/runner

USER runner
CMD ["python3", "/opt/runner/warm_runner.py"]


