FROM node:20-alpine AS client-build
WORKDIR /app

COPY client/package*.json ./client/
RUN cd client && npm install
COPY client ./client
RUN cd client && npm run build

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyserver/requirements.txt ./pyserver/requirements.txt
RUN pip3 install --no-cache-dir -r pyserver/requirements.txt

COPY pyserver/app.py ./pyserver/app.py
COPY --from=client-build /app/client/dist ./client-dist

ENV WHISPER_MODEL=small
ENV WHISPER_DEVICE=cuda
ENV WHISPER_COMPUTE_TYPE=float16
ENV STATIC_DIR=/app/client-dist
ENV MAX_UPLOAD_MB=1024
ENV PORT=8010

EXPOSE 8010

CMD ["python3", "-m", "uvicorn", "pyserver.app:app", "--host", "0.0.0.0", "--port", "8010"]
