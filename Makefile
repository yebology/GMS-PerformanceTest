.PHONY: load stress load-rest stress-rest ws-smoke ws-load ws-stress vol-assets vol-notifications vol-dashboard volume all clean seed-assets seed-notifications seed-employee cleanup

git-commit:
	@git add .
	@git status
	@read -p "Commit message: " msg; \
	git commit -m "$msg"
	
# === Combined Tests (REST /assets + WebSocket /notifications) ===
load: load-rest ws-load

stress: stress-rest ws-stress

# === REST API Tests ===
load-rest:
	mkdir -p reports-2
	k6 run tests/load-testing.js

stress-rest:
	mkdir -p reports-2
	k6 run tests/stress-testing.js

# === WebSocket Tests ===
ws-smoke:
	mkdir -p reports-2
	k6 run tests/ws/ws-smoke.js

ws-load:
	mkdir -p reports-2
	k6 run tests/ws/ws-load.js

ws-stress:
	mkdir -p reports-2
	k6 run tests/ws/ws-stress.js

# === Volume Tests ===
vol-assets:
	mkdir -p reports-2/volume
	k6 run -e DATA_SIZE=$(DATA_SIZE) tests/volume/vol-assets.js

vol-notifications:
	mkdir -p reports-2/volume
	k6 run -e DATA_SIZE=$(DATA_SIZE) tests/ws/ws-vol-notifications.js

vol-dashboard:
	mkdir -p reports-2/volume
	k6 run -e DATA_SIZE=$(DATA_SIZE) tests/volume/vol-dashboard-employee.js

volume: vol-assets vol-notifications vol-dashboard

all: load volume

# === Config ===
USER_ID ?= 291ad53c-9001-70c8-93a2-bc9e35697a77
EMPLOYEE_ID ?= c97a050c-5061-708f-d3f0-7f6019b34488

# === Seeders ===
seed-assets:
	python3 scripts/seed-assets.py $(COUNT)

seed-notifications:
	python3 scripts/seed-notifications.py $(USER_ID) $(COUNT)

seed-employee:
	python3 scripts/seed-employee-stats.py $(EMPLOYEE_ID) $(COUNT)

cleanup:
	python3 scripts/cleanup-test-assets.py

# === Cleanup Reports ===
clean:
	rm -rf reports-2/

ROLE_ARN ?= arn:aws:iam::562280272590:role/AssumeYobel
SESSION_NAME ?= my-session
REGION ?= ap-southeast-1

assume-role:
	@echo "Assuming role: $(ROLE_ARN)..."
	@aws sts assume-role \
		--role-arn $(ROLE_ARN) \
		--role-session-name $(SESSION_NAME) \
		--query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' \
		--output text | awk '{print "export AWS_ACCESS_KEY_ID="$$1"\nexport AWS_SECRET_ACCESS_KEY="$$2"\nexport AWS_SESSION_TOKEN="$$3"\nexport AWS_DEFAULT_REGION=$(REGION)"}'
	@echo ""
	@echo "Copy and paste the above export commands into your terminal."

whoami:
	@aws sts get-caller-identity

unset-credentials:
	@echo "unset AWS_ACCESS_KEY_ID"
	@echo "unset AWS_SECRET_ACCESS_KEY"
	@echo "unset AWS_SESSION_TOKEN"
	@echo ""
	@echo "Copy and paste the above into your terminal."
