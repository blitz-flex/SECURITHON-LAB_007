from fastapi import APIRouter
from typing import List, Dict
import httpx
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

async def fetch_global_threats():
    """
    Fetches real-time known exploited vulnerabilities from CISA KEV.
    """
    url = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            if response.status_code == 200:
                data = response.json()
                # Get the latest 10 vulnerabilities for a richer experience
                vulnerabilities = data.get("vulnerabilities", [])
                return vulnerabilities[-12:] 
    except Exception as e:
        logger.error(f"Failed to fetch CISA KEV data: {e}")
    return []

def map_cve_to_lab(cve_data, challenge_id):
    """
    Heuristic mapping of a real CVE to a lab scenario.
    """
    desc = cve_data.get("shortDescription", "").lower()
    cve_id = cve_data.get("cveID", "CVE-UNKNOWN")
    vuln_name = cve_data.get("vulnerabilityName", "Unknown Vulnerability")
    
    # Default scenario
    scenario = {
        "title": f"🔴 LIVE: {cve_id}",
        "category": "Global Threat Feed",
        "file": "config_check.yml",
        "code": ["# Real-time intelligence review required", f"# CVE: {cve_id}", "status: active", "security_check: pending"],
        "task": "Review and harden the configuration based on the latest threat intelligence.",
        "cwe": "CWE-Unknown",
        "cvss": 7.5,
        "briefing": "This is a real-time threat detected in the global infrastructure. Your objective is to audit the provided configuration and ensure it adheres to current security best practices.",
        "hint": "Check the status and security_check fields for any non-standard values."
    }

    # Heuristic mapping based on common vulnerability keywords
    if any(k in desc for k in ["injection", "sql", "database"]):
        scenario["file"] = "db_query.py"
        scenario["code"] = ["query = f\"SELECT * FROM logs WHERE id = {event['id']}\"", "db.execute(query)"]
        scenario["cwe"] = "CWE-89"
        scenario["briefing"] = "SQL Injection (CWE-89) occurs when untrusted data is inserted into a database query. Attackers can use this to read sensitive data, modify database records, or even gain administrative control."
        scenario["hint"] = "Use parameterized queries or prepared statements instead of f-strings."
    elif any(k in desc for k in ["traversal", "file read", "path"]):
        scenario["file"] = "file_handler.js"
        scenario["code"] = ["const path = req.query.path;", "const data = fs.readFileSync('/app/data/' + path);"]
        scenario["cwe"] = "CWE-22"
        scenario["briefing"] = "Path Traversal (CWE-22) allows attackers to access files and directories outside the intended folder. This can lead to the exposure of configuration files, passwords, or system logs."
        scenario["hint"] = "Sanitize the 'path' variable to ensure it doesn't contain '../' and is restricted to the data directory."
    elif any(k in desc for k in ["rce", "remote code execution", "command", "shell"]):
        scenario["file"] = "executor.py"
        scenario["code"] = ["import os", "def run_cmd(cmd):", "    os.system(cmd) # Potential RCE"]
        scenario["cwe"] = "CWE-94"
        scenario["briefing"] = "Remote Code Execution (RCE) is one of the most dangerous vulnerabilities. It allows an attacker to execute arbitrary commands on the host operating system, leading to complete system compromise."
        scenario["hint"] = "Avoid using os.system(). If execution is necessary, use subprocess with a strictly defined list of allowed commands."
    elif any(k in desc for k in ["s3", "bucket", "access", "policy", "iam"]):
        scenario["file"] = "s3_policy.tf"
        scenario["code"] = ["resource \"aws_s3_bucket_policy\" \"data\" {", "  policy = jsonencode({", "    Principal = \"*\"", "  })", "}"]
        scenario["cwe"] = "CWE-732"
        scenario["briefing"] = "Permissive Cloud Policies (CWE-732) grant excessive permissions to anonymous or unauthenticated users. In S3, using 'Principal: *' without restrictions makes the data public."
        scenario["hint"] = "Restrict the Principal to a specific IAM role or account, and avoid using '*'."
    elif any(k in desc for k in ["cross-site", "xss", "scripting"]):
        scenario["file"] = "template.html"
        scenario["code"] = ["<div>", "  {{ user_input | safe }}", "</div>"]
        scenario["cwe"] = "CWE-79"
        scenario["briefing"] = "Cross-Site Scripting (XSS) allows attackers to inject malicious scripts into web pages viewed by other users. The 'safe' filter often bypasses the template engine's auto-escaping."
        scenario["hint"] = "Remove the '| safe' filter or use a specific sanitizer for HTML content."

    vulnCode = [{"n": idx+1, "t": line, "vuln": True if idx > 0 else False} for idx, line in enumerate(scenario["code"])]

    return {
        "level": challenge_id,
        "difficulty": "Critical" if scenario["cvss"] >= 9 else "High",
        "category": "Global Threat Feed",
        "id": f"LIVE_REAL_{challenge_id}",
        "title": f"🔴 LIVE: {cve_id} - {vuln_name}",
        "description": cve_data.get("shortDescription", ""),
        "real_source": "CISA KEV (Global Feed)",
        "cvss": scenario["cvss"],
        "cwe": scenario["cwe"],
        "task": scenario["task"],
        "briefing": scenario["briefing"],
        "hint": scenario["hint"],
        "file_context": scenario["file"],
        "vulnCode": vulnCode,
        "is_live": True
    }

@router.get("/curriculum", response_model=List[Dict])
async def get_infrasec_curriculum():
    """
    Fetch the InfraSec Curriculum with ONLY Real-Time Global Threat Intelligence.
    """
    # Fetch real global threats from CISA
    global_threats = await fetch_global_threats()
    
    live_labs = []
    for idx, threat in enumerate(global_threats):
        live_labs.append(map_cve_to_lab(threat, idx + 1))
    
    return live_labs

@router.get("/level/{level_id}", response_model=Dict)
async def get_infrasec_level(level_id: int):
    """
    Fetch details for a specific InfraSec level.
    """
    full_curr = await get_infrasec_curriculum()
    for challenge in full_curr:
        if challenge["level"] == level_id:
            return challenge
    return {"error": "Level not found", "status": 404}
