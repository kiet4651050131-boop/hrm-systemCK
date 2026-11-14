FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=3000 TZ=Asia/Ho_Chi_Minh
VOLUME /app/data
EXPOSE 3000
CMD ["node", "dist/main.js"]
