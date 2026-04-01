FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

RUN npm ci

COPY backend backend

EXPOSE 4000

CMD ["sh", "-c", "node backend/src/wait-for-db.js && npm run migrate --workspace backend && npm run start --workspace backend"]
