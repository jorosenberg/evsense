# ─────────────────────────────────────────────────────────────────────────────
# EVsense Scraper — AWS Lambda container image
# Built on the official AWS Lambda Python 3.11 base
# Pushed to ECR by .github/workflows/aws-deploy.yml
# ─────────────────────────────────────────────────────────────────────────────
FROM public.ecr.aws/lambda/python:3.11

# Install system dependencies needed for image processing + Playwright
RUN dnf install -y \
        gcc \
        libffi-devel \
        openssl-devel \
        && dnf clean all

# Python dependencies first (cached layer)
COPY requirements.txt ${LAMBDA_TASK_ROOT}/requirements.txt
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt \
                              --target ${LAMBDA_TASK_ROOT}

# App source
COPY . ${LAMBDA_TASK_ROOT}/

# Lambda entry point — handler() in lambda_handler.py
CMD ["lambda_handler.handler"]
