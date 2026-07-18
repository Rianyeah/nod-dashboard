# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_MAPBOX_TOKEN
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN
RUN npm run build

# Stage 2: Python backend + serve frontend dist
FROM python:3.12-slim
WORKDIR /app
ARG GIT_SHA=unknown
ARG GIT_SOURCE=https://github.com/Rianyeah/nod-dashboard
LABEL org.opencontainers.image.source=$GIT_SOURCE \
      org.opencontainers.image.revision=$GIT_SHA

# Install Python dependencies
COPY backend/requirements.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock

# Copy backend
COPY backend/ ./backend/

# Copy frontend build output
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

WORKDIR /app/backend

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
