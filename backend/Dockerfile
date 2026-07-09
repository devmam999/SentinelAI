# SentinelAI backend image
FROM python:3.12-slim

# Keep Python lean and logs unbuffered.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# App source.
COPY app ./app

# Persisted Chroma data lives here (mount a volume to keep it across restarts).
ENV CHROMA_PERSIST_DIR=/app/data/chroma
RUN mkdir -p /app/data/chroma

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
