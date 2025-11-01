.PHONY: build test publish help

help:
	@echo "Deploy-Kit Makefile Commands:"
	@echo "  make build    - Compile TypeScript to dist/"
	@echo "  make test     - Run test suite"
	@echo "  make publish  - Build and publish to GitHub Packages"
	@echo "  make help     - Show this help message"

build:
	npm run build

test:
	npm test

publish: build test
	@echo "📦 Publishing to GitHub Packages..."
	@GITHUB_TOKEN=$$(gh auth token) npm publish
	@echo "✅ Published successfully!"
