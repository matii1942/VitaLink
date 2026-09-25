# Infrastructure

Terraform for the AWS deployment. Everything here is built to be created,
demonstrated and destroyed: the account runs on credits, and a database left
running spends them for nobody.

## What it builds

```
                       ┌──────────────────────────────┐
  internet ──────────► │  Function URL → api          │
                       │                              │  private subnets,
  EventBridge ───────► │  schedule     → sync         │  no route out
   (disabled)          └──────────────┬───────────────┘
                                      │ security group to security group
                       ┌──────────────▼───────────────┐
                       │  RDS PostgreSQL 16           │  public subnets,
  one home address ──► │  db.t4g.micro                │  reachable by two
                       └──────────────────────────────┘  things only
```

What is deliberately absent: a NAT gateway (US$ 32 a month, in no free tier), an
API Gateway (a Function URL is free and this needs nothing a gateway adds), a
load balancer, and a second availability zone for the database.

## First run

```powershell
# 1. The bundles the functions are built from
cd ..\apps\api
npm run build:lambda

# 2. Your own address
cd ..\..\infra
Copy-Item terraform.tfvars.example terraform.tfvars
#    then put (Invoke-RestMethod https://api.ipify.org) into it, as a /32

# 3. Credentials, once per machine — never in a file in this repository
aws configure

# 4.
terraform init
terraform plan
terraform apply
```

Then the database is empty and needs its schema:

```powershell
$env:DATABASE_URL = terraform output -raw database_url
cd ..\apps\api
npx prisma migrate deploy
```

And the API answers:

```powershell
$url = terraform output -raw api_url
Invoke-RestMethod "$url/health"
```

## Tearing it down

```powershell
terraform destroy
```

This is routine, not failure. The database is deleted with no final snapshot,
because a snapshot outlives the instance and is charged for until somebody
remembers it. Everything in it is synthetic and one sync rebuilds it.

## Things worth knowing before changing anything

**State is local and git-ignored.** `terraform.tfstate` holds the database
password in clear text. A team needs it in S3 with a lock table so that two
people cannot apply at once and the only copy is not on a laptop. A single
developer does not, and bootstrapping a bucket before anything else works would
be its own small project.

**The database password is generated, never typed, and lives in the functions'
environment variables.** Encrypted at rest, visible to anyone who can read the
function's configuration. Secrets Manager is the better home for it; from a
private subnet with no route out it would also need an interface endpoint at
about US$ 7 a month, which is more than everything else here costs together.

**`developer_ip` is the line that breaks.** Home connections get a new address
every few days. When the migrations stop connecting, that is why.

**The schedule ships disabled.** The functions have no route to the internet,
and the hospital simulator is not inside this VPC yet, so an enabled schedule
would fail every hour for ever.
