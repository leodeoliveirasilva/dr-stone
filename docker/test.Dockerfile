FROM python:3.12-slim

WORKDIR /app

ENV TEST_VENV=/opt/dr-stone-venv
ENV PATH="${TEST_VENV}/bin:${PATH}"

COPY pyproject.toml README.md ./
COPY src ./src
COPY tests ./tests
COPY migrations ./migrations

RUN python3 -m pip install --no-cache-dir uv \
    && python3 -m uv python install 3.12 \
    && python3 -m uv venv --seed --python 3.12 "${TEST_VENV}" \
    && "${TEST_VENV}/bin/python" -m pip install --no-cache-dir -e '.[dev]'
