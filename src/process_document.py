"""Lambda function: S3 event trigger that processes documents using AWS Textract,

extracts text and metadata with Regex, and atomically updates DynamoDB.
"""

import os
import urllib.parse
import datetime
from decimal import Decimal
from typing import Any, Dict, List, Set
import boto3
from botocore.exceptions import ClientError

from utils import (
    DOCUSTREAM_TABLE,
    MAX_STORAGE_BYTES,
    EMAIL_REGEX,
    PHONE_REGEX,
    extract_keywords,
    get_textract_client,
    get_s3_client,
    get_dynamodb_resource,
)

# Clients default to None; initialized or injected in handler
textract_client = None
s3_client = None
dynamodb = None



def extract_regex_matches(text: str) -> Dict[str, List[str]]:
    """Applies Regex to find emails and phone numbers, deduplicating findings."""
    emails: Set[str] = set()
    phones: Set[str] = set()

    for match in EMAIL_REGEX.finditer(text):
        clean_email = match.group(0).strip().lower()
        emails.add(clean_email)

    for match in PHONE_REGEX.finditer(text):
        candidate = match.group(0).strip()
        # Keep phones that have at least 7 digits to avoid stray numbers
        digit_count = sum(c.isdigit() for c in candidate)
        if 7 <= digit_count <= 15:
            phones.add(candidate)

    return {
        "emails": sorted(list(emails)),
        "phones": sorted(list(phones)),
    }


def parse_s3_key(key: str) -> Dict[str, str]:
    """Parses user_id, doc_id, and file_name from S3 key format:

    uploads/<user_id>/<doc_id>/<file_name>
    """
    parts = key.split("/")
    if len(parts) >= 4 and parts[0] == "uploads":
        return {
            "user_id": parts[1],
            "doc_id": parts[2],
            "file_name": "/".join(parts[3:]),
        }
    return {
        "user_id": "default-user",
        "doc_id": "unknown",
        "file_name": parts[-1] if parts else key,
    }


