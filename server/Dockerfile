FROM node:20-alpine AS client-build
WORKDIR /app

COPY client/package*.json ./client/
RUN cd client && npm install
COPY client ./client
RUN cd client && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY server/src ./server/src
COPY --from=client-build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV PORT=8010
ENV STT_API_BASE=http://host.docker.internal:8001
ENV STATIC_DIR=/app/client/dist

EXPOSE 8010

CMD ["node", "server/src/index.js"]
