# TerraWatch Backend — Production Dockerfile
# Used by Railway for deployment.

FROM python:3.12-slim

# Prevents Python from buffering stdout/stderr (important for Railway logs)
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies first (layer caching: only rebuilds when requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose the port Railway uses (Railway reads PORT env var, defaults to 8000)
EXPOSE 8000

# Production server: gunicorn with uvicorn workers
# - 2 workers: optimal for Railway's Hobby plan (512MB RAM)
# - timeout 120s: allows long NASA EONET backfill requests to complete
# - access-logfile -: streams access logs to Railway's log viewer
CMD ["gunicorn", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "-w", "2", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "app.main:app"]
