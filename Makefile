.PHONY: build test publish help

help:
	@echo "Deploy-Kit Makefile Commands:"
	@echo "  make build    - Compile TypeScript to dist/"
	@echo "  make test     - Run test suite"
	@echo "  make publish  - Build, test, tag, and publish to GitHub Packages"
	@echo "  make help     - Show this help message"

build:
	npm run build

test:
	npm test

publish: build test
	@echo "📦 Preparing release..."
	@VERSION=$$(node -p "require('./package.json').version"); \
	echo "Version: $$VERSION"; \
	git add -A && \
	git commit -m "chore: Release version $$VERSION" && \
	git tag "v$$VERSION" && \
	git push && \
	git push --tags && \
	echo "✅ Git tagged and pushed v$$VERSION" && \
	GITHUB_TOKEN=$$(gh auth token) npm publish && \
	echo "✅ Published v$$VERSION to GitHub Packages!"
