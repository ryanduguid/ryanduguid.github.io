# Not built or pushed by anything in this repository.
# Build context is the repository root:
#   docker build -f service/coal-lsl-levy/deploy/Dockerfile -t coal-lsl-levy .
FROM node:22-alpine

# The engine, the rate evidence and the service. Nothing else from the site.
WORKDIR /app
COPY assets/levy.mjs ./assets/levy.mjs
COPY rates/register ./rates/register
COPY service/coal-lsl-levy ./service/coal-lsl-levy

# No dependencies to install: the service is standard library only.
# A non-root user, a read-only filesystem and no writable volume: the service
# never writes.
USER node
ENV NODE_ENV=production \
    COAL_LSL_HOST=0.0.0.0 \
    COAL_LSL_PORT=8080
EXPOSE 8080

# COAL_LSL_CODE_REVISION must be supplied at build time: there is no git
# metadata in the image, and a manifest that cannot name its revision should
# say so rather than guess.
ARG CODE_REVISION=unknown
ENV COAL_LSL_CODE_REVISION=${CODE_REVISION}

HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.COAL_LSL_PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/service/coal-lsl-levy
CMD ["node", "bin/serve.mjs"]
