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
DEPLOY_JUMP ?=
DEPLOY_ARCH ?= amd64
SSH_JUMP_FLAG = $(if $(DEPLOY_JUMP),-J $(DEPLOY_JUMP),)
SSH_TARGET = $(if $(DEPLOY_JUMP),$(DEPLOY_USER)@$(DEPLOY_HOST),$(DEPLOY_HOST))
BIN_ARCHIVE = $(BIN)-linux-$(DEPLOY_ARCH)

.PHONY: build build-linux build-linux-all build-web dev test vet web-lint web-build deploy

build: build-web
	@mkdir -p $(OUTDIR)
	CGO_ENABLED=$(CGO_ENABLED) $(GO) build -tags embed -o $(OUTDIR)/$(BIN) ./cmd/talk2db

build-linux: build-web
	@mkdir -p $(OUTDIR)
	CGO_ENABLED=$(CGO_ENABLED) GOOS=linux GOARCH=$(DEPLOY_ARCH) $(GO) build -tags embed -o $(OUTDIR)/$(BIN_ARCHIVE) ./cmd/talk2db

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
	@echo "=== Deploying $(DEPLOY_ARCH) to $(if $(DEPLOY_JUMP),$(DEPLOY_HOST) via $(DEPLOY_JUMP),$(DEPLOY_HOST)) ==="
	ssh $(SSH_JUMP_FLAG) $(SSH_TARGET) "mkdir -p $(DEPLOY_DIR)/bin $(DEPLOY_DIR)/var/db"
	ssh $(SSH_JUMP_FLAG) $(SSH_TARGET) "systemctl stop $(DEPLOY_SERVICE).service 2>/dev/null || true"
	scp $(SSH_JUMP_FLAG) $(OUTDIR)/$(BIN_ARCHIVE) $(SSH_TARGET):$(DEPLOY_DIR)/bin/$(BIN)
	scp $(SSH_JUMP_FLAG) deploy/$(DEPLOY_SERVICE).service $(SSH_TARGET):/etc/systemd/system/$(DEPLOY_SERVICE).service
	ssh $(SSH_JUMP_FLAG) $(SSH_TARGET) "\
		chmod +x $(DEPLOY_DIR)/bin/$(BIN) && \
		systemctl daemon-reload && \
		systemctl enable $(DEPLOY_SERVICE).service && \
		systemctl start $(DEPLOY_SERVICE).service && \
		systemctl status $(DEPLOY_SERVICE).service --no-pager"

build-linux-all: build-web
	@mkdir -p $(OUTDIR)
	CGO_ENABLED=$(CGO_ENABLED) GOOS=linux GOARCH=amd64 $(GO) build -tags embed -o $(OUTDIR)/$(BIN)-linux-amd64 ./cmd/talk2db
	CGO_ENABLED=$(CGO_ENABLED) GOOS=linux GOARCH=arm64 $(GO) build -tags embed -o $(OUTDIR)/$(BIN)-linux-arm64 ./cmd/talk2db
