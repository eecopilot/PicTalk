# syntax=docker/dockerfile:1.4

# ============================================
# 构建阶段
# ============================================
FROM node:22-bookworm AS build

WORKDIR /app

# 1. 先复制依赖文件（利用 Docker 层缓存）
COPY package*.json ./

# 2. 使用 BuildKit 缓存挂载加速 npm 安装
# --mount=type=cache 会在多次构建间保留 npm 缓存
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit

# 3. 复制源代码（只有代码改变时才会重新构建）
COPY . .

# 4. 构建前端资源
RUN npm run build

# 5. 清理开发依赖（减少最终镜像大小）
RUN npm prune --omit=dev

# ============================================
# 运行时阶段
# ============================================
FROM node:22-bookworm-slim AS runtime

# 设置环境变量
ENV NODE_ENV=production \
    PORT=8787 \
    NPM_CONFIG_LOGLEVEL=error

WORKDIR /app

# 创建非 root 用户运行应用（安全最佳实践）
RUN groupadd -r appuser && \
    useradd -r -g appuser -u 1001 appuser && \
    mkdir -p /app/data /app/public/uploads && \
    chown -R appuser:appuser /app

# 从构建阶段复制必要文件
COPY --from=build --chown=appuser:appuser /app/package*.json ./
COPY --from=build --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/server ./server
COPY --from=build --chown=appuser:appuser /app/dist ./dist
COPY --from=build --chown=appuser:appuser /app/public ./public

# 切换到非 root 用户
USER appuser

EXPOSE 8787

# 健康检查（使用现有的 /api/health 端点）
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8787/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

CMD ["npm", "run", "start"]
