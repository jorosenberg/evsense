# EVsense — Terraform Infrastructure

AWS infrastructure as code for the EVsense project, designed to fit within
the AWS free tier wherever possible.

## Architecture

```
                ┌──────────────────────────────────────┐
   Browser ───► │  CloudFront (images.evsense.app)     │
                └──────────────┬───────────────────────┘
                               ▼
                ┌──────────────────────────────────────┐
                │  S3 — vehicle images bucket          │
                └──────────────────────────────────────┘

                ┌──────────────────────────────────────┐
   Browser ───► │  EC2 (t3.micro) — nginx + React SPA  │
                └──────────────┬───────────────────────┘
                               ▼ (pulls build artifact)
                ┌──────────────────────────────────────┐
                │  S3 — artifacts bucket               │
                └──────────────────────────────────────┘

   EventBridge (monthly cron) ──► Lambda (scraper container) ──► S3 + Firestore
                                          ▲
                                          │ POST /scrape
                                ┌─────────┴────────┐
                                │  API Gateway     │
                                └──────────────────┘
```

## Free-tier services used

| Service | Free tier | Used by EVsense |
|---|---|---|
| EC2 t3.micro | 750 hrs/mo × 12 mo | Web server |
| EBS gp3 | 30 GB × 12 mo | Root volume (8 GB) |
| Lambda | 1M req + 400k GB-sec / mo (forever) | Scraper |
| S3 | 5 GB + 20k GET + 2k PUT × 12 mo | Images + build artifacts |
| CloudFront | 1 TB egress + 10M req × 12 mo | Images CDN |
| ECR | 500 MB × 12 mo | Scraper container image |
| EventBridge | 14M events / mo (forever) | Monthly scraper schedule |
| API Gateway (HTTP) | 1M calls × 12 mo | Trigger endpoint |
| RDS db.t3.micro (optional) | 750 hrs + 20 GB × 12 mo | Vehicle DB (disabled by default) |
| **Secrets Manager** | ❌ not free ($0.40/secret/mo) | API key storage |

> **Cost-saving alternative:** Set `enable_rds = false` (default) — EVsense
> uses static JSON files from S3 instead of a database. To eliminate the
> ~$1.20/month Secrets Manager cost, replace with SSM Parameter Store
> SecureString (free).

---

## One-time bootstrap

Run these AWS CLI commands ONCE before your first `terraform apply`. The
remote state backend (S3 + DynamoDB) must exist before Terraform can use it.

```bash
# 1. Create S3 bucket for Terraform state
aws s3api create-bucket \
  --bucket evsense-tf-state \
  --region us-east-1

# Enable versioning (recommended for state recovery)
aws s3api put-bucket-versioning \
  --bucket evsense-tf-state \
  --versioning-configuration Status=Enabled

# 2. Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name evsense-tf-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# 3. Create an EC2 SSH key pair
aws ec2 create-key-pair \
  --key-name evsense-keypair \
  --query 'KeyMaterial' \
  --output text \
  --region us-east-1 > ~/.ssh/evsense-keypair.pem

chmod 600 ~/.ssh/evsense-keypair.pem
```

Save the contents of `~/.ssh/evsense-keypair.pem` — you'll need it as the
`SSH_PRIVATE_KEY` GitHub Secret.

---

## Local apply (for development)

```bash
cd terraform/

# Copy the example tfvars and fill it in
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars

# Sensitive vars should be passed as env vars, NOT in tfvars:
export TF_VAR_db_password='your-strong-password'
export TF_VAR_ocm_api_key='8e20f760-d3b0-467f-9860-96cd04779ce2'
export TF_VAR_nrel_api_key='your-nrel-key-here'
export TF_VAR_firebase_service_account_json="$(cat ../evsense-c6b8b-firebase-adminsdk.json | jq -c .)"

# Initialize Terraform (downloads providers + connects to S3 backend)
terraform init

# See what will be created
terraform plan -out=tfplan

# Apply
terraform apply tfplan
```

Expected runtime: ~5-7 minutes (CloudFront takes the longest).

---

## Publishing locally-scraped data

The scraper runs entirely on your laptop (see
[`../scraper/LOCAL_PIPELINE.md`](../scraper/LOCAL_PIPELINE.md)) and writes fresh
JSON + images into `frontend/public/data/`. Two helper scripts push that work to
the live site; both read the bucket and distribution from `terraform output`, so
there's nothing to configure once `terraform apply` has run.

```bash
cd terraform

# Data-only: after a scraper run, sync just frontend/public/data -> s3://…/data
# and invalidate /data/*. Seconds, no rebuild. Use for catalog / incentive /
# lease-payment refreshes.
./publish-data.sh
DRY_RUN=1 ./publish-data.sh        # preview the diff first

# Full deploy: rebuild the React app and push everything (code + bundled data).
# Use this for a code change.
./deploy.sh
```

`publish-data.sh` uses `aws s3 sync --delete`, so files removed locally (e.g.
dropped trims) are pruned from the bucket too. Both scripts set a short
cache-control on data/HTML and a long one on hashed build assets, then issue a
CloudFront invalidation so changes are immediate.

> Don't have the cloud stack up? The same data is served straight from Vite's
> dev server out of `frontend/public/data/` during local development — these
> scripts are only for pushing to the deployed S3/CloudFront site.

---

## CI/CD via GitHub Actions

The `.github/workflows/aws-deploy.yml` workflow runs on every push to `main`
and runs `terraform apply` automatically. See [../SETUP.md](../SETUP.md) for
the full list of GitHub Secrets you need to set.

---

## Destroy

```bash
cd terraform/
terraform destroy
```

**Note:** the S3 buckets need to be emptied first if versioned objects exist.
The `force_delete = true` on ECR will allow it to be destroyed regardless.

---

## Common issues

| Symptom | Fix |
|---|---|
| `Error: bucket name already exists` | Bucket names are globally unique. The random suffix should prevent this, but if it fires, re-run `terraform apply` (random_id should regenerate). |
| `Error: InsufficientInstanceCapacity` | Try a different AZ — change `availability_zone` in `vpc.tf`. |
| `Lambda image not found` | Run the `aws-deploy.yml` workflow once first — it builds and pushes the scraper image to ECR before Lambda creation. |
| CloudFront 403 errors | Wait 5-10 minutes after first apply — distribution propagation is slow. |
