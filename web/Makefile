BIN ?= app
OUTDIR ?= ../bin
CGO_ENABLED ?= 0

.PHONY: build dev lint

build: npm-install frontend-build go-build

npm-install:
	npm install

frontend-build:
	npm run build

go-build:
	@mkdir -p $(OUTDIR)
	CGO_ENABLED=$(CGO_ENABLED) cd .. && go build -tags embed -o $(OUTDIR)/$(BIN) ./cmd/talk2db

dev:
	npm run dev

lint:
	npm run lint
