COMPOSE ?= docker compose
DEV_COMPOSE := $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml

.PHONY: build deploy quick-deploy dev dev-down up down logs restart ps

build:
	$(COMPOSE) build

deploy:
	$(COMPOSE) down
	$(COMPOSE) up -d --build
	$(COMPOSE) ps

quick-deploy:
	$(COMPOSE) up -d
	$(COMPOSE) ps

dev:
	$(DEV_COMPOSE) up -d
	$(DEV_COMPOSE) ps

dev-down:
	$(DEV_COMPOSE) down

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=200

restart:
	$(COMPOSE) restart

ps:
	$(COMPOSE) ps
