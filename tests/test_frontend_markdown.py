import subprocess
import shutil
from pathlib import Path

import pytest


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_markdown_links_allow_only_safe_protocols():
    module_path = Path(__file__).resolve().parents[1] / "app" / "static" / "js" / "utils" / "markdown.js"
    script = f"""
        import {{ sanitizeMarkdownUrl, formatMarkdown }} from 'file://{module_path}';
        const checks = [
            sanitizeMarkdownUrl('https://example.com') === 'https://example.com',
            sanitizeMarkdownUrl('/relative/path') === '/relative/path',
            sanitizeMarkdownUrl('javascript:alert(1)') === null,
            sanitizeMarkdownUrl('data:text/html,boom') === null,
            sanitizeMarkdownUrl('vbscript:msgbox(1)') === null,
            !formatMarkdown('[x](javascript:alert(1))').includes('href='),
            formatMarkdown('[x](https://example.com)').includes('href="https://example.com"'),
        ];
        if (!checks.every(Boolean)) process.exit(1);
    """
    subprocess.run(["node", "--input-type=module", "-e", script], check=True)
