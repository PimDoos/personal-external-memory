FROM python:3.14-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY src /app

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install .

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Run application (migrations run automatically on startup via FastAPI lifespan)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
