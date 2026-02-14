deploy:
	docker compose down
	docker compose up -d --build
	docker compose ps

logs:
	docker compose logs -f --tail=200

restart:
	docker compose restart

