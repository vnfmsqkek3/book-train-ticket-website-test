# 백엔드 컨테이너 이미지 (ECS Fargate 배포용)
FROM node:20-alpine AS builder
WORKDIR /app
# shared/types를 함께 복사 (단일 진실원)
COPY backend/package*.json ./backend/
COPY shared ./shared
WORKDIR /app/backend
RUN npm ci
COPY backend ./
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/backend/package*.json ./
COPY --from=builder /app/shared ../shared
RUN npm ci --omit=dev
COPY --from=builder /app/backend/dist ./dist
EXPOSE 4000 4001
# 헬스체크 (ALB target group과 동일 엔드포인트)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O - http://localhost:4000/health || exit 1
CMD ["node", "dist/backend/src/index.js"]
