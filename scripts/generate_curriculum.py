import json
import random
import os

modules = [
    "IaC Misconfigurations",
    "Network Security",
    "Identity & Secrets",
    "Container Security",
    "Kubernetes Security",
    "Cloud Architecture",
    "Serverless Security",
    "CI/CD Pipeline Security"
]

templates = {
    "IaC Misconfigurations": {
        "file": "terraform/s3_bucket_{id}.tf",
        "cwe": "CWE-732",
        "title": "Unrestricted S3 Bucket Access {id}",
        "desc": "An S3 bucket has overly permissive ACLs or policies. This can lead to sensitive data exposure.",
        "task": "Identify and restrict the 'Principal: *' or permissive ACLs on the bucket.",
        "code": [
            'resource "aws_s3_bucket" "data_lake_{id}" {{',
            '  bucket = "company-data-lake-{id}"',
            '  acl    = "public-read"',
            '}}'
        ]
    },
    "Network Security": {
        "file": "terraform/sg_{id}.tf",
        "cwe": "CWE-284",
        "title": "Overly Permissive Security Group {id}",
        "desc": "A security group allows traffic from 0.0.0.0/0 on sensitive ports.",
        "task": "Restrict ingress rules to specific IP ranges instead of the entire internet.",
        "code": [
            'resource "aws_security_group" "web_sg_{id}" {{',
            '  ingress {{',
            '    from_port   = {port}',
            '    to_port     = {port}',
            '    protocol    = "tcp"',
            '    cidr_blocks = ["0.0.0.0/0"]',
            '  }}',
            '}}'
        ]
    },
    "Identity & Secrets": {
        "file": "config/secrets_{id}.yml",
        "cwe": "CWE-798",
        "title": "Hardcoded Credentials in Config {id}",
        "desc": "Sensitive API keys or database passwords found committed to the repository.",
        "task": "Remove the hardcoded secret and use environment variables or a secret manager.",
        "code": [
            'database:',
            '  host: "db.internal.net"',
            '  user: "admin"',
            '  password: "super_secret_password_{id}"',
            '  api_key: "AKIA_FAKE_KEY_{id}"'
        ]
    },
    "Container Security": {
        "file": "docker/Dockerfile_{id}",
        "cwe": "CWE-250",
        "title": "Privileged Container Execution {id}",
        "desc": "A Docker container is configured to run with elevated privileges or as root.",
        "task": "Modify the Dockerfile to use a non-root user and drop unnecessary capabilities.",
        "code": [
            'FROM ubuntu:latest',
            'RUN apt-get update && apt-get install -y curl',
            'USER root',
            'ENTRYPOINT ["/app/start.sh"]'
        ]
    },
    "Kubernetes Security": {
        "file": "k8s/pod_{id}.yaml",
        "cwe": "CWE-269",
        "title": "Insecure K8s Pod Security Context {id}",
        "desc": "A Kubernetes pod has an insecure security context, allowing privilege escalation.",
        "task": "Set allowPrivilegeEscalation to false and runAsNonRoot to true.",
        "code": [
            'apiVersion: v1',
            'kind: Pod',
            'metadata:',
            '  name: vulnerable-pod-{id}',
            'spec:',
            '  containers:',
            '  - name: app',
            '    image: myapp:1.0',
            '    securityContext:',
            '      privileged: true'
        ]
    },
    "Cloud Architecture": {
        "file": "terraform/iam_{id}.tf",
        "cwe": "CWE-269",
        "title": "Overly Permissive IAM Role {id}",
        "desc": "An IAM role has an admin-level policy attached (*:*).",
        "task": "Implement the Principle of Least Privilege by specifying exact actions and resources.",
        "code": [
            'resource "aws_iam_role_policy" "admin_policy_{id}" {{',
            '  role = aws_iam_role.app_role.id',
            '  policy = jsonencode({{',
            '    Statement = [{{',
            '      Action = "*"',
            '      Effect = "Allow"',
            '      Resource = "*"',
            '    }}]',
            '  }})',
            '}}'
        ]
    },
    "Serverless Security": {
        "file": "serverless/lambda_{id}.py",
        "cwe": "CWE-94",
        "title": "Insecure Serverless Function {id}",
        "desc": "A Lambda function directly evaluates user input or executes system commands.",
        "task": "Sanitize inputs and avoid using eval() or os.system() with unvalidated event data.",
        "code": [
            'import os',
            'def lambda_handler(event, context):',
            '    cmd = event.get("command", "echo Hello")',
            '    # Vulnerable to command injection',
            '    os.system(cmd)',
            '    return {{"statusCode": 200}}'
        ]
    },
    "CI/CD Pipeline Security": {
        "file": ".github/workflows/build_{id}.yml",
        "cwe": "CWE-276",
        "title": "Insecure CI/CD Workflow {id}",
        "desc": "A GitHub Action workflow uses untrusted input in a run command or exposes secrets.",
        "task": "Avoid using ${{ github.event... }} directly in bash scripts.",
        "code": [
            'name: CI',
            'on: [issue_comment]',
            'jobs:',
            '  build:',
            '    runs-on: ubuntu-latest',
            '    steps:',
            '    - name: Run Script',
            '      run: echo "Comment: ${{ github.event.comment.body }}"'
        ]
    }
}

curriculum = []
challenge_id = 1

for mod_idx, mod_name in enumerate(modules):
    tmpl = templates[mod_name]
    for i in range(1, 12): # 11 examples per module
        port = random.choice([22, 3389, 21, 23, 1433, 5432, 27017, 6379, 9200, 8080, 80])
        cvss = round(random.uniform(4.0, 10.0), 1)
        
        # Build code with line numbers and simple vuln tagging
        code_lines = tmpl["code"]
        vulnCode = []
        for line_num, line_content in enumerate(code_lines, 1):
            formatted_line = line_content.format(id=i, port=port)
            is_vuln = any(bad in formatted_line for bad in ["*", "0.0.0.0/0", "public-read", "root", "privileged: true", "password:", "os.system", "${{ github"])
            vulnCode.append({
                "n": line_num,
                "t": formatted_line,
                "vuln": is_vuln
            })

        curriculum.append({
            "level": challenge_id,
            "difficulty": "Critical" if cvss >= 9.0 else "High" if cvss >= 7.0 else "Medium",
            "category": mod_name,
            "id": f"{mod_name.replace(' ', '_').upper()}_{i}",
            "title": tmpl["title"].format(id=i),
            "description": tmpl["desc"],
            "real_source": "Curriculum Generator",
            "cvss": cvss,
            "cwe": tmpl["cwe"],
            "task": tmpl["task"],
            "file_context": tmpl["file"].format(id=i),
            "vulnCode": vulnCode
        })
        challenge_id += 1

output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "api", "v1", "endpoints")
output_path = os.path.join(output_dir, "curriculum.json")

with open(output_path, "w") as f:
    json.dump(curriculum, f, indent=4)

print(f"Generated {len(curriculum)} challenges.")