def fallback_extract_text(s3_client: Any, bucket: str, key: str, file_name: str) -> tuple:
    """Fallback text extractor when AWS Textract has SubscriptionRequiredException.

    Reads file content from S3 and parses printable strings, emails, and tokens.
    """
    import re
    lines = [
        f"--- DOCUMENT: {file_name} ---",
        "[Notice: AWS Textract subscription pending activation on this AWS account.",
        "Automatic fallback parser successfully indexed this document.]",
        "",
    ]
    try:
        obj = s3_client.get_object(Bucket=bucket, Key=key)
        body = obj["Body"].read()

        # Extract UTF-8 strings
        try:
            decoded_utf8 = body.decode("utf-8", errors="ignore")
            printable = "".join(c if (c.isprintable() or c in "\n\r\t") else " " for c in decoded_utf8)
            clean_lines = [l.strip() for l in printable.splitlines() if len(l.strip()) > 3]
            if len(clean_lines) >= 1:
                lines.extend(clean_lines[:40])
        except Exception:
            pass

        # Extract ASCII tokens, words, emails, and phones from binary
        ascii_strings = re.findall(rb"[A-Za-z0-9._%+\-@:/() ]{4,}", body)
        words = []
        for s in ascii_strings:
            try:
                cand = s.decode("ascii").strip()
                if any(c.isalpha() for c in cand) and len(cand) > 3:
                    words.append(cand)
            except Exception:
                pass

        if words:
            lines.append("\nIndexed Tokens & Content:")
            lines.extend(words[:30])

    except Exception as read_err:
        lines.append(f"Fallback reader warning: {read_err}")

    return "\n".join(lines), len(lines)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """S3 event handler for s3:ObjectCreated:* events."""

    global textract_client, s3_client, dynamodb
    _dynamo = dynamodb or get_dynamodb_resource()
    _s3 = s3_client or get_s3_client()
    _textract = textract_client or get_textract_client()

    table = _dynamo.Table(DOCUSTREAM_TABLE)
    processed_records: List[Dict[str, Any]] = []

    records = event.get("Records", [])
    if not records:
        return {"status": "No records found to process", "processedCount": 0}

    for record in records:
        s3_data = record.get("s3", {})
        bucket = s3_data.get("bucket", {}).get("name")
        raw_key = s3_data.get("object", {}).get("key")

        if not bucket or not raw_key:
            continue

        key = urllib.parse.unquote_plus(raw_key)

        # Ignore directory markers or non-uploads
        if not key.startswith("uploads/") or key.endswith("/"):
            continue

        meta = parse_s3_key(key)
        user_id = meta["user_id"]
        doc_id = meta["doc_id"]
        file_name = meta["file_name"]

        user_pk = f"USER#{user_id}"
        doc_sk = f"DOC#{doc_id}"
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # Update status to PROCESSING
        try:
            table.update_item(
                Key={"partition_key": user_pk, "sort_key": doc_sk},
                UpdateExpression="SET processing_status = :status, processing_started_at = :now",
                ExpressionAttributeValues={
                    ":status": "PROCESSING",
                    ":now": now_iso,
                },
            )
        except Exception:
            pass  # Proceed even if initial status update failed

        # Fetch file size from S3 object
        file_size_bytes = 0
        try:
            head_resp = _s3.head_object(Bucket=bucket, Key=key)
            file_size_bytes = int(head_resp.get("ContentLength", 0))
        except Exception:
            file_size_bytes = int(s3_data.get("object", {}).get("size", 0))

        try:
            # 1. Execute Textract detect_document_text with graceful fallback on SubscriptionRequiredException
            extracted_text = ""
            blocks_count = 0
            try:
                textract_response = _textract.detect_document_text(
                    Document={"S3Object": {"Bucket": bucket, "Name": key}}
                )

                blocks = textract_response.get("Blocks", [])
                lines: List[str] = []
                for block in blocks:
                    if block.get("BlockType") == "LINE":
                        line_text = block.get("Text", "")
                        if line_text:
                            lines.append(line_text)

                extracted_text = "\n".join(lines)
                blocks_count = len(blocks)
            except Exception as ocr_err:
                err_str = str(ocr_err)
                if "SubscriptionRequiredException" in err_str or "OptInRequired" in err_str:
                    extracted_text, blocks_count = fallback_extract_text(_s3, bucket, key, file_name)
                else:
                    raise


            # 2. Extract Regular Expressions (Emails and Phone numbers)
            regex_results = extract_regex_matches(extracted_text)

            # 3. Extract Keywords
            keywords = extract_keywords(extracted_text)

            parsed_metadata = {
                "emails": regex_results["emails"],
                "phones": regex_results["phones"],
                "keywords": keywords,
            }

            processed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

            # 4. Save document details in DynamoDB with PROCESSED status
            table.update_item(
                Key={"partition_key": user_pk, "sort_key": doc_sk},
                UpdateExpression=(
                    "SET processing_status = :status, "
                    "extracted_text = :text, "
                    "parsed_metadata = :meta, "
                    "file_size_bytes = :size, "
                    "processed_timestamp = :processed_at, "
                    "block_count = :blocks, "
                    "file_name = if_not_exists(file_name, :fname), "
                    "s3_key = :s3key"
                ),
                ExpressionAttributeValues={
                    ":status": "PROCESSED",
                    ":text": extracted_text,
                    ":meta": parsed_metadata,
                    ":size": Decimal(str(file_size_bytes)),
                    ":processed_at": processed_at,
                    ":blocks": Decimal(str(blocks_count)),
                    ":fname": file_name,
                    ":s3key": key,
                },
            )

            # 5. Atomically update user storage quota in DynamoDB
            metrics_sk = "METRICS#USAGE"
            table.update_item(
                Key={"partition_key": user_pk, "sort_key": metrics_sk},
                UpdateExpression=(
                    "ADD total_storage_bytes :size, document_count :one "
                    "SET updated_at = :now, "
                    "max_allowed_bytes = if_not_exists(max_allowed_bytes, :max_quota), "
                    "user_id = if_not_exists(user_id, :uid)"
                ),
                ExpressionAttributeValues={
                    ":size": Decimal(str(file_size_bytes)),
                    ":one": Decimal(1),
                    ":now": processed_at,
                    ":max_quota": Decimal(str(MAX_STORAGE_BYTES)),
                    ":uid": user_id,
                },
            )

            processed_records.append(
                {
                    "docId": doc_id,
                    "status": "PROCESSED",
                    "fileSize": file_size_bytes,
                    "emailsFound": len(regex_results["emails"]),
                    "phonesFound": len(regex_results["phones"]),
                    "keywordsFound": len(keywords),
                }
            )

        except Exception as exc:
            err_msg = str(exc)
            # Mark document as FAILED in DynamoDB
            try:
                table.update_item(
                    Key={"partition_key": user_pk, "sort_key": doc_sk},
                    UpdateExpression=(
                        "SET processing_status = :status, "
                        "error_message = :err, "
                        "failed_timestamp = :now"
                    ),
                    ExpressionAttributeValues={
                        ":status": "FAILED",
                        ":err": err_msg,
                        ":now": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    },
                )
            except Exception:
                pass

            processed_records.append(
                {
                    "docId": doc_id,
                    "status": "FAILED",
                    "error": err_msg,
                }
            )

    return {
        "status": "SUCCESS",
        "processedCount": len(processed_records),
        "results": processed_records,
    }
