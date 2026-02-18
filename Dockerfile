FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --only=production

# Copy app
COPY . .

# Create data directory for the JSON database
RUN mkdir -p /app/data

# Run as non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && chown -R appuser:appgroup /app
USER appuser

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
