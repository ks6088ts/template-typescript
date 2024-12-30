FROM node:22.12.0-bookworm

WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml ./

# pnpm: https://www.npmjs.com/package/pnpm
RUN npm install -g pnpm@9.15.2 && pnpm install --frozen-lockfile

COPY . .

CMD [ "make", "run" ]
