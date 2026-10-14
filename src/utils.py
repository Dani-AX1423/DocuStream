"""DocuStream Web - Shared utilities and constants for AWS Lambda backend."""

import os
import json
import re
from decimal import Decimal
from typing import Any, Dict, List, Optional
import boto3

# Storage Quota Constants
DEFAULT_MAX_STORAGE_BYTES = 104_857_600  # 100 MB
DEFAULT_MAX_FILE_BYTES = 20_971_520     # 20 MB

# Environment Variables
AWS_REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
os.environ.setdefault("AWS_DEFAULT_REGION", AWS_REGION)
os.environ.setdefault("AWS_REGION", AWS_REGION)

DOCUSTREAM_TABLE = os.environ.get("DOCUSTREAM_TABLE", "DocuStreamData")
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "docustream-web-storage")
MAX_STORAGE_BYTES = int(os.environ.get("MAX_STORAGE_BYTES", DEFAULT_MAX_STORAGE_BYTES))
MAX_FILE_BYTES = int(os.environ.get("MAX_FILE_BYTES", DEFAULT_MAX_FILE_BYTES))


def get_s3_client():
    """Returns a boto3 S3 client with standard signature config."""
    from botocore.config import Config
    return boto3.client("s3", region_name=AWS_REGION, config=Config(signature_version="s3v4"))


def get_dynamodb_resource():
    """Returns a boto3 DynamoDB resource."""
    return boto3.resource("dynamodb", region_name=AWS_REGION)


def get_textract_client():
    """Returns a boto3 Textract client."""
    return boto3.client("textract", region_name=AWS_REGION)


# CORS Headers for API Gateway
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-User-Id",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Content-Type": "application/json",
}

# Regex Patterns
EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
PHONE_REGEX = re.compile(r"\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{3,4}[-.\s]?\d{4}")

# Common English stop words for keyword extraction
STOP_WORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
    "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
    "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't",
    "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't", "have",
    "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself",
    "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into",
    "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't", "my",
    "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our",
    "ours", "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's",
    "should", "shouldn't", "so", "some", "such", "than", "that", "that's", "the", "their", "theirs",
    "them", "themselves", "then", "there", "there's", "these", "they", "they'd", "they'll", "they're",
    "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't",
    "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's",
    "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", "won't",
    "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself",
    "yourselves", "page", "total", "date", "document", "file"
}


class DecimalEncoder(json.JSONEncoder):
    """Custom JSON encoder to serialize DynamoDB Decimal types to float/int."""

    def default(self, obj: Any) -> Any:
        if isinstance(obj, Decimal):
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super().default(obj)


def build_response(status_code: int, body: Any) -> Dict[str, Any]:
    """Builds a standardized API Gateway HTTP response with CORS headers."""
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def get_user_id(event: Dict[str, Any]) -> str:
    """Extracts userId from query string, headers, or default."""
    query_params = event.get("queryStringParameters") or {}
    if "userId" in query_params and query_params["userId"]:
        return str(query_params["userId"]).strip()

    headers = event.get("headers") or {}
    for key, val in headers.items():
        if key.lower() == "x-user-id" and val:
            return str(val).strip()

    return "default-user"


def extract_keywords(text: str, max_keywords: int = 12) -> List[str]:
    """Extracts significant keywords from text based on frequency and heuristics."""
    if not text:
        return []

    words = re.findall(r"\b[A-Za-z][A-Za-z0-9_-]{2,}\b", text.lower())
    freq: Dict[str, int] = {}
    for word in words:
        if word not in STOP_WORDS and len(word) > 2:
            freq[word] = freq.get(word, 0) + 1

    sorted_keywords = sorted(freq.items(), key=lambda x: x[1], reverse=True)
    return [k for k, _ in sorted_keywords[:max_keywords]]


def sanitize_filename(name: str) -> str:
    """Sanitizes filename for safe S3 keys and storage."""
    base = os.path.basename(name)
    clean = re.sub(r"[^a-zA-Z0-9._-]", "_", base)
    return clean or "unnamed_document"
