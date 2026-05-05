FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json
RUN npm ci --workspace=server --include-workspace-root

COPY server ./server
COPY docker/server-entrypoint.sh ./docker/server-entrypoint.sh
RUN chmod +x ./docker/server-entrypoint.sh

WORKDIR /app/server
EXPOSE 4000

ENTRYPOINT ["/app/docker/server-entrypoint.sh"]
CMD ["npm", "run", "start"]
