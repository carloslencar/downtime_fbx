FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY src ./src
COPY sql ./sql
COPY seed ./seed
COPY public ./public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/saude >/dev/null || exit 1
CMD ["node", "src/server.js"]
