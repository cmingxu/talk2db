GO ?= go
BIN ?= talk2db
OUTDIR ?= bin
WEB_DIR ?= web
CGO_ENABLED ?= 0

# Deploy settings
DEPLOY_HOST ?= dev
DEPLOY_USER ?= root
DEPLOY_DIR ?= /opt/talk2db
DEPLOY_SERVICE ?= talk2db
DEPLOY_ENV ?= production

.PHONY: build build-linux build-web dev test vet web-lint web-build deploy

build: build-web
	@mkdir -p $(OUTDIR)
	CGO_ENABLED=$(CGO_ENABLED) $(GO) build -tags embed -o $(OUTDIR)/$(BIN) ./cmd/talk2db

build-linux: build-web
	@mkdir -p $(OUTDIR)
	CGO_ENABLED=$(CGO_ENABLED) GOOS=linux GOARCH=amd64 $(GO) build -tags embed -o $(OUTDIR)/$(BIN) ./cmd/talk2db

build-web:
	cd $(WEB_DIR) && npm install && npm run build

dev:
	$(GO) run ./cmd/talk2db serve

test:
	$(GO) test ./...

vet:
	$(GO) vet ./...

web-lint:
	cd $(WEB_DIR) && npm run lint

web-build:
	cd $(WEB_DIR) && npm run build

deploy: build-linux
	@echo "=== Deploying to $(DEPLOY_HOST) ==="
	ssh $(DEPLOY_HOST) "mkdir -p $(DEPLOY_DIR)/bin $(DEPLOY_DIR)/var/db"
	ssh $(DEPLOY_HOST) "systemctl stop $(DEPLOY_SERVICE).service 2>/dev/null || true"
	scp $(OUTDIR)/$(BIN) $(DEPLOY_HOST):$(DEPLOY_DIR)/bin/$(BIN)
	scp deploy/$(DEPLOY_SERVICE).service $(DEPLOY_HOST):/etc/systemd/system/$(DEPLOY_SERVICE).service
	ssh $(DEPLOY_HOST) "\
		chmod +x $(DEPLOY_DIR)/bin/$(BIN) && \
		systemctl daemon-reload && \
		systemctl enable $(DEPLOY_SERVICE).service && \
		systemctl start $(DEPLOY_SERVICE).service && \
		systemctl status $(DEPLOY_SERVICE).service --no-pager"
