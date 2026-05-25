from fastapi import APIRouter, Request
from pydantic import BaseModel
import time

class CommandRequest(BaseModel):
    command: str
    challenge_id: str = None

router = APIRouter()

@router.get("/stats")
async def get_system_stats():
    try:
        import psutil
        # Get CPU usage
        cpu_usage = psutil.cpu_percent(interval=None)
        
        # Get Memory usage
        memory = psutil.virtual_memory()
        memory_usage = memory.percent
        
        # Get Network I/O
        net_io = psutil.net_io_counters()
        
        # Get Disk usage
        disk = psutil.disk_usage('/')
        disk_usage = disk.percent
        
        return {
            "cpu": cpu_usage,
            "memory": memory_usage,
            "network": {
                "bytes_sent": net_io.bytes_sent,
                "bytes_recv": net_io.bytes_recv
            },
            "disk": disk_usage,
            "timestamp": time.time()
        }
    except Exception as e:
        return {
            "cpu": 15.0, # Fallback mock
            "memory": 42.0,
            "network": {"bytes_sent": 0, "bytes_recv": 0},
            "disk": 38.4,
            "timestamp": time.time(),
            "error": str(e)
        }

@router.get("/cve/{cwe_id}")
async def get_cves_by_cwe(cwe_id: str):
    # Simulated NVD/CIRCL API Response for demo purposes
    # In a real app, you would make an HTTP request to `https://cve.circl.lu/api/cwe/{cwe_id}`
    cve_db = {
        "cwe89": [
            {"id": "CVE-2023-3453", "summary": "SQL Injection in Login Module"},
            {"id": "CVE-2021-44228", "summary": "Improper neutralization of special elements (JNDI)"}
        ],
        "cwe287": [
            {"id": "CVE-2022-21449", "summary": "Improper verification of cryptographic signature"},
            {"id": "CVE-2020-0601", "summary": "Spoofing vulnerability in CryptoAPI"}
        ],
        "cwe79": [
            {"id": "CVE-2021-23337", "summary": "Cross-site Scripting in Template Engine"},
            {"id": "CVE-2019-11358", "summary": "jQuery UI Cross-site Scripting"}
        ]
    }
    
    return {"cves": cve_db.get(cwe_id, [])}


