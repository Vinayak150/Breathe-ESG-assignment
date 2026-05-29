FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Build context is the repository root (see docker-compose.yml) so that project-root
# assets such as mock_data/ can be copied into the image alongside the backend.
COPY backend/requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY backend/ .
COPY mock_data/ ./mock_data/

RUN addgroup --system django \
    && adduser --system --ingroup django django \
    && chown -R django:django /app

USER django

EXPOSE 8000

CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]
