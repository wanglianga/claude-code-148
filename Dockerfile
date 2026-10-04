# ---------- 前端构建 ----------
FROM node:20-bookworm AS client-build
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm config set registry "$NPM_REGISTRY" && npm install --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---------- 后端依赖（含 better-sqlite3 原生模块，full 镜像自带编译链兜底） ----------
FROM node:20-bookworm AS server-deps
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm config set registry "$NPM_REGISTRY" && npm install --omit=dev --no-audit --no-fund

# ---------- 运行时 ----------
FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/app/data
WORKDIR /app
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 8080
VOLUME ["/app/data"]
# 首次启动自动建表并写入演示数据；访问 http://localhost:8080
CMD ["node", "server/index.js"]
