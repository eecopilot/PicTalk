# syntax=docker/dockerfile:1.4

# ============================================
# 构建阶段
# ============================================
FROM node:22-bookworm AS build

WORKDIR /app

# 1. 先复制依赖文件
COPY package*.json ./

# 2. 使用 BuildKit 缓存挂载加速 npm 安装
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --no-audit; else npm install --no-audit; fi

# 3. 复制源代码
COPY . .

# 4. 构建前端资源和后端服务 (现在这里会生成 dist/server.js)
RUN npm run build

# 5. 清理开发依赖（这一步会完美保留 better-sqlite3 等生产必需的模块）
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

# 创建非 root 用户运行应用
RUN groupadd -r appuser && \
    useradd -r -g appuser -u 1001 appuser && \
    mkdir -p /app/data /app/public/uploads && \
    chown -R appuser:appuser /app

# 从构建阶段复制必要文件
COPY --from=build --chown=appuser:appuser /app/package*.json ./
COPY --from=build --chown=appuser:appuser /app/node_modules ./node_modules
# 后端和前端的编译产物现在都在 dist 里面了
COPY --from=build --chown=appuser:appuser /app/dist ./dist
COPY --from=build --chown=appuser:appuser /app/public ./public
COPY --chown=root:root docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8787

# 健康检查（已修复 Node 22+ 的 localhost IPv6 解析问题）
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 8787) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
