# The simulated hospital information system.
#
# Only runtime dependencies go into the image. Vitest and the test suite stay
# outside: the image is what would run, not what was used to check it.
FROM node:22-alpine

WORKDIR /app

# Manifests first, source later. Docker caches each step, so copying the
# manifests on their own means the slow `npm ci` layer is reused on every
# rebuild that only touches source code.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY wsdl ./wsdl

ENV LEGACY_SOAP_PORT=8080
EXPOSE 8080

# The official Node image ships an unprivileged `node` user. A service that
# only reads its own files has no reason to run as root.
USER node

CMD ["node", "src/server.js"]
