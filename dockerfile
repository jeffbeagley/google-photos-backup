FROM node:17.3.0-alpine3.15 AS builder

WORKDIR /var/app

COPY ./app/package.json .
COPY ./app/package-lock.json* .

RUN npm i

FROM node:17.3.0-alpine3.15 AS release

WORKDIR /var/app

COPY --from=builder /var/app/ ./
COPY ./app .

CMD npm run start