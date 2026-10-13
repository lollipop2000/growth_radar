FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY . .
RUN npm run build && cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && node .next/standalone/server.js"]
